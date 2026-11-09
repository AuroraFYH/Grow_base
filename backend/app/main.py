from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base, AsyncSessionLocal
from app.api import auth, organizations, classification, knowledge
from app.api import llm_config
import app.models.user
import app.models.organization
import app.models.knowledge

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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_knowledge_columns)
    await _rescue_stuck_items()


def _add_missing_knowledge_columns(sync_conn):
    """Small compatibility migration for local databases created before uploads."""
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

@app.get("/health")
async def health():
    return {"status": "ok"}
