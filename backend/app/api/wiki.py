from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.api.llm_config import get_user_llm_config
from app.models.knowledge import KnowledgeItem
from app.models.organization import MemberRole, Organization, OrganizationMember
from app.models.user import User, UserLLMConfig
from app.models.wiki import (
    KnowledgeOperationLog,
    KnowledgeProposal,
    WikiCitation,
    WikiLink,
    WikiPage,
    WikiRevision,
)
from app.schemas.wiki import (
    KnowledgeProposalOut,
    ProposalCreate,
    ProposalReview,
    WikiCitationOut,
    WikiHealthIssue,
    WikiHealthOut,
    WikiLinkOut,
    WikiPageOut,
    WikiRevisionOut,
    WikiVaultSyncOut,
)
from app.services.wiki_compiler import generate_wiki_proposal, normalize_change_set, slugify_title


router = APIRouter(prefix="/api/organizations/{org_id}/wiki", tags=["自生长 Wiki"])


async def require_wiki_member(org_id: int, user_id: int, db: AsyncSession) -> OrganizationMember:
    member = await db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    if not member:
        raise HTTPException(status_code=403, detail="无权访问此知识库")
    return member


async def require_wiki_admin(org_id: int, user_id: int, db: AsyncSession) -> OrganizationMember:
    member = await require_wiki_member(org_id, user_id, db)
    if member.role not in (MemberRole.owner, MemberRole.admin):
        raise HTTPException(status_code=403, detail="只有管理员可以审核和发布 Wiki 更新")
    return member


async def proposal_out(
    proposal: KnowledgeProposal,
    db: AsyncSession,
    vault_sync_status: str | None = None,
    vault_sync_message: str | None = None,
) -> KnowledgeProposalOut:
    source = await db.get(KnowledgeItem, proposal.source_id)
    return KnowledgeProposalOut(
        id=proposal.id,
        organization_id=proposal.organization_id,
        source_id=proposal.source_id,
        source_title=source.title if source else "来源已删除",
        created_by=proposal.created_by,
        reviewed_by=proposal.reviewed_by,
        title=proposal.title,
        summary=proposal.summary,
        instructions=proposal.instructions,
        status=proposal.status,
        change_set=proposal.change_set or {},
        error=proposal.error,
        created_at=proposal.created_at,
        reviewed_at=proposal.reviewed_at,
        updated_at=proposal.updated_at,
        vault_sync_status=vault_sync_status,
        vault_sync_message=vault_sync_message,
    )


async def _vault_payloads(org_id: int, db: AsyncSession, page_ids: list[int] | None = None) -> list[dict]:
    page_query = select(WikiPage).where(
        WikiPage.organization_id == org_id,
        WikiPage.status == "published",
    )
    if page_ids is not None:
        page_query = page_query.where(WikiPage.id.in_(page_ids))
    pages = list((await db.execute(page_query.order_by(WikiPage.title))).scalars().all())
    payloads: list[dict] = []
    for page in pages:
        citation_rows = await db.execute(
            select(WikiCitation, KnowledgeItem.title, KnowledgeItem.source_url)
            .join(KnowledgeItem, KnowledgeItem.id == WikiCitation.source_id)
            .where(WikiCitation.page_id == page.id)
            .order_by(WikiCitation.id)
        )
        link_rows = await db.execute(
            select(WikiLink, WikiPage.title, WikiPage.slug)
            .join(WikiPage, WikiPage.id == WikiLink.target_page_id)
            .where(WikiLink.source_page_id == page.id)
            .order_by(WikiPage.title)
        )
        payloads.append({
            "page": {
                "id": page.id,
                "title": page.title,
                "slug": page.slug,
                "page_type": page.page_type,
                "summary": page.summary,
                "content": page.content,
                "version": page.version,
                "updated_at": page.updated_at,
            },
            "citations": [
                {
                    "source_id": citation.source_id,
                    "source_title": source_title,
                    "source_url": source_url,
                    "claim_text": citation.claim_text,
                    "quote": citation.quote,
                    "locator": citation.locator,
                    "verified": citation.verified,
                }
                for citation, source_title, source_url in citation_rows.all()
            ],
            "links": [
                {
                    "target_title": target_title,
                    "target_slug": target_slug,
                    "label": link.label,
                }
                for link, target_title, target_slug in link_rows.all()
            ],
        })
    return payloads


async def _sync_vault(
    org_id: int,
    user_id: int,
    db: AsyncSession,
    page_ids: list[int] | None = None,
) -> tuple[str, list[str]]:
    config = await db.get(UserLLMConfig, user_id)
    if not config or not config.vault_path:
        raise ValueError("请先在设置中填写 Obsidian Vault 路径")
    org = await db.get(Organization, org_id)
    if not org:
        raise ValueError("知识库不存在")
    from app.services.wiki_vault import write_wiki_pages_to_vault

    files = await write_wiki_pages_to_vault(
        config.vault_path,
        org.name,
        await _vault_payloads(org_id, db, page_ids),
    )
    return str(config.vault_path), files


async def page_out(page: WikiPage, db: AsyncSession, include_details: bool = True) -> WikiPageOut:
    citations: list[WikiCitationOut] = []
    links: list[WikiLinkOut] = []
    if include_details:
        citation_rows = await db.execute(
            select(WikiCitation, KnowledgeItem.title)
            .join(KnowledgeItem, KnowledgeItem.id == WikiCitation.source_id)
            .where(WikiCitation.page_id == page.id)
            .order_by(WikiCitation.id)
        )
        citations = [
            WikiCitationOut(
                id=citation.id,
                source_id=citation.source_id,
                source_title=source_title,
                citation_key=citation.citation_key,
                claim_text=citation.claim_text,
                quote=citation.quote,
                locator=citation.locator,
                verified=citation.verified,
            )
            for citation, source_title in citation_rows.all()
        ]
        link_rows = await db.execute(
            select(WikiLink, WikiPage.title)
            .join(WikiPage, WikiPage.id == WikiLink.target_page_id)
            .where(WikiLink.source_page_id == page.id)
            .order_by(WikiPage.title)
        )
        links = [
            WikiLinkOut(
                id=link.id,
                target_page_id=link.target_page_id,
                target_title=target_title,
                label=link.label,
                context=link.context,
            )
            for link, target_title in link_rows.all()
        ]
    incoming_count = await db.scalar(
        select(func.count()).select_from(WikiLink).where(WikiLink.target_page_id == page.id)
    )
    return WikiPageOut(
        id=page.id,
        organization_id=page.organization_id,
        category_id=page.category_id,
        title=page.title,
        slug=page.slug,
        page_type=page.page_type,
        summary=page.summary,
        content=page.content,
        status=page.status,
        version=page.version,
        ai_managed=page.ai_managed,
        created_by=page.created_by,
        updated_by=page.updated_by,
        created_at=page.created_at,
        updated_at=page.updated_at,
        citations=citations,
        outgoing_links=links,
        incoming_count=incoming_count or 0,
    )


async def unique_slug(org_id: int, title: str, db: AsyncSession) -> str:
    base = slugify_title(title)
    candidate = base
    suffix = 2
    while await db.scalar(
        select(WikiPage.id).where(WikiPage.organization_id == org_id, WikiPage.slug == candidate)
    ):
        candidate = f"{base[:210]}-{suffix}"
        suffix += 1
    return candidate


@router.get("/pages", response_model=list[WikiPageOut])
async def list_pages(
    org_id: int,
    search: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_member(org_id, current_user.id, db)
    query = select(WikiPage).where(
        WikiPage.organization_id == org_id,
        WikiPage.status == "published",
    )
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(WikiPage.title.ilike(pattern), WikiPage.content.ilike(pattern)))
    result = await db.execute(query.order_by(desc(WikiPage.updated_at), desc(WikiPage.id)))
    return [await page_out(page, db, include_details=False) for page in result.scalars().all()]


@router.post("/vault/sync", response_model=WikiVaultSyncOut)
async def sync_wiki_to_vault(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_admin(org_id, current_user.id, db)
    try:
        vault_path, files = await _sync_vault(org_id, current_user.id, db)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return WikiVaultSyncOut(
        status="synced",
        vault_path=str(Path(vault_path).expanduser()),
        written_count=len(files),
        files=files,
    )


@router.get("/pages/{page_id}", response_model=WikiPageOut)
async def get_page(
    org_id: int,
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_member(org_id, current_user.id, db)
    page = await db.scalar(
        select(WikiPage).where(WikiPage.id == page_id, WikiPage.organization_id == org_id)
    )
    if not page:
        raise HTTPException(status_code=404, detail="Wiki 页面不存在")
    return await page_out(page, db)


@router.get("/pages/{page_id}/revisions", response_model=list[WikiRevisionOut])
async def list_revisions(
    org_id: int,
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_member(org_id, current_user.id, db)
    page = await db.scalar(
        select(WikiPage.id).where(WikiPage.id == page_id, WikiPage.organization_id == org_id)
    )
    if not page:
        raise HTTPException(status_code=404, detail="Wiki 页面不存在")
    result = await db.execute(
        select(WikiRevision).where(WikiRevision.page_id == page_id).order_by(desc(WikiRevision.version))
    )
    return [WikiRevisionOut.model_validate(revision) for revision in result.scalars().all()]


@router.get("/proposals", response_model=list[KnowledgeProposalOut])
async def list_proposals(
    org_id: int,
    proposal_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_member(org_id, current_user.id, db)
    query = select(KnowledgeProposal).where(KnowledgeProposal.organization_id == org_id)
    if proposal_status:
        query = query.where(KnowledgeProposal.status == proposal_status)
    result = await db.execute(query.order_by(desc(KnowledgeProposal.created_at), desc(KnowledgeProposal.id)))
    return [await proposal_out(proposal, db) for proposal in result.scalars().all()]


@router.post("/proposals", response_model=KnowledgeProposalOut, status_code=201)
async def create_proposal(
    org_id: int,
    data: ProposalCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await require_wiki_member(org_id, current_user.id, db)
    if member.role == MemberRole.member and (not member.can_add_knowledge or not member.can_use_ai):
        raise HTTPException(status_code=403, detail="管理员已限制你使用 AI 沉淀知识")
    source = await db.scalar(
        select(KnowledgeItem).where(
            KnowledgeItem.id == data.source_id,
            KnowledgeItem.organization_id == org_id,
        )
    )
    if not source:
        raise HTTPException(status_code=404, detail="原始资料不存在")
    if not await get_user_llm_config(current_user.id, db):
        raise HTTPException(status_code=400, detail="请先在 AI 设置中配置可用模型，再生成 Wiki 提案")
    from app.services.content_fetcher import is_github_url

    if source.source_url and is_github_url(source.source_url) and not data.force:
        raise HTTPException(status_code=400, detail="GitHub 资料默认只保留源码引用；确认需要提取项目知识后再继续")
    existing = await db.scalar(
        select(KnowledgeProposal.id).where(
            KnowledgeProposal.source_id == source.id,
            KnowledgeProposal.status.in_(("generating", "pending")),
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="这份资料已经有正在生成或等待审核的提案")
    proposal = KnowledgeProposal(
        organization_id=org_id,
        source_id=source.id,
        created_by=current_user.id,
        title=f"沉淀：{source.title}"[:240],
        instructions=(data.instructions or "").strip() or None,
        status="generating",
        change_set={},
    )
    db.add(proposal)
    await db.commit()
    await db.refresh(proposal)
    background_tasks.add_task(generate_wiki_proposal, proposal.id, current_user.id)
    return await proposal_out(proposal, db)


@router.post("/proposals/{proposal_id}/approve", response_model=KnowledgeProposalOut)
async def approve_proposal(
    org_id: int,
    proposal_id: int,
    data: ProposalReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_admin(org_id, current_user.id, db)
    proposal = await db.scalar(
        select(KnowledgeProposal).where(
            KnowledgeProposal.id == proposal_id,
            KnowledgeProposal.organization_id == org_id,
        )
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="提案不存在")
    if proposal.status != "pending":
        raise HTTPException(status_code=409, detail="只有等待审核的提案可以发布")
    source = await db.get(KnowledgeItem, proposal.source_id)
    if not source:
        raise HTTPException(status_code=409, detail="提案的原始资料已经不存在")

    change_set = data.change_set or proposal.change_set or {}
    if data.change_set is not None:
        from app.services.wiki_compiler import _source_text

        pages_result = await db.execute(select(WikiPage).where(WikiPage.organization_id == org_id))
        existing_pages = {page.id: page for page in pages_result.scalars().all()}
        change_set = normalize_change_set(change_set, await _source_text(source), existing_pages)
    if change_set.get("validation", {}).get("unverified_citation_count", 0):
        raise HTTPException(status_code=400, detail="提案包含无法在原文中核对的引用，请修正或重新生成")
    changes = change_set.get("pages", [])
    if not changes:
        raise HTTPException(status_code=400, detail="这个提案没有可发布的 Wiki 页面变更")

    applied: dict[str, WikiPage] = {}
    changed_pages: list[tuple[WikiPage, dict]] = []
    for change in changes:
        if change.get("action") == "update":
            page = await db.scalar(
                select(WikiPage).where(
                    WikiPage.id == change.get("page_id"),
                    WikiPage.organization_id == org_id,
                )
            )
            if not page:
                raise HTTPException(status_code=409, detail=f"待更新页面不存在：{change.get('title')}")
            page.title = change["title"]
            page.page_type = change.get("page_type") or page.page_type
            page.summary = change.get("summary")
            page.content = change["content"]
            page.version += 1
            page.updated_by = current_user.id
        else:
            page = WikiPage(
                organization_id=org_id,
                category_id=source.category_id,
                title=change["title"],
                slug=await unique_slug(org_id, change["title"], db),
                page_type=change.get("page_type") or "concept",
                summary=change.get("summary"),
                content=change["content"],
                status="published",
                version=1,
                created_by=current_user.id,
                updated_by=current_user.id,
            )
            db.add(page)
            await db.flush()
        applied[page.title] = page
        changed_pages.append((page, change))

    for page, change in changed_pages:
        await db.execute(
            delete(WikiCitation).where(
                WikiCitation.page_id == page.id,
                WikiCitation.source_id == source.id,
            )
        )
        await db.flush()
        for citation in change.get("citations", []):
            db.add(WikiCitation(
                page_id=page.id,
                source_id=source.id,
                citation_key=f"s{source.id}-{citation['key']}",
                claim_text=citation.get("claim"),
                quote=citation["quote"],
                locator=citation.get("locator"),
                verified=bool(citation.get("verified")),
            ))
        db.add(WikiRevision(
            page_id=page.id,
            proposal_id=proposal.id,
            version=page.version,
            title=page.title,
            content=page.content,
            change_summary=change.get("reason") or proposal.summary,
            changed_by=current_user.id,
        ))

    all_pages_result = await db.execute(select(WikiPage).where(WikiPage.organization_id == org_id))
    all_pages = {page.title: page for page in all_pages_result.scalars().all()}
    all_pages.update(applied)
    for page, change in changed_pages:
        for target_title in change.get("links", []):
            target = all_pages.get(target_title)
            if not target or target.id == page.id:
                continue
            exists = await db.scalar(
                select(WikiLink.id).where(
                    WikiLink.source_page_id == page.id,
                    WikiLink.target_page_id == target.id,
                )
            )
            if not exists:
                db.add(WikiLink(
                    organization_id=org_id,
                    source_page_id=page.id,
                    target_page_id=target.id,
                    label="相关知识",
                    context=change.get("reason"),
                ))

    proposal.change_set = change_set
    proposal.status = "approved"
    proposal.reviewed_by = current_user.id
    proposal.reviewed_at = datetime.now(timezone.utc)
    db.add(KnowledgeOperationLog(
        organization_id=org_id,
        proposal_id=proposal.id,
        actor_id=current_user.id,
        operation="proposal_approved",
        details={"page_ids": [page.id for page, _ in changed_pages]},
    ))
    await db.commit()
    await db.refresh(proposal)
    vault_status = "skipped"
    vault_message = "正式 Wiki 已发布；尚未配置 Vault 路径，因此未写入本地文件"
    try:
        vault_path, files = await _sync_vault(org_id, current_user.id, db)
        vault_status = "synced"
        vault_message = f"已同步 {len(files)} 个 Wiki 页面到 {Path(vault_path).expanduser()}"
        db.add(KnowledgeOperationLog(
            organization_id=org_id,
            proposal_id=proposal.id,
            actor_id=current_user.id,
            operation="vault_synced",
            details={"written_count": len(files), "vault_path": str(Path(vault_path).expanduser())},
        ))
    except ValueError:
        pass
    except Exception as exc:
        vault_status = "failed"
        vault_message = f"正式 Wiki 已发布，但 Vault 同步失败：{exc}"
        db.add(KnowledgeOperationLog(
            organization_id=org_id,
            proposal_id=proposal.id,
            actor_id=current_user.id,
            operation="vault_sync_failed",
            details={"error": str(exc)},
        ))
    await db.commit()
    return await proposal_out(proposal, db, vault_status, vault_message)


@router.post("/proposals/{proposal_id}/reject", response_model=KnowledgeProposalOut)
async def reject_proposal(
    org_id: int,
    proposal_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_admin(org_id, current_user.id, db)
    proposal = await db.scalar(
        select(KnowledgeProposal).where(
            KnowledgeProposal.id == proposal_id,
            KnowledgeProposal.organization_id == org_id,
        )
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="提案不存在")
    if proposal.status not in ("pending", "failed"):
        raise HTTPException(status_code=409, detail="当前提案不能拒绝")
    proposal.status = "rejected"
    proposal.reviewed_by = current_user.id
    proposal.reviewed_at = datetime.now(timezone.utc)
    db.add(KnowledgeOperationLog(
        organization_id=org_id,
        proposal_id=proposal.id,
        actor_id=current_user.id,
        operation="proposal_rejected",
        details={},
    ))
    await db.commit()
    await db.refresh(proposal)
    return await proposal_out(proposal, db)


@router.get("/health", response_model=WikiHealthOut)
async def wiki_health(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_wiki_member(org_id, current_user.id, db)
    pages_result = await db.execute(
        select(WikiPage).where(WikiPage.organization_id == org_id, WikiPage.status == "published")
    )
    pages = list(pages_result.scalars().all())
    citation_count = await db.scalar(
        select(func.count()).select_from(WikiCitation).join(WikiPage).where(WikiPage.organization_id == org_id)
    ) or 0
    link_count = await db.scalar(
        select(func.count()).select_from(WikiLink).where(WikiLink.organization_id == org_id)
    ) or 0
    pending_count = await db.scalar(
        select(func.count()).select_from(KnowledgeProposal).where(
            KnowledgeProposal.organization_id == org_id,
            KnowledgeProposal.status.in_(("generating", "pending")),
        )
    ) or 0
    issues: list[WikiHealthIssue] = []
    for page in pages:
        page_citations = await db.scalar(
            select(func.count()).select_from(WikiCitation).where(WikiCitation.page_id == page.id)
        ) or 0
        incoming = await db.scalar(
            select(func.count()).select_from(WikiLink).where(WikiLink.target_page_id == page.id)
        ) or 0
        outgoing = await db.scalar(
            select(func.count()).select_from(WikiLink).where(WikiLink.source_page_id == page.id)
        ) or 0
        unverified = await db.scalar(
            select(func.count()).select_from(WikiCitation).where(
                WikiCitation.page_id == page.id,
                WikiCitation.verified.is_(False),
            )
        ) or 0
        if page_citations == 0:
            issues.append(WikiHealthIssue(type="no_citation", page_id=page.id, title=page.title, detail="页面没有关联任何原始资料"))
        if len(pages) > 1 and incoming + outgoing == 0:
            issues.append(WikiHealthIssue(type="orphan", page_id=page.id, title=page.title, detail="页面没有与其他知识建立关系"))
        if unverified:
            issues.append(WikiHealthIssue(type="unverified_citation", page_id=page.id, title=page.title, detail=f"有 {unverified} 条引用未通过原文核对"))
    penalty = min(100, len(issues) * 12)
    return WikiHealthOut(
        page_count=len(pages),
        citation_count=citation_count,
        link_count=link_count,
        pending_proposal_count=pending_count,
        health_score=max(0, 100 - penalty) if pages else 0,
        issues=issues,
    )
