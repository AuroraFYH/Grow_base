from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_api_key
from app.models.feed import DigestDelivery, DigestSubscription
from app.models.knowledge import KnowledgeItem
from app.models.organization import MemberRole, Organization, OrganizationMember
from app.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def next_run_at(subscription: DigestSubscription, now: datetime | None = None) -> datetime:
    """Calculate the next local send time and store it as a UTC-naive DB value."""
    now_utc = now or datetime.now(timezone.utc)
    try:
        local_now = now_utc.astimezone(ZoneInfo(subscription.timezone))
    except Exception:
        local_now = now_utc.astimezone(ZoneInfo("Asia/Shanghai"))
    candidate = local_now.replace(
        hour=subscription.send_hour,
        minute=subscription.send_minute,
        second=0,
        microsecond=0,
    )
    if candidate <= local_now:
        candidate += timedelta(days=1 if subscription.frequency == "daily" else 7)
    elif subscription.frequency == "weekly" and candidate.weekday() != local_now.weekday():
        candidate += timedelta(days=(local_now.weekday() - candidate.weekday()) % 7)
    return candidate.astimezone(timezone.utc).replace(tzinfo=None)


def _response_content(payload: object) -> tuple[str, str, int]:
    if isinstance(payload, str):
        return "自动简讯", payload.strip(), 0
    if not isinstance(payload, dict):
        raise ValueError("工作流返回的数据不是 JSON 对象")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    title = str(data.get("title") or data.get("name") or "自动简讯")[:240]
    content = data.get("content") or data.get("markdown") or data.get("summary") or data.get("text")
    items = data.get("items") or data.get("articles") or []
    if not content and isinstance(items, list):
        blocks = []
        for index, item in enumerate(items, 1):
            if isinstance(item, dict):
                item_title = item.get("title") or item.get("name") or f"条目 {index}"
                item_text = item.get("summary") or item.get("description") or item.get("content") or ""
                url = item.get("url") or item.get("link") or ""
                blocks.append(f"## {item_title}\n\n{item_text}" + (f"\n\n来源：{url}" if url else ""))
            else:
                blocks.append(str(item))
        content = "\n\n".join(blocks)
    if not content:
        raise ValueError("工作流没有返回 content、markdown 或 items")
    return title, str(content).strip(), len(items) if isinstance(items, list) else 0


async def _send_feishu(webhook_url: str, title: str, content: str) -> None:
    text = f"{title}\n\n{content}"[:3800]
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            webhook_url,
            json={"msg_type": "text", "content": {"text": text}},
        )
        response.raise_for_status()
        if response.content:
            try:
                result = response.json()
                if isinstance(result, dict) and result.get("code") not in (None, 0):
                    raise ValueError(result.get("msg") or "飞书 Webhook 返回失败")
            except json.JSONDecodeError:
                pass


async def run_subscription(subscription_id: int) -> None:
    async with AsyncSessionLocal() as db:
        subscription = await db.get(DigestSubscription, subscription_id)
        if not subscription or not subscription.enabled:
            return
        subscription.last_status = "running"
        subscription.last_error = None
        await db.commit()

        delivery = DigestDelivery(subscription_id=subscription.id, status="running")
        db.add(delivery)
        try:
            user = await db.get(User, subscription.user_id)
            org = await db.get(Organization, subscription.organization_id)
            if not user or not org:
                raise ValueError("订阅关联的用户或知识库不存在")
            member_result = await db.execute(
                select(OrganizationMember).where(
                    OrganizationMember.organization_id == subscription.organization_id,
                    OrganizationMember.user_id == subscription.user_id,
                )
            )
            member = member_result.scalar_one_or_none()
            if not member or (member.role == MemberRole.member and not member.can_add_knowledge):
                raise ValueError("当前用户已无权向此知识库添加自动简讯")
            request_payload = {
                "subscription_id": subscription.id,
                "user": {"id": user.id, "email": user.email, "username": user.username},
                "organization": {"id": org.id, "name": org.name},
                "topics": subscription.topics or [],
                "sources": subscription.sources or [],
                "frequency": subscription.frequency,
                "period": "过去 24 小时" if subscription.frequency == "daily" else "过去 7 天",
                "callback_token": subscription.callback_token,
            }
            headers = {"Content-Type": "application/json"}
            workflow_secret = None
            if subscription.workflow_secret:
                try:
                    workflow_secret = decrypt_api_key(subscription.workflow_secret)
                except Exception:
                    workflow_secret = subscription.workflow_secret
            if workflow_secret:
                headers["Authorization"] = f"Bearer {workflow_secret}"
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(subscription.workflow_url, json=request_payload, headers=headers)
                response.raise_for_status()
                try:
                    payload = response.json()
                except json.JSONDecodeError:
                    payload = response.text
            title, content, item_count = _response_content(payload)
            item = KnowledgeItem(
                organization_id=subscription.organization_id,
                created_by=subscription.user_id,
                title=title,
                source_type="digest",
                source_url=subscription.workflow_url,
                content=content,
                summary=content[:500],
                tags=list(dict.fromkeys(["自动简讯", *(subscription.topics or [])]))[:8],
                status="ready",
                ai_reason="由定时工作流采集并整理",
            )
            db.add(item)
            sent = False
            if subscription.feishu_webhook_url:
                try:
                    feishu_url = decrypt_api_key(subscription.feishu_webhook_url)
                except Exception:
                    feishu_url = subscription.feishu_webhook_url
                await _send_feishu(feishu_url, title, content)
                sent = True
            delivery.status = "success"
            delivery.title = title
            delivery.content = content
            delivery.item_count = item_count
            delivery.sent_to_feishu = sent
            subscription.last_status = "success"
            subscription.last_run_at = _utc_now()
            subscription.next_run_at = next_run_at(subscription)
        except Exception as exc:
            delivery.status = "error"
            delivery.error = str(exc)[:4000]
            subscription.last_status = "error"
            subscription.last_error = str(exc)[:4000]
            subscription.last_run_at = _utc_now()
            subscription.next_run_at = _utc_now() + timedelta(minutes=10)
        await db.commit()


async def run_due_subscriptions() -> None:
    now = _utc_now()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DigestSubscription.id).where(
                DigestSubscription.enabled.is_(True),
                DigestSubscription.next_run_at.is_not(None),
                DigestSubscription.next_run_at <= now,
            )
        )
        due_ids = [row[0] for row in result.all()]
    for subscription_id in due_ids:
        await run_subscription(subscription_id)


async def digest_scheduler_loop() -> None:
    import asyncio

    while True:
        try:
            await run_due_subscriptions()
        except Exception as exc:
            print(f"[digest-scheduler] {exc}")
        await asyncio.sleep(60)
