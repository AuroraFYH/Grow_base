from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class WikiCitationOut(BaseModel):
    id: int
    source_id: int
    source_title: str
    citation_key: str
    claim_text: str | None
    quote: str
    locator: str | None
    verified: bool


class WikiLinkOut(BaseModel):
    id: int
    target_page_id: int
    target_title: str
    label: str | None
    context: str | None


class WikiPageOut(BaseModel):
    id: int
    organization_id: int
    category_id: int | None
    title: str
    slug: str
    page_type: str
    summary: str | None
    content: str
    status: str
    version: int
    ai_managed: bool
    created_by: int
    updated_by: int
    created_at: datetime
    updated_at: datetime | None
    citations: list[WikiCitationOut] = []
    outgoing_links: list[WikiLinkOut] = []
    incoming_count: int = 0


class WikiRevisionOut(BaseModel):
    id: int
    page_id: int
    proposal_id: int | None
    version: int
    title: str
    content: str
    change_summary: str | None
    changed_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ProposalCreate(BaseModel):
    source_id: int
    instructions: str | None = Field(default=None, max_length=2000)
    force: bool = False


class ProposalReview(BaseModel):
    change_set: dict[str, Any] | None = None


class KnowledgeProposalOut(BaseModel):
    id: int
    organization_id: int
    source_id: int
    source_title: str
    created_by: int
    reviewed_by: int | None
    title: str
    summary: str | None
    instructions: str | None
    status: str
    change_set: dict[str, Any]
    error: str | None
    created_at: datetime
    reviewed_at: datetime | None
    updated_at: datetime | None
    vault_sync_status: Literal["synced", "skipped", "failed"] | None = None
    vault_sync_message: str | None = None


class WikiVaultSyncOut(BaseModel):
    status: Literal["synced"]
    vault_path: str
    written_count: int
    files: list[str]


class WikiHealthIssue(BaseModel):
    type: Literal["no_citation", "orphan", "unverified_citation", "duplicate_title"]
    page_id: int | None = None
    title: str
    detail: str


class WikiHealthOut(BaseModel):
    page_count: int
    citation_count: int
    link_count: int
    pending_proposal_count: int
    health_score: int
    issues: list[WikiHealthIssue]
