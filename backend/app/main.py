from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base, AsyncSessionLocal
from app.api import auth, organizations, classification, knowledge, feeds, wiki
from app.api import llm_config
import app.models.user
import app.models.organization
import app.models.knowledge
import app.models.feed
import app.models.wiki

_digest_scheduler_task = None

app = FastAPI(title="GrowBase API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    global _digest_scheduler_task
    import asyncio
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_run_compatibility_migrations)
    await _rescue_stuck_items()
    from app.services.digest_service import digest_scheduler_loop
    _digest_scheduler_task = asyncio.create_task(digest_scheduler_loop())


@app.on_event("shutdown")
async def shutdown():
    global _digest_scheduler_task
    if _digest_scheduler_task:
        _digest_scheduler_task.cancel()
        _digest_scheduler_task = None


def _run_compatibility_migrations(sync_conn):
    """Small compatibility migrations for local databases without Alembic history."""
    import secrets
    import string
    from sqlalchemy import inspect

    inspector = inspect(sync_conn)
    existing = {column["name"] for column in inspector.get_columns("knowledge_items")}
    additions = {
        "file_path": "VARCHAR(2000)",
        "file_name": "VARCHAR(500)",
        "file_mime_type": "VARCHAR(200)",
        "file_size": "INTEGER",
        "processing_instructions": "TEXT",
    }
    for name, sql_type in additions.items():
        if name not in existing:
            sync_conn.exec_driver_sql(
                f"ALTER TABLE knowledge_items ADD COLUMN {name} {sql_type}"
            )

    org_columns = {column["name"] for column in inspector.get_columns("organizations")}
    if "invite_code" not in org_columns:
        sync_conn.exec_driver_sql("ALTER TABLE organizations ADD COLUMN invite_code VARCHAR(12)")
    if "invite_enabled" not in org_columns:
        sync_conn.exec_driver_sql("ALTER TABLE organizations ADD COLUMN invite_enabled BOOLEAN NOT NULL DEFAULT 1")

    alphabet = string.ascii_uppercase + string.digits
    rows = sync_conn.exec_driver_sql("SELECT id, invite_code FROM organizations").fetchall()
    used = {row[1] for row in rows if row[1]}
    for org_id, invite_code in rows:
        if invite_code:
            continue
        while True:
            code = "".join(secrets.choice(alphabet) for _ in range(8))
            if code not in used:
                used.add(code)
                break
        sync_conn.exec_driver_sql(
            "UPDATE organizations SET invite_code = ? WHERE id = ?",
            (code, org_id),
        )
    sync_conn.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_organizations_invite_code ON organizations (invite_code)"
    )

    member_columns = {column["name"] for column in inspector.get_columns("organization_members")}
    for name in ("can_add_knowledge", "can_delete_own", "can_use_ai"):
        if name not in member_columns:
            sync_conn.exec_driver_sql(
                f"ALTER TABLE organization_members ADD COLUMN {name} BOOLEAN NOT NULL DEFAULT 1"
            )
    sync_conn.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_org_member_idx ON organization_members (organization_id, user_id)"
    )

async def _rescue_stuck_items():
    """On startup, re-queue any items stuck in 'processing' from a previous run."""
    import asyncio
    from sqlalchemy import select
    from app.models.knowledge import KnowledgeItem
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(KnowledgeItem).where(KnowledgeItem.status == "processing")
        )
        stuck = result.scalars().all()
        if not stuck:
            return
        print(f"[startup] rescuing {len(stuck)} stuck processing items")
        from app.api.knowledge import _process_item_with_llm
        tasks = [
            _process_item_with_llm(item.id, item.created_by, item.organization_id)
            for item in stuck
        ]
        asyncio.gather(*tasks)

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(classification.router)
app.include_router(knowledge.router)
app.include_router(llm_config.router)
app.include_router(feeds.router)
app.include_router(wiki.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
