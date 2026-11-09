from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import encrypt_api_key, get_current_user
from app.models.feed import DigestDelivery, DigestSubscription
from app.models.organization import MemberRole, OrganizationMember
from app.models.user import User
from app.schemas.feed import (
    DigestDeliveryOut,
    DigestSubscriptionCreate,
    DigestSubscriptionOut,
    DigestSubscriptionUpdate,
)
from app.services.digest_service import next_run_at, run_subscription

router = APIRouter(prefix="/api/feeds", tags=["自动简讯"])


async def require_org_member(org_id: int, user_id: int, db: AsyncSession) -> OrganizationMember:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="无权使用此知识库")
    if member.role == MemberRole.member and not member.can_add_knowledge:
        raise HTTPException(status_code=403, detail="管理员已限制你向此知识库添加内容")
    return member


def to_out(subscription: DigestSubscription) -> DigestSubscriptionOut:
    def utc_value(value):
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value

    return DigestSubscriptionOut(
        id=subscription.id,
        organization_id=subscription.organization_id,
        name=subscription.name,
        topics=subscription.topics or [],
        sources=subscription.sources or [],
        frequency=subscription.frequency,
        send_hour=subscription.send_hour,
        send_minute=subscription.send_minute,
        timezone=subscription.timezone,
        workflow_url=subscription.workflow_url,
        has_workflow_secret=bool(subscription.workflow_secret),
        has_feishu_webhook=bool(subscription.feishu_webhook_url),
        enabled=subscription.enabled,
        last_run_at=utc_value(subscription.last_run_at),
        next_run_at=utc_value(subscription.next_run_at),
        last_status=subscription.last_status,
        last_error=subscription.last_error,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
    )


@router.get("", response_model=list[DigestSubscriptionOut])
async def list_subscriptions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DigestSubscription)
        .where(DigestSubscription.user_id == current_user.id)
        .order_by(desc(DigestSubscription.created_at))
    )
    return [to_out(item) for item in result.scalars().all()]


@router.post("", response_model=DigestSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    data: DigestSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_org_member(data.organization_id, current_user.id, db)
    subscription = DigestSubscription(
        user_id=current_user.id,
        organization_id=data.organization_id,
        name=data.name.strip(),
        topics=data.topics,
        sources=data.sources,
        frequency=data.frequency,
        send_hour=data.send_hour,
        send_minute=data.send_minute,
        timezone=data.timezone,
        workflow_url=data.workflow_url.strip(),
        workflow_secret=encrypt_api_key(data.workflow_secret.strip()) if data.workflow_secret else None,
        feishu_webhook_url=encrypt_api_key(data.feishu_webhook_url.strip()) if data.feishu_webhook_url else None,
        callback_token=secrets.token_urlsafe(32),
        enabled=data.enabled,
    )
    subscription.next_run_at = next_run_at(subscription)
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    return to_out(subscription)


@router.patch("/{subscription_id}", response_model=DigestSubscriptionOut)
async def update_subscription(
    subscription_id: int,
    data: DigestSubscriptionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subscription = await db.get(DigestSubscription, subscription_id)
    if not subscription or subscription.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="订阅不存在")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if isinstance(value, str):
            value = value.strip()
        if key in ("workflow_secret", "feishu_webhook_url"):
            value = encrypt_api_key(value) if value else None
        setattr(subscription, key, value)
    if any(key in changes for key in ("frequency", "send_hour", "send_minute", "timezone", "enabled")):
        subscription.next_run_at = next_run_at(subscription) if subscription.enabled else None
    await db.commit()
    await db.refresh(subscription)
    return to_out(subscription)


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(subscription_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subscription = await db.get(DigestSubscription, subscription_id)
    if not subscription or subscription.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="订阅不存在")
    await db.delete(subscription)
    await db.commit()


@router.post("/{subscription_id}/run", response_model=DigestSubscriptionOut)
async def run_subscription_now(subscription_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subscription = await db.get(DigestSubscription, subscription_id)
    if not subscription or subscription.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="订阅不存在")
    await run_subscription(subscription_id)
    await db.refresh(subscription)
    return to_out(subscription)


@router.get("/{subscription_id}/deliveries", response_model=list[DigestDeliveryOut])
async def list_deliveries(subscription_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subscription = await db.get(DigestSubscription, subscription_id)
    if not subscription or subscription.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="订阅不存在")
    result = await db.execute(
        select(DigestDelivery)
        .where(DigestDelivery.subscription_id == subscription_id)
        .order_by(desc(DigestDelivery.created_at))
        .limit(20)
    )
    return result.scalars().all()
