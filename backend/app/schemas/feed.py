from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class DigestSubscriptionCreate(BaseModel):
    organization_id: int
    name: str = Field(min_length=1, max_length=120)
    topics: List[str] = Field(min_length=1, max_length=20)
    sources: List[str] = Field(default_factory=lambda: ["news", "social", "github"])
    frequency: str = Field(default="daily", pattern="^(daily|weekly)$")
    send_hour: int = Field(default=9, ge=0, le=23)
    send_minute: int = Field(default=0, ge=0, le=59)
    timezone: str = Field(default="Asia/Shanghai", max_length=80)
    workflow_url: str = Field(min_length=8, max_length=2000)
    workflow_secret: Optional[str] = Field(default=None, max_length=500)
    feishu_webhook_url: Optional[str] = Field(default=None, max_length=2000)
    enabled: bool = True

    @field_validator("topics", "sources")
    @classmethod
    def clean_list(cls, values: List[str]) -> List[str]:
        cleaned = [value.strip() for value in values if value and value.strip()]
        if not cleaned:
            raise ValueError("至少填写一项")
        return cleaned


class DigestSubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    topics: Optional[List[str]] = Field(default=None, max_length=20)
    sources: Optional[List[str]] = None
    frequency: Optional[str] = Field(default=None, pattern="^(daily|weekly)$")
    send_hour: Optional[int] = Field(default=None, ge=0, le=23)
    send_minute: Optional[int] = Field(default=None, ge=0, le=59)
    timezone: Optional[str] = Field(default=None, max_length=80)
    workflow_url: Optional[str] = Field(default=None, min_length=8, max_length=2000)
    workflow_secret: Optional[str] = Field(default=None, max_length=500)
    feishu_webhook_url: Optional[str] = Field(default=None, max_length=2000)
    enabled: Optional[bool] = None

    @field_validator("topics", "sources")
    @classmethod
    def clean_list(cls, values):
        if values is None:
            return values
        cleaned = [value.strip() for value in values if value and value.strip()]
        if not cleaned:
            raise ValueError("至少填写一项")
        return cleaned


class DigestSubscriptionOut(BaseModel):
    id: int
    organization_id: int
    name: str
    topics: List[str]
    sources: List[str]
    frequency: str
    send_hour: int
    send_minute: int
    timezone: str
    workflow_url: str
    has_workflow_secret: bool
    has_feishu_webhook: bool
    enabled: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    last_status: Optional[str]
    last_error: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


class DigestDeliveryOut(BaseModel):
    id: int
    subscription_id: int
    status: str
    title: Optional[str]
    content: Optional[str]
    item_count: int
    sent_to_feishu: bool
    error: Optional[str]
    created_at: datetime

