from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.organization import Category, ClassificationConfig, MemberRole, OrganizationMember
from app.models.user import User
from app.schemas.classification import (
    ClassificationConfigOut,
    ClassificationConfigUpdate,
    ClassificationTemplateOut,
)
from app.services.classification_templates import get_template, list_templates

router = APIRouter(tags=["分类体系"])


async def get_member_role(org_id: int, user_id: int, db: AsyncSession) -> MemberRole | None:
    result = await db.execute(
        select(OrganizationMember.role).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def require_org_member(org_id: int, user: User, db: AsyncSession) -> MemberRole:
    role = await get_member_role(org_id, user.id, db)
    if not role:
        raise HTTPException(status_code=403, detail="无权访问")
    return role


async def require_admin(org_id: int, user: User, db: AsyncSession) -> None:
    role = await require_org_member(org_id, user, db)
    if role not in (MemberRole.owner, MemberRole.admin):
        raise HTTPException(status_code=403, detail="需要管理员权限")


def make_config_out(
    organization_id: int,
    config: ClassificationConfig | None,
) -> ClassificationConfigOut:
    if not config:
        return ClassificationConfigOut(organization_id=organization_id)
    template = get_template(config.template_key)
    default_prompt = template["default_prompt"] if template else ""
    return ClassificationConfigOut(
        organization_id=organization_id,
        template_key=config.template_key,
        template_name=template["name"] if template else config.template_key,
        custom_prompt=config.custom_prompt,
        effective_prompt=config.custom_prompt or default_prompt,
        updated_at=config.updated_at,
    )


async def clear_categories(org_id: int, db: AsyncSession) -> None:
    result = await db.execute(select(Category).where(Category.organization_id == org_id))
    categories = list(result.scalars().all())
    parent_map = {category.id: category.parent_id for category in categories}

    def depth(category_id: int) -> int:
        current = parent_map.get(category_id)
        count = 0
        while current is not None:
            count += 1
            current = parent_map.get(current)
        return count

    for category in sorted(categories, key=lambda item: depth(item.id), reverse=True):
        await db.delete(category)
    await db.flush()


async def seed_categories(
    org_id: int,
    nodes: list[dict],
    db: AsyncSession,
    parent_id: int | None = None,
) -> None:
    for order_index, node in enumerate(nodes):
        category = Category(
            organization_id=org_id,
            parent_id=parent_id,
            name=node["name"],
            description=node.get("description"),
            order_index=order_index,
        )
        db.add(category)
        await db.flush()
        await seed_categories(org_id, node.get("children", []), db, category.id)


@router.get("/api/classification/templates", response_model=List[ClassificationTemplateOut])
async def get_classification_templates() -> list[dict]:
    return list_templates()


@router.get("/api/organizations/{org_id}/classification", response_model=ClassificationConfigOut)
async def get_classification_config(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassificationConfigOut:
    await require_org_member(org_id, current_user, db)
    config = await db.get(ClassificationConfig, org_id)
    return make_config_out(org_id, config)


@router.put("/api/organizations/{org_id}/classification", response_model=ClassificationConfigOut)
async def update_classification_config(
    org_id: int,
    data: ClassificationConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassificationConfigOut:
    await require_admin(org_id, current_user, db)

    template = get_template(data.template_key)
    if not template:
        raise HTTPException(status_code=400, detail="分类模板不存在")
    custom_prompt = data.custom_prompt.strip() if data.custom_prompt else None
    if data.template_key == "custom" and not custom_prompt:
        raise HTTPException(status_code=400, detail="自定义模板需要填写分类提示词")

    config = await db.get(ClassificationConfig, org_id)
    category_count = await db.scalar(
        select(Category.id).where(Category.organization_id == org_id).limit(1)
    )
    has_categories = category_count is not None
    switching_template = not config or config.template_key != data.template_key

    if has_categories and data.template_key != "custom" and switching_template and not data.replace_existing:
        raise HTTPException(
            status_code=409,
            detail="当前目录已有内容，应用新模板会替换现有目录，请确认替换后再试",
        )

    if data.template_key != "custom" and (not has_categories or data.replace_existing):
        if data.replace_existing:
            await clear_categories(org_id, db)
        await seed_categories(org_id, template["categories"], db)

    if not config:
        config = ClassificationConfig(organization_id=org_id, template_key=data.template_key)
        db.add(config)
    else:
        config.template_key = data.template_key
    config.custom_prompt = custom_prompt
    await db.commit()
    await db.refresh(config)
    return make_config_out(org_id, config)
