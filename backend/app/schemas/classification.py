from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TemplateCategory(BaseModel):
    name: str
    description: Optional[str] = None
    children: List["TemplateCategory"] = []


TemplateCategory.model_rebuild()


class ClassificationTemplateOut(BaseModel):
    key: str
    name: str
    summary: str
    description: str
    suitable_for: str
    default_prompt: str
    categories: List[TemplateCategory]


class ClassificationConfigUpdate(BaseModel):
    template_key: str = Field(min_length=1, max_length=50)
    custom_prompt: Optional[str] = Field(default=None, max_length=10000)
    replace_existing: bool = False


class ClassificationConfigOut(BaseModel):
    organization_id: int
    template_key: Optional[str] = None
    template_name: Optional[str] = None
    custom_prompt: Optional[str] = None
    effective_prompt: Optional[str] = None
    updated_at: Optional[datetime] = None

