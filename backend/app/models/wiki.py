from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.core.database import Base


class WikiPage(Base):
    __tablename__ = "wiki_pages"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_wiki_page_org_slug"),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    title = Column(String(240), nullable=False)
    slug = Column(String(260), nullable=False)
    page_type = Column(String(30), nullable=False, default="concept")
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="published")
    version = Column(Integer, nullable=False, default=1)
    ai_managed = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WikiCitation(Base):
    __tablename__ = "wiki_citations"
    __table_args__ = (
        UniqueConstraint("page_id", "citation_key", name="uq_wiki_citation_page_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("knowledge_items.id", ondelete="CASCADE"), nullable=False, index=True)
    citation_key = Column(String(80), nullable=False)
    claim_text = Column(Text, nullable=True)
    quote = Column(Text, nullable=False)
    locator = Column(String(240), nullable=True)
    verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WikiLink(Base):
    __tablename__ = "wiki_links"
    __table_args__ = (
        UniqueConstraint("source_page_id", "target_page_id", name="uq_wiki_link_pages"),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    source_page_id = Column(Integer, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    target_page_id = Column(Integer, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(100), nullable=True)
    context = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class KnowledgeProposal(Base):
    __tablename__ = "knowledge_proposals"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("knowledge_items.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String(240), nullable=False)
    summary = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="generating", index=True)
    change_set = Column(JSON, nullable=False, default=dict)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WikiRevision(Base):
    __tablename__ = "wiki_revisions"
    __table_args__ = (
        UniqueConstraint("page_id", "version", name="uq_wiki_revision_page_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    proposal_id = Column(Integer, ForeignKey("knowledge_proposals.id", ondelete="SET NULL"), nullable=True)
    version = Column(Integer, nullable=False)
    title = Column(String(240), nullable=False)
    content = Column(Text, nullable=False)
    change_summary = Column(Text, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class KnowledgeOperationLog(Base):
    __tablename__ = "knowledge_operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    proposal_id = Column(Integer, ForeignKey("knowledge_proposals.id", ondelete="SET NULL"), nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    operation = Column(String(50), nullable=False, index=True)
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
