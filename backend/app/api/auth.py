from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.models.user import User
from app.models.organization import Organization, OrganizationMember, MemberRole
from app.schemas.user import UserCreate, UserLogin, UserOut, Token, LocalBootstrap

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/local/bootstrap", response_model=LocalBootstrap)
async def local_bootstrap(db: AsyncSession = Depends(get_db)):
    """Create or reuse the anonymous local identity used by personal mode."""
    result = await db.execute(select(User).where(User.email == "local@growbase.local"))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            email="local@growbase.local",
            username="本地用户",
            hashed_password=hash_password("local-only-session"),
        )
        db.add(user)
        await db.flush()

    result = await db.execute(
        select(Organization).where(
            Organization.owner_id == user.id,
            Organization.name == "我的个人知识库",
        )
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        workspace = Organization(
            name="我的个人知识库",
            description="本机个人知识空间，打开即可使用。",
            owner_id=user.id,
        )
        db.add(workspace)
        await db.flush()
        db.add(OrganizationMember(
            organization_id=workspace.id,
            user_id=user.id,
            role=MemberRole.owner,
        ))

    await db.commit()
    await db.refresh(user)
    await db.refresh(workspace)
    token = create_access_token({"sub": str(user.id)})
    return LocalBootstrap(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
        workspace_id=workspace.id,
        workspace_name=workspace.name,
    )

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已注册")

    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该用户名已被占用")

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user=UserOut.model_validate(user))

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
