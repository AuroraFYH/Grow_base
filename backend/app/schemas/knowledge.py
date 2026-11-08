from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


class KnowledgeCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=240)
    source_url: Optional[str] = Field(default=None, max_length=2000)
    content: Optional[str] = Field(default=None, max_length=200000)
    instructions: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_source(self):
        if not (self.source_url and self.source_url.strip()) and not (self.content and self.content.strip()):
            raise ValueError("请填写知识链接或正文内容")
        return self


class KnowledgeOut(BaseModel):
    id: int
    title: str
    source_type: str
    source_url: Optional[str]
    content: Optional[str]
    summary: Optional[str]
    tags: List[str]
    status: str
    ai_reason: Optional[str]
    category_id: Optional[int]
    category_name: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)


class ChatResponse(BaseModel):
    message: ChatMessageOut
    citations: List[KnowledgeOut] = []
    action: Optional[str] = None
