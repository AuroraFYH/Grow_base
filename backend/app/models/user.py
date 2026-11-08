from sqlalchemy import Column, ForeignKey, Integer, String, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    memberships = relationship("OrganizationMember", back_populates="user", cascade="all, delete-orphan")
    llm_config = relationship("UserLLMConfig", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserLLMConfig(Base):
    __tablename__ = "user_llm_configs"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    provider = Column(String(50), nullable=False, default="openai")
    base_url = Column(String(500), nullable=True)
    model_name = Column(String(100), nullable=False, default="gpt-4o-mini")
    encrypted_api_key = Column(Text, nullable=True)
    vault_path = Column(String(1000), nullable=True)
    cookies_file = Column(String(1000), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="llm_config")
