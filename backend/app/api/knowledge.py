from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, get_db
from app.core.security import get_current_user
from app.models.knowledge import ChatMessage, KnowledgeItem
from app.models.organization import Category, ClassificationConfig, MemberRole, OrganizationMember
from app.models.user import User
from app.schemas.knowledge import (
    ChatMessageOut,
    ChatRequest,
    ChatResponse,
    KnowledgeCreate,
    KnowledgeOut,
)
from app.api.llm_config import get_user_llm_config
from app.services.knowledge_ai import (
    answer_from_knowledge,
    classify_and_summarize,
    classify_text,
    generate_video_tutorial,
    requests_video_tutorial,
    summarize,
)

router = APIRouter(tags=["知识库"])


async def require_member(org_id: int, user: User, db: AsyncSession) -> MemberRole:
    result = await db.execute(
        select(OrganizationMember.role).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=403, detail="无权访问此知识库")
    return role


async def categories_for_org(org_id: int, db: AsyncSession) -> list[Category]:
    result = await db.execute(
        select(Category)
        .where(Category.organization_id == org_id)
        .order_by(Category.order_index, Category.id)
        .options(selectinload(Category.children))
    )
    return list(result.scalars().unique().all())


def to_out(item: KnowledgeItem) -> KnowledgeOut:
    return KnowledgeOut(
        id=item.id,
        title=item.title,
        source_type=item.source_type,
        source_url=item.source_url,
        content=item.content,
        summary=item.summary,
        tags=item.tags or [],
        status=item.status,
        ai_reason=item.ai_reason,
        category_id=item.category_id,
        category_name=item.category.name if item.category else None,
        created_by=item.created_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _should_write_to_vault(source_url: str | None, status: str) -> bool:
    """Only persist successfully processed, non-code sources as knowledge notes."""
    from app.services.content_fetcher import is_github_url

    return status in {"ready", "review"} and not (
        source_url and is_github_url(source_url)
    )


async def _process_item_with_llm(
    item_id: int,
    user_id: int,
    org_id: int,
    user_instructions: str | None = None,
) -> None:
    """Background task: fetch content, classify, summarize. Uses its own DB session."""
    async with AsyncSessionLocal() as db:
        item = await db.get(KnowledgeItem, item_id, options=[selectinload(KnowledgeItem.category)])
        if not item:
            return

        try:
            llm_creds = await get_user_llm_config(user_id, db)
            processing_reason = ""

            # Step 1: fetch source content. Tutorial requests use the dedicated
            # video transcription pipeline even when the user typed instructions.
            if item.source_type == "video_tutorial":
                from app.models.user import UserLLMConfig
                from app.services.content_fetcher import fetch_video_transcript, is_video_url

                if not item.source_url or not is_video_url(item.source_url):
                    raise ValueError("生成视频教程需要受支持的 YouTube、B站、抖音或 TikTok 链接")

                cfg_result = await db.execute(
                    select(UserLLMConfig).where(UserLLMConfig.user_id == user_id)
                )
                user_cfg = cfg_result.scalar_one_or_none()
                existing_transcript = (
                    item.content
                    if item.content and not item.content.lstrip().startswith("# ")
                    else None
                )
                if existing_transcript:
                    transcript = existing_transcript
                else:
                    fetched_title, transcript = await fetch_video_transcript(
                        item.source_url,
                        cookies_file=user_cfg.cookies_file if user_cfg else None,
                    )
                    if not item.title or item.title == item.source_url[:240]:
                        item.title = fetched_title[:240] or item.title

                api_key, base_url, model_name = llm_creds or (None, None, None)
                item.content = await generate_video_tutorial(
                    title=item.title,
                    transcript=transcript,
                    source_url=item.source_url,
                    user_instructions=user_instructions,
                    api_key=api_key,
                    base_url=base_url,
                    model_name=model_name,
                )
                processing_reason = "已提取视频字幕并生成文字版教程。"
            elif item.source_url and not item.content:
                try:
                    from app.services.content_fetcher import fetch_content
                    fetched_title, fetched_text = await fetch_content(item.source_url)
                    if not item.title or item.title == item.source_url[:240]:
                        item.title = fetched_title[:240] or item.title
                    item.content = fetched_text
                except Exception as e:
                    item.ai_reason = f"链接内容抓取失败：{e}"

            categories = await categories_for_org(org_id, db)

            # Step 2: get classification config
            config = await db.get(ClassificationConfig, org_id)
            classification_prompt = ""
            if config:
                from app.services.classification_templates import get_template
                template = get_template(config.template_key)
                classification_prompt = config.custom_prompt or (template["default_prompt"] if template else "")

            # Step 3: try LLM, fallback to rules
            if llm_creds and item.content:
                api_key, base_url, model_name = llm_creds
                result = await classify_and_summarize(
                    title=item.title,
                    content=item.content,
                    source_url=item.source_url,
                    categories=categories,
                    classification_prompt=classification_prompt,
                    api_key=api_key,
                    base_url=base_url,
                    model_name=model_name,
                )
                item.category_id = result["category"].id if result["category"] else None
                item.summary = result.get("summary") or summarize(item.title, item.content, item.source_url)
                item.tags = result.get("tags", [])
                item.ai_reason = "".join((processing_reason, result.get("reason", "")))
                item.status = "review" if result.get("confidence", 1) < 0.5 else "ready"
            else:
                # Rule-based fallback
                result = classify_text(item.title, item.content or "", item.source_url, categories)
                item.category_id = result["category"].id if result["category"] else None
                item.summary = summarize(item.title, item.content, item.source_url)
                item.tags = result["tags"]
                item.ai_reason = (
                    processing_reason
                    + result["reason"]
                    + ("（未配置 AI，使用关键词匹配）" if not llm_creds else "")
                )
                item.status = "review" if result["confidence"] < 0.5 else "ready"

            if item.source_type == "video_tutorial":
                item.tags = list(dict.fromkeys(["视频教程", *(item.tags or [])]))[:8]

        except Exception as e:
            item.status = "error"
            item.ai_reason = f"处理失败：{e}"

        await db.commit()

        # Step 4: write to Obsidian vault if configured
        try:
            from sqlalchemy import select as sa_select
            from app.models.user import UserLLMConfig
            from app.models.organization import Organization
            cfg_result = await db.execute(sa_select(UserLLMConfig).where(UserLLMConfig.user_id == user_id))
            llm_cfg = cfg_result.scalar_one_or_none()
            if llm_cfg and llm_cfg.vault_path:
                org_result = await db.execute(sa_select(Organization).where(Organization.id == org_id))
                org = org_result.scalar_one_or_none()
                refreshed = await db.get(KnowledgeItem, item_id, options=[selectinload(KnowledgeItem.category)])
                if (
                    refreshed
                    and org
                    and _should_write_to_vault(refreshed.source_url, refreshed.status)
                ):
                    from app.services.vault_writer import write_to_vault
                    from app.core.security import decrypt_api_key
                    api_key_plain = decrypt_api_key(llm_cfg.encrypted_api_key) if llm_cfg.encrypted_api_key else None
                    config_obj = await db.get(ClassificationConfig, org_id)
                    cls_prompt = ""
                    if config_obj:
                        from app.services.classification_templates import get_template
                        tmpl = get_template(config_obj.template_key)
                        cls_prompt = config_obj.custom_prompt or (tmpl["default_prompt"] if tmpl else "")
                    await write_to_vault(
                        vault_path=llm_cfg.vault_path,
                        org_name=org.name,
                        item_title=refreshed.title,
                        item_summary=refreshed.summary,
                        item_tags=refreshed.tags or [],
                        category_name=refreshed.category.name if refreshed.category else None,
                        source_url=refreshed.source_url,
                        source_type=refreshed.source_type,
                        content=refreshed.content,
                        classification_prompt=cls_prompt,
                        extra_link_instructions=user_instructions or "",
                        api_key=api_key_plain,
                        base_url=llm_cfg.base_url,
                        model_name=llm_cfg.model_name,
                    )
        except Exception as exc:
            # The database item remains usable, but surface vault failures so the
            # user does not mistake a successful classification for a file write.
            failed_item = await db.get(KnowledgeItem, item_id)
            if failed_item:
                prefix = f"{failed_item.ai_reason} " if failed_item.ai_reason else ""
                failed_item.ai_reason = f"{prefix}知识库文件写入失败：{exc}"
                await db.commit()


@router.get("/api/organizations/{org_id}/knowledge", response_model=List[KnowledgeOut])
async def list_knowledge(
    org_id: int,
    search: str | None = Query(default=None, max_length=100),
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KnowledgeOut]:
    await require_member(org_id, current_user, db)
    query = (
        select(KnowledgeItem)
        .where(KnowledgeItem.organization_id == org_id)
        .options(selectinload(KnowledgeItem.category))
        .order_by(desc(KnowledgeItem.created_at))
    )
    if category_id is not None:
        query = query.where(KnowledgeItem.category_id == category_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                KnowledgeItem.title.ilike(pattern),
                KnowledgeItem.content.ilike(pattern),
                KnowledgeItem.summary.ilike(pattern),
            )
        )
    result = await db.execute(query)
    return [to_out(item) for item in result.scalars().all()]


@router.post("/api/organizations/{org_id}/knowledge", response_model=KnowledgeOut, status_code=201)
async def create_knowledge(
    org_id: int,
    data: KnowledgeCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KnowledgeOut:
    await require_member(org_id, current_user, db)
    source_url = data.source_url.strip() if data.source_url else None
    content = data.content.strip() if data.content else None
    instructions = data.instructions.strip() if data.instructions else None
    title = (data.title or "").strip() or (source_url or "未命名知识")[:240]

    from app.services.content_fetcher import is_video_url

    instruction_text = "\n".join(part for part in (instructions, content) if part)
    is_video = bool(source_url and is_video_url(source_url))
    tutorial_requested = is_video
    if is_video and requests_video_tutorial(instruction_text) and not instructions:
        # Backward compatibility: older forms used the content box for requests.
        instructions = content
        content = None

    item = KnowledgeItem(
        organization_id=org_id,
        created_by=current_user.id,
        title=title,
        source_type=(
            "video_tutorial"
            if tutorial_requested
            else "link" if source_url and not content else "note"
        ),
        source_url=source_url,
        content=content,
        status="processing",
        tags=[],
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    background_tasks.add_task(
        _process_item_with_llm,
        item_id=item.id,
        user_id=current_user.id,
        org_id=org_id,
        user_instructions=instructions,
    )
    return KnowledgeOut(
        id=item.id,
        title=item.title,
        source_type=item.source_type,
        source_url=item.source_url,
        content=item.content,
        summary=item.summary,
        tags=[],
        status="processing",
        ai_reason=item.ai_reason,
        category_id=item.category_id,
        category_name=None,
        created_by=item.created_by,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.post("/api/organizations/{org_id}/knowledge/reprocess", response_model=List[KnowledgeOut])
async def reprocess_knowledge(
    org_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KnowledgeOut]:
    await require_member(org_id, current_user, db)
    result = await db.execute(
        select(KnowledgeItem)
        .where(KnowledgeItem.organization_id == org_id)
        .options(selectinload(KnowledgeItem.category))
    )
    items = list(result.scalars().all())
    from app.services.content_fetcher import is_video_url

    for item in items:
        if item.source_url and is_video_url(item.source_url):
            item.source_type = "video_tutorial"
        item.status = "processing"
    await db.commit()

    for item in items:
        background_tasks.add_task(
            _process_item_with_llm,
            item_id=item.id,
            user_id=current_user.id,
            org_id=org_id,
        )
    return [to_out(item) for item in items]


@router.delete("/api/organizations/{org_id}/knowledge/{knowledge_id}", status_code=204, response_model=None)
async def delete_knowledge(
    org_id: int,
    knowledge_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    role = await require_member(org_id, current_user, db)
    result = await db.execute(
        select(KnowledgeItem).where(
            KnowledgeItem.id == knowledge_id,
            KnowledgeItem.organization_id == org_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="知识不存在")
    if role == MemberRole.member and item.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="只能删除自己添加的知识")
    await db.delete(item)
    await db.commit()


@router.get("/api/organizations/{org_id}/ai/history", response_model=List[ChatMessageOut])
async def chat_history(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatMessageOut]:
    await require_member(org_id, current_user, db)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.organization_id == org_id, ChatMessage.user_id == current_user.id)
        .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
        .limit(50)
    )
    messages = list(reversed(result.scalars().all()))
    return [ChatMessageOut.model_validate(item) for item in messages]


@router.post("/api/organizations/{org_id}/ai/chat", response_model=ChatResponse)
async def chat(
    org_id: int,
    data: ChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    await require_member(org_id, current_user, db)
    user_message = ChatMessage(
        organization_id=org_id,
        user_id=current_user.id,
        role="user",
        content=data.message.strip(),
    )
    db.add(user_message)
    await db.flush()

    action = None
    citations: list[KnowledgeItem] = []
    citation_outs: list[KnowledgeOut] = []

    # ── vault link rewrite ──
    vault_link_keywords = ["重新生成链接", "重新链接", "更新链接", "更新 vault", "写入 vault", "生成 wikilink"]
    if any(kw in data.message for kw in vault_link_keywords):
        from sqlalchemy import select as sa_select
        from app.models.user import UserLLMConfig
        from app.models.organization import Organization
        cfg_result = await db.execute(sa_select(UserLLMConfig).where(UserLLMConfig.user_id == current_user.id))
        llm_cfg = cfg_result.scalar_one_or_none()
        if not llm_cfg or not llm_cfg.vault_path:
            answer = "你还没有在设置中配置 Obsidian vault 路径，无法写入文件。"
        else:
            items_result = await db.execute(
                select(KnowledgeItem)
                .where(KnowledgeItem.organization_id == org_id, KnowledgeItem.status != "processing")
                .options(selectinload(KnowledgeItem.category))
                .order_by(desc(KnowledgeItem.created_at))
                .limit(20)
            )
            items_to_link = list(items_result.scalars().all())
            citation_outs = [to_out(i) for i in items_to_link[:5]]

            org_result = await db.execute(
                select(KnowledgeItem.organization_id).where(KnowledgeItem.organization_id == org_id).limit(1)
            )
            from app.models.organization import Organization as OrgModel
            org_obj_result = await db.execute(sa_select(OrgModel).where(OrgModel.id == org_id))
            org_obj = org_obj_result.scalar_one_or_none()

            config_obj = await db.get(ClassificationConfig, org_id)
            cls_prompt = ""
            if config_obj:
                from app.services.classification_templates import get_template
                tmpl = get_template(config_obj.template_key)
                cls_prompt = config_obj.custom_prompt or (tmpl["default_prompt"] if tmpl else "")

            from app.core.security import decrypt_api_key
            api_key_plain = decrypt_api_key(llm_cfg.encrypted_api_key) if llm_cfg.encrypted_api_key else None

            # extra instructions = everything in the message after the keyword
            extra = re.sub(r"重新生成链接|重新链接|更新链接|更新\s*vault|写入\s*vault|生成\s*wikilink", "", data.message).strip()

            success, failed = 0, 0
            for item in items_to_link:
                try:
                    from app.services.vault_writer import rewrite_vault_links
                    await rewrite_vault_links(
                        vault_path=llm_cfg.vault_path,
                        org_name=org_obj.name if org_obj else str(org_id),
                        item_title=item.title,
                        category_name=item.category.name if item.category else None,
                        extra_link_instructions=extra,
                        classification_prompt=cls_prompt,
                        item_summary=item.summary,
                        item_tags=item.tags or [],
                        api_key=api_key_plain,
                        base_url=llm_cfg.base_url,
                        model_name=llm_cfg.model_name,
                    )
                    success += 1
                except Exception:
                    failed += 1

            answer = f"已为 {success} 条知识重新生成 vault 链接。"
            if failed:
                answer += f"（{failed} 条未找到对应文件，可能尚未写入 vault）"
            if extra:
                answer += f"\n补充要求已应用：{extra}"
        action = "vault_relink"

    # ── reprocess ──
    elif any(word in data.message for word in ["重新分类", "重新整理", "整理全部", "整理知识"]):
        result = await db.execute(
            select(KnowledgeItem)
            .where(KnowledgeItem.organization_id == org_id)
            .options(selectinload(KnowledgeItem.category))
        )
        items = list(result.scalars().all())
        citation_outs = [to_out(item) for item in items[:5]]
        for item in items:
            item.status = "processing"
        await db.commit()
        for item in items:
            background_tasks.add_task(_process_item_with_llm, item.id, current_user.id, org_id)
        answer = f"已触发对 {len(items)} 条知识的重新整理，请稍后刷新查看结果。"
        action = "reprocess"

    # ── normal chat ──
    else:
        words = [w for w in _search_words(data.message) if len(w) > 1]
        query = (
            select(KnowledgeItem)
            .where(KnowledgeItem.organization_id == org_id)
            .options(selectinload(KnowledgeItem.category))
            .order_by(desc(KnowledgeItem.created_at))
        )
        if words:
            conditions = []
            for word in words[:8]:
                pattern = f"%{word}%"
                conditions.extend([
                    KnowledgeItem.title.ilike(pattern),
                    KnowledgeItem.content.ilike(pattern),
                    KnowledgeItem.summary.ilike(pattern),
                ])
            query = query.where(or_(*conditions))
        result = await db.execute(query.limit(8))
        citations = list(result.scalars().all())
        citation_outs = [to_out(item) for item in citations]

        llm_creds = await get_user_llm_config(current_user.id, db)
        if llm_creds:
            api_key, base_url, model_name = llm_creds
            context = "\n".join(
                f"[{item.title}]（{item.category.name if item.category else '未分类'}）: {item.summary or ''}"
                for item in citations
            ) or "（知识库暂无内容）"
            try:
                from app.services.llm_client import chat_completion
                answer = await chat_completion(
                    api_key=api_key,
                    model_name=model_name,
                    base_url=base_url,
                    messages=[
                        {"role": "system", "content": f"你是用户的知识库助手。以下是知识库中与问题相关的内容：\n{context}\n\n请根据以上内容回答用户的问题，若无相关内容请如实说明。"},
                        {"role": "user", "content": data.message},
                    ],
                    max_tokens=800,
                )
            except Exception as e:
                answer = answer_from_knowledge(data.message, citations) + f"\n\n（AI 助手暂时不可用：{e}）"
        else:
            answer = answer_from_knowledge(data.message, citations) + "\n\n提示：在设置中配置 AI 模型后，可获得更智能的回答。"

    assistant_message = ChatMessage(
        organization_id=org_id,
        user_id=current_user.id,
        role="assistant",
        content=answer,
    )
    db.add(assistant_message)
    await db.commit()
    await db.refresh(assistant_message)
    return ChatResponse(
        message=ChatMessageOut.model_validate(assistant_message),
        citations=citation_outs,
        action=action,
    )


def _search_words(value: str) -> list[str]:
    import re
    return re.findall(r"[一-鿿]{2,}|[a-zA-Z][a-zA-Z0-9_-]{1,}", value.lower())
