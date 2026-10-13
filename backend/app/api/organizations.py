from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.organization import Organization, OrganizationMember, Category, MemberRole
from app.schemas.organization import (
    OrganizationCreate, OrganizationUpdate, OrganizationOut,
    InviteMember, MemberOut, CategoryCreate, CategoryUpdate, CategoryOut
)
from typing import List

router = APIRouter(prefix="/api/organizations", tags=["组织"])

async def get_member_role(org_id: int, user_id: int, db: AsyncSession) -> MemberRole | None:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member else None

async def require_admin(org_id: int, user: User, db: AsyncSession):
    role = await get_member_role(org_id, user.id, db)
    if role not in (MemberRole.owner, MemberRole.admin):
        raise HTTPException(status_code=403, detail="需要管理员权限")

# --- 组织 CRUD ---

@router.post("", response_model=OrganizationOut, status_code=201)
async def create_organization(
    data: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org = Organization(name=data.name, description=data.description, owner_id=current_user.id)
    db.add(org)
    await db.flush()

    membership = OrganizationMember(organization_id=org.id, user_id=current_user.id, role=MemberRole.owner)
    db.add(membership)
    await db.commit()
    await db.refresh(org)

    return OrganizationOut(id=org.id, name=org.name, description=org.description,
                           owner_id=org.owner_id, created_at=org.created_at, member_count=1)

@router.get("", response_model=List[OrganizationOut])
async def list_my_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    orgs = result.scalars().all()

    out = []
    for org in orgs:
        count_result = await db.execute(
            select(func.count()).where(OrganizationMember.organization_id == org.id)
        )
        count = count_result.scalar()
        out.append(OrganizationOut(id=org.id, name=org.name, description=org.description,
                                   owner_id=org.owner_id, created_at=org.created_at, member_count=count))
    return out

@router.get("/{org_id}", response_model=OrganizationOut)
async def get_organization(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    role = await get_member_role(org_id, current_user.id, db)
    if not role:
        raise HTTPException(status_code=404, detail="组织不存在或无权访问")

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    count_result = await db.execute(select(func.count()).where(OrganizationMember.organization_id == org_id))
    count = count_result.scalar()
    return OrganizationOut(id=org.id, name=org.name, description=org.description,
                           owner_id=org.owner_id, created_at=org.created_at, member_count=count)

@router.patch("/{org_id}", response_model=OrganizationOut)
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await require_admin(org_id, current_user, db)
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
    return OrganizationOut(id=org.id, name=org.name, description=org.description,
                           owner_id=org.owner_id, created_at=org.created_at, member_count=count)

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
        MemberOut(id=m.id, user_id=m.user_id, username=u.username,
                  email=u.email, role=m.role, joined_at=m.joined_at)
        for m, u in rows
    ]

@router.post("/{org_id}/members", response_model=MemberOut, status_code=201)
async def invite_member(
    org_id: int,
    data: InviteMember,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await require_admin(org_id, current_user, db)

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
    return MemberOut(id=member.id, user_id=member.user_id, username=target_user.username,
                     email=target_user.email, role=member.role, joined_at=member.joined_at)

@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await require_admin(org_id, current_user, db)
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if not member or member.role == MemberRole.owner:
        raise HTTPException(status_code=400, detail="无法移除该成员")
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
