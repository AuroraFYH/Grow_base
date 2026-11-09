from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class DigestSubscription(Base):
    """A user's scheduled topic brief delivered by an external workflow."""

    __tablename__ = "digest_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    topics = Column(JSON, nullable=False, default=list)
    sources = Column(JSON, nullable=False, default=list)
    frequency = Column(String(20), nullable=False, default="daily")
    send_hour = Column(Integer, nullable=False, default=9)
    send_minute = Column(Integer, nullable=False, default=0)
    timezone = Column(String(80), nullable=False, default="Asia/Shanghai")
    workflow_url = Column(Text, nullable=False)
    workflow_secret = Column(Text, nullable=True)
    feishu_webhook_url = Column(Text, nullable=True)
    callback_token = Column(String(64), nullable=False, unique=True, index=True)
    enabled = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_status = Column(String(20), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DigestDelivery(Base):
    __tablename__ = "digest_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("digest_subscriptions.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False)
    title = Column(String(240), nullable=True)
    content = Column(Text, nullable=True)
    item_count = Column(Integer, nullable=False, default=0)
    sent_to_feishu = Column(Boolean, nullable=False, default=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
