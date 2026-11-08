from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, encrypt_api_key, decrypt_api_key
from app.models.user import User, UserLLMConfig
from app.schemas.llm_config import LLMConfigOut, LLMConfigUpdate

router = APIRouter(prefix="/api/user", tags=["用户设置"])


@router.get("/llm-config", response_model=LLMConfigOut)
async def get_llm_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LLMConfigOut:
    config = await db.get(UserLLMConfig, current_user.id)
    if not config:
        return LLMConfigOut(provider="openai", base_url=None, model_name="gpt-4o-mini", has_api_key=False)
    return LLMConfigOut(
        provider=config.provider,
        base_url=config.base_url,
        model_name=config.model_name,
        has_api_key=bool(config.encrypted_api_key),
        vault_path=config.vault_path,
        cookies_file=config.cookies_file,
        updated_at=config.updated_at,
    )


@router.put("/llm-config", response_model=LLMConfigOut)
async def update_llm_config(
    data: LLMConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LLMConfigOut:
    config = await db.get(UserLLMConfig, current_user.id)
    if not config:
        config = UserLLMConfig(user_id=current_user.id)
        db.add(config)

    config.provider = data.provider
    config.base_url = data.base_url.strip() if data.base_url else None
    config.model_name = data.model_name.strip()
    if data.api_key and data.api_key.strip():
        config.encrypted_api_key = encrypt_api_key(data.api_key.strip())
    config.vault_path = data.vault_path.strip() if data.vault_path else None
    config.cookies_file = data.cookies_file.strip() if data.cookies_file else None

    await db.commit()
    await db.refresh(config)
    return LLMConfigOut(
        provider=config.provider,
        base_url=config.base_url,
        model_name=config.model_name,
        has_api_key=bool(config.encrypted_api_key),
        vault_path=config.vault_path,
        cookies_file=config.cookies_file,
        updated_at=config.updated_at,
    )


async def get_user_llm_config(user_id: int, db: AsyncSession) -> tuple[str, str | None, str] | None:
    """Returns (api_key, base_url, model_name) or None if not configured."""
    from sqlalchemy import select
    result = await db.execute(select(UserLLMConfig).where(UserLLMConfig.user_id == user_id))
    config = result.scalar_one_or_none()
    if not config or not config.encrypted_api_key:
        return None
    try:
        api_key = decrypt_api_key(config.encrypted_api_key)
    except Exception:
        return None
    return api_key, config.base_url, config.model_name
