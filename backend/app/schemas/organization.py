from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.models.organization import MemberRole

class OrganizationCreate(BaseModel):
    name: str
    description: Optional[str] = None

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class MemberOut(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    role: MemberRole
    joined_at: datetime

    model_config = {"from_attributes": True}

class OrganizationOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_id: int
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}

class InviteMember(BaseModel):
    email: str
    role: MemberRole = MemberRole.member

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    order_index: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None

class CategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    parent_id: Optional[int]
    order_index: int
    children: List["CategoryOut"] = []

    model_config = {"from_attributes": True}

CategoryOut.model_rebuild()
