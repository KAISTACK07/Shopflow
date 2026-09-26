from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CHAR, DateTime, ForeignKey, Identity, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import IDEMPOTENCY_KEY_MAX_LENGTH
from app.models.base import Base


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        # Keys are scoped per user: two users picking the same UUID can't collide.
        # This constraint is also what serialises two concurrent requests with the same key.
        UniqueConstraint("user_id", "key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    key: Mapped[str] = mapped_column(String(IDEMPOTENCY_KEY_MAX_LENGTH))
    request_hash: Mapped[str] = mapped_column(CHAR(64))  # SHA-256 hex of the request body
    # NULL only inside the transaction that is still processing the request (the row is inserted first).
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
