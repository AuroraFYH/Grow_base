from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class LLMConfigUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}

    provider: str = Field(default="openai", max_length=50)
    base_url: Optional[str] = Field(default=None, max_length=500)
    model_name: str = Field(max_length=100)
    api_key: Optional[str] = Field(default=None, max_length=500)
    vault_path: Optional[str] = Field(default=None, max_length=1000)
    cookies_file: Optional[str] = Field(default=None, max_length=1000)


class LLMConfigOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    provider: str
    base_url: Optional[str]
    model_name: str
    has_api_key: bool
    vault_path: Optional[str] = None
    cookies_file: Optional[str] = None
    updated_at: Optional[datetime] = None
