from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.feed import DigestDelivery, DigestSubscription
from app.models.knowledge import ChatMessage, KnowledgeItem
from app.models.wiki import (
    KnowledgeOperationLog,
    KnowledgeProposal,
    WikiCitation,
    WikiLink,
    WikiPage,
    WikiRevision,
)
from app.models.organization import Organization, OrganizationMember, Category, MemberRole, new_invite_code
from app.schemas.organization import (
    OrganizationCreate, OrganizationUpdate, OrganizationOut,
    InviteMember, InviteCodeUpdate, JoinOrganization, MemberOut, MemberUpdate,
    CategoryCreate, CategoryUpdate, CategoryOut
)
from typing import List

router = APIRouter(prefix="/api/organizations", tags=["组织"])

async def get_membership(org_id: int, user_id: int, db: AsyncSession) -> OrganizationMember | None:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    return member


async def get_member_role(org_id: int, user_id: int, db: AsyncSession) -> MemberRole | None:
    member = await get_membership(org_id, user_id, db)
    return member.role if member else None

async def require_admin(org_id: int, user: User, db: AsyncSession):
    member = await get_membership(org_id, user.id, db)
    if not member or member.role not in (MemberRole.owner, MemberRole.admin):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return member


def member_out(member: OrganizationMember, user: User) -> MemberOut:
    return MemberOut(
        id=member.id,
        user_id=member.user_id,
        username=user.username,
        email=user.email,
        role=member.role,
        can_add_knowledge=member.can_add_knowledge,
        can_delete_own=member.can_delete_own,
        can_use_ai=member.can_use_ai,
        joined_at=member.joined_at,
    )


def organization_out(
    org: Organization,
    membership: OrganizationMember | MemberRole,
    member_count: int,
) -> OrganizationOut:
    role = membership.role if isinstance(membership, OrganizationMember) else membership
    is_admin = role in (MemberRole.owner, MemberRole.admin)
    return OrganizationOut(
        id=org.id,
        name=org.name,
        description=org.description,
        owner_id=org.owner_id,
        created_at=org.created_at,
        member_count=member_count,
        current_user_role=role,
        invite_code=org.invite_code if is_admin else None,
        invite_enabled=org.invite_enabled,
        can_add_knowledge=True if is_admin or not isinstance(membership, OrganizationMember) else membership.can_add_knowledge,
        can_delete_own=True if is_admin or not isinstance(membership, OrganizationMember) else membership.can_delete_own,
        can_use_ai=True if is_admin or not isinstance(membership, OrganizationMember) else membership.can_use_ai,
    )


async def unique_invite_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = new_invite_code()
        exists = await db.scalar(select(Organization.id).where(Organization.invite_code == code))
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="邀请码生成失败，请重试")

# --- 组织 CRUD ---

@router.post("", response_model=OrganizationOut, status_code=201)
async def create_organization(
    data: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org = Organization(
        name=data.name,
        description=data.description,
        owner_id=current_user.id,
        invite_code=await unique_invite_code(db),
    )
    db.add(org)
    await db.flush()

    membership = OrganizationMember(organization_id=org.id, user_id=current_user.id, role=MemberRole.owner)
    db.add(membership)
    await db.commit()
    await db.refresh(org)

    return organization_out(org, MemberRole.owner, 1)

@router.get("", response_model=List[OrganizationOut])
async def list_my_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Organization, OrganizationMember)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    rows = result.all()

    out = []
    for org, membership in rows:
        count_result = await db.execute(
            select(func.count()).where(OrganizationMember.organization_id == org.id)
        )
        count = count_result.scalar()
        out.append(organization_out(org, membership, count))
    return out

@router.get("/{org_id}", response_model=OrganizationOut)
async def get_organization(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    membership = await get_membership(org_id, current_user.id, db)
    if not membership:
        raise HTTPException(status_code=404, detail="组织不存在或无权访问")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    count_result = await db.execute(select(func.count()).where(OrganizationMember.organization_id == org_id))
    count = count_result.scalar()
    return organization_out(org, membership, count)

@router.patch("/{org_id}", response_model=OrganizationOut)
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    membership = await require_admin(org_id, current_user, db)
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if data.name is not None:
        org.name = data.name
    if data.description is not None:
        org.description = data.description
    await db.commit()
    await db.refresh(org)
    count_result = await db.execute(select(func.count()).where(OrganizationMember.organization_id == org_id))
    count = count_result.scalar()
    return organization_out(org, membership, count)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a knowledge base and all organization-owned data."""
    membership = await get_membership(org_id, current_user.id, db)
    org = await db.get(Organization, org_id)
    if not membership or not org:
        raise HTTPException(status_code=404, detail="知识库不存在或无权访问")
    if membership.role != MemberRole.owner or org.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有知识库创建者可以删除知识库")

    # Keep upload files for cleanup after the transaction succeeds. Vault files
    # are intentionally left untouched because they may contain user notes.
    file_result = await db.execute(
        select(KnowledgeItem.file_path).where(
            KnowledgeItem.organization_id == org_id,
            KnowledgeItem.file_path.is_not(None),
        )
    )
    file_paths = [path for (path,) in file_result.all() if path]

    wiki_page_ids = list(
        await db.scalars(select(WikiPage.id).where(WikiPage.organization_id == org_id))
    )
    wiki_proposal_ids = list(
        await db.scalars(select(KnowledgeProposal.id).where(KnowledgeProposal.organization_id == org_id))
    )
    subscription_ids = list(
        await db.scalars(select(DigestSubscription.id).where(DigestSubscription.organization_id == org_id))
    )

    if wiki_page_ids:
        await db.execute(delete(WikiRevision).where(WikiRevision.page_id.in_(wiki_page_ids)))
        await db.execute(delete(WikiCitation).where(WikiCitation.page_id.in_(wiki_page_ids)))
        await db.execute(
            delete(WikiLink).where(
                (WikiLink.source_page_id.in_(wiki_page_ids))
                | (WikiLink.target_page_id.in_(wiki_page_ids))
            )
        )
    if wiki_proposal_ids:
        await db.execute(delete(KnowledgeOperationLog).where(KnowledgeOperationLog.proposal_id.in_(wiki_proposal_ids)))
    await db.execute(delete(KnowledgeOperationLog).where(KnowledgeOperationLog.organization_id == org_id))
    await db.execute(delete(KnowledgeProposal).where(KnowledgeProposal.organization_id == org_id))
    await db.execute(delete(WikiPage).where(WikiPage.organization_id == org_id))

    if subscription_ids:
        await db.execute(delete(DigestDelivery).where(DigestDelivery.subscription_id.in_(subscription_ids)))
    await db.execute(delete(DigestSubscription).where(DigestSubscription.organization_id == org_id))
    await db.execute(delete(ChatMessage).where(ChatMessage.organization_id == org_id))
    await db.execute(delete(KnowledgeItem).where(KnowledgeItem.organization_id == org_id))
    await db.execute(delete(ClassificationConfig).where(ClassificationConfig.organization_id == org_id))

    # Clear the self-referencing parent links before removing categories.
    await db.execute(
        Category.__table__.update()
        .where(Category.organization_id == org_id)
        .values(parent_id=None)
    )
    await db.execute(delete(Category).where(Category.organization_id == org_id))
    await db.execute(delete(OrganizationMember).where(OrganizationMember.organization_id == org_id))
    await db.delete(org)
    await db.commit()

    from pathlib import Path
    from app.services.file_storage import UPLOAD_ROOT

    upload_root = UPLOAD_ROOT.resolve()
    for file_path in file_paths:
        path = Path(file_path).expanduser().resolve()
        if path.is_relative_to(upload_root) and path.is_file():
            path.unlink()


@router.post("/join", response_model=OrganizationOut)
async def join_organization(
    data: JoinOrganization,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    code = data.invite_code.strip().upper()
    result = await db.execute(
        select(Organization).where(
            Organization.invite_code == code,
            Organization.invite_enabled.is_(True),
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="邀请码无效或已停用")
    existing = await get_membership(org.id, current_user.id, db)
    if existing:
        raise HTTPException(status_code=400, detail="你已经是该知识库成员")
    member = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role=MemberRole.member,
    )
    db.add(member)
    await db.commit()
    count = await db.scalar(
        select(func.count()).where(OrganizationMember.organization_id == org.id)
    )
    return organization_out(org, MemberRole.member, count or 1)


@router.post("/{org_id}/invite-code/regenerate", response_model=OrganizationOut)
async def regenerate_invite_code(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await require_admin(org_id, current_user, db)
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="知识库不存在")
    org.invite_code = await unique_invite_code(db)
    org.invite_enabled = True
    await db.commit()
    await db.refresh(org)
    count = await db.scalar(
        select(func.count()).where(OrganizationMember.organization_id == org_id)
    )
    return organization_out(org, membership, count or 0)


@router.patch("/{org_id}/invite-code", response_model=OrganizationOut)
async def update_invite_code(
    org_id: int,
    data: InviteCodeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await require_admin(org_id, current_user, db)
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="知识库不存在")
    org.invite_enabled = data.enabled
    await db.commit()
    await db.refresh(org)
    count = await db.scalar(
        select(func.count()).where(OrganizationMember.organization_id == org_id)
    )
    return organization_out(org, membership, count or 0)

# --- 成员管理 ---

@router.get("/{org_id}/members", response_model=List[MemberOut])
async def list_members(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    role = await get_member_role(org_id, current_user.id, db)
    if not role:
        raise HTTPException(status_code=403, detail="无权访问")

    result = await db.execute(
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.organization_id == org_id)
    )
    rows = result.all()
    return [
        member_out(m, u)
        for m, u in rows
    ]

@router.post("/{org_id}/members", response_model=MemberOut, status_code=201)
async def invite_member(
    org_id: int,
    data: InviteMember,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    actor = await require_admin(org_id, current_user, db)

    if data.role == MemberRole.owner:
        raise HTTPException(status_code=400, detail="不能邀请其他所有者")
    if data.role == MemberRole.admin and actor.role != MemberRole.owner:
        raise HTTPException(status_code=403, detail="只有创建者可以添加管理员")

    result = await db.execute(select(User).where(User.email == data.email))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    existing = await get_member_role(org_id, target_user.id, db)
    if existing:
        raise HTTPException(status_code=400, detail="该用户已是成员")

    member = OrganizationMember(organization_id=org_id, user_id=target_user.id, role=data.role)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member_out(member, target_user)


@router.patch("/{org_id}/members/{user_id}", response_model=MemberOut)
async def update_member(
    org_id: int,
    user_id: int,
    data: MemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    actor = await require_admin(org_id, current_user, db)
    result = await db.execute(
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="成员不存在")
    member, target_user = row
    if member.role == MemberRole.owner:
        raise HTTPException(status_code=400, detail="不能修改创建者权限")
    if actor.role == MemberRole.admin and member.role == MemberRole.admin:
        raise HTTPException(status_code=403, detail="管理员不能修改其他管理员")
    if data.role is not None:
        if actor.role != MemberRole.owner:
            raise HTTPException(status_code=403, detail="只有创建者可以设置管理员")
        if data.role == MemberRole.owner:
            raise HTTPException(status_code=400, detail="不能转移创建者身份")
        member.role = data.role
    for field in ("can_add_knowledge", "can_delete_own", "can_use_ai"):
        value = getattr(data, field)
        if value is not None:
            setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return member_out(member, target_user)

@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    actor = await require_admin(org_id, current_user, db)
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if not member or member.role == MemberRole.owner:
        raise HTTPException(status_code=400, detail="无法移除该成员")
    if member.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能在这里移除自己")
    if actor.role == MemberRole.admin and member.role == MemberRole.admin:
        raise HTTPException(status_code=403, detail="管理员不能移除其他管理员")
    await db.delete(member)
    await db.commit()

# --- 目录结构管理 ---

@router.get("/{org_id}/categories", response_model=List[CategoryOut])
async def get_categories(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    role = await get_member_role(org_id, current_user.id, db)
    if not role:
        raise HTTPException(status_code=403, detail="无权访问")

    result = await db.execute(
        select(Category)
        .where(Category.organization_id == org_id, Category.parent_id == None)
        .order_by(Category.order_index)
        .options(selectinload(Category.children).selectinload(Category.children))
    )
    return result.scalars().all()

@router.post("/{org_id}/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    org_id: int,
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await require_admin(org_id, current_user, db)

    cat = Category(
        organization_id=org_id,
        name=data.name,
        description=data.description,
        parent_id=data.parent_id,
        order_index=data.order_index,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut(id=cat.id, name=cat.name, description=cat.description,
                       parent_id=cat.parent_id, order_index=cat.order_index, children=[])

@router.patch("/{org_id}/categories/{cat_id}", response_model=CategoryOut)
async def update_category(
    org_id: int,
    cat_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await require_admin(org_id, current_user, db)
    result = await db.execute(
        select(Category).where(Category.id == cat_id, Category.organization_id == org_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if data.name is not None:
        cat.name = data.name
    if data.description is not None:
        cat.description = data.description
    if data.order_index is not None:
        cat.order_index = data.order_index
    await db.commit()
    await db.refresh(cat)
    return CategoryOut(id=cat.id, name=cat.name, description=cat.description,
                       parent_id=cat.parent_id, order_index=cat.order_index, children=[])

@router.delete("/{org_id}/categories/{cat_id}", status_code=204)
async def delete_category(
    org_id: int,
    cat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await require_admin(org_id, current_user, db)
    result = await db.execute(
        select(Category).where(Category.id == cat_id, Category.organization_id == org_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    await db.delete(cat)
    await db.commit()
