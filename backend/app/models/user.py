from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Identity, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import EMAIL_MAX_LENGTH
from app.models.base import Base, str_enum


class Role(StrEnum):
    CUSTOMER = "customer"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # We normalise emails to lower case; the DB guarantees "A@x.com" and "a@x.com" can't both exist.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    email: Mapped[str] = mapped_column(String(EMAIL_MAX_LENGTH), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(str_enum(Role, "role"), default=Role.CUSTOMER)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
