"""Idempotency keys: make a retried request return the first result instead of doing the work twice.

The key row is inserted at the START of the request's transaction, and the response is saved into it before
COMMIT. So the key, the work (e.g. the order) and the stored response commit or roll back together:
- a concurrent duplicate waits on the unique index until the first request finishes (PostgreSQL behaviour for
  an INSERT that conflicts with an uncommitted row), then replays the committed response;
- if the first request fails, its key row rolls back too, so the client may retry with the same key.
"""

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError
from app.models import IdempotencyKey


class IdempotencyKeyRequiredError(AppError):
    code = "IDEMPOTENCY_KEY_REQUIRED"


class InvalidIdempotencyKeyError(AppError):
    code = "INVALID_IDEMPOTENCY_KEY"


class IdempotencyKeyReusedError(ConflictError):
    code = "IDEMPOTENCY_KEY_REUSED"


@dataclass(frozen=True)
class StoredResponse:
    status_code: int
    body: dict[str, Any]


def fingerprint(payload: dict[str, Any]) -> str:
    """SHA-256 of the request body in canonical form (sorted keys, no whitespace), so the same logical body
    always gives the same hash regardless of key order or formatting in the client's JSON."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def claim_or_replay(db: Session, user_id: int, key: str, request_hash: str) -> StoredResponse | None:
    """None: this request now owns the key and must do the work, then call `save_response`.
    StoredResponse: the key was already used for this same request; return that response instead."""
    claimed_id = db.scalar(
        pg_insert(IdempotencyKey)
        .values(user_id=user_id, key=key, request_hash=request_hash)
        # If another transaction holds this (user_id, key) uncommitted, PostgreSQL blocks right here until it
        # commits (→ conflict, nothing inserted) or rolls back (→ our insert goes ahead). This is what makes
        # simultaneous duplicates safe; a "SELECT first, INSERT if missing" check would let both through.
        .on_conflict_do_nothing(index_elements=[IdempotencyKey.user_id, IdempotencyKey.key])
        .returning(IdempotencyKey.id)
    )
    if claimed_id is not None:
        return None

    existing = db.scalar(select(IdempotencyKey).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key))
    if existing.request_hash != request_hash:
        raise IdempotencyKeyReusedError(
            "This Idempotency-Key was already used with a different request body; use a new key for a new request"
        )
    # Rows are only ever committed together with their response, so response_status can't be NULL here.
    return StoredResponse(status_code=existing.response_status, body=existing.response_body)


def save_response(db: Session, user_id: int, key: str, status_code: int, body: dict[str, Any]) -> None:
    """Store the response in the key row. The caller commits it together with the work it describes."""
    db.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
        .values(response_status=status_code, response_body=body)
    )
