from sqlalchemy import Boolean, Column, Integer, String, DateTime, Text, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
import secrets
import string
from app.core.database import Base


def new_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))

class MemberRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    invite_code = Column(String(12), nullable=False, unique=True, index=True, default=new_invite_code)
    invite_enabled = Column(Boolean, nullable=False, default=True)

    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="organization", cascade="all, delete-orphan")
    classification_config = relationship(
        "ClassificationConfig", back_populates="organization", uselist=False,
        cascade="all, delete-orphan"
    )
    knowledge_items = relationship("KnowledgeItem", back_populates="organization", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="organization", cascade="all, delete-orphan")

class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member"),)

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default=MemberRole.member, nullable=False)
    can_add_knowledge = Column(Boolean, nullable=False, default=True)
    can_delete_own = Column(Boolean, nullable=False, default=True)
    can_use_ai = Column(Boolean, nullable=False, default=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="memberships")

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="categories")
    parent = relationship("Category", remote_side="Category.id", back_populates="children")
    children = relationship("Category", back_populates="parent", cascade="all, delete-orphan")


class ClassificationConfig(Base):
    __tablename__ = "classification_configs"

    organization_id = Column(Integer, ForeignKey("organizations.id"), primary_key=True)
    template_key = Column(String(50), nullable=False)
    custom_prompt = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="classification_config")
