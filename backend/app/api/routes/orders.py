"""Checkout, order history, cancel, and admin status changes."""

import re
from typing import Annotated

from fastapi import APIRouter, Header, Query, status
from fastapi.responses import JSONResponse

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.constants import DEFAULT_PAGE_SIZE, IDEMPOTENCY_KEY_PATTERN, MAX_PAGE_SIZE
from app.core.errors import ForbiddenError
from app.models import Role
from app.schemas.common import Page, error_responses
from app.schemas.order import OrderResponse, PlaceOrderRequest, UpdateOrderStatus
from app.services import order_service
from app.services.idempotency_service import IdempotencyKeyRequiredError, InvalidIdempotencyKeyError

router = APIRouter(prefix="/orders", tags=["orders"])


def _validated_idempotency_key(key: str | None) -> str:
    if key is None:
        raise IdempotencyKeyRequiredError("The Idempotency-Key header is required; send a new UUID per checkout")
    if not re.fullmatch(IDEMPOTENCY_KEY_PATTERN, key):
        raise InvalidIdempotencyKeyError("Idempotency-Key must be 8-255 characters of A-Z a-z 0-9 . _ : -")
    return key


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=OrderResponse,
    responses=error_responses(400, 401, 409, 422),
)
def place_order(
    body: PlaceOrderRequest,
    db: DbSession,
    user: CurrentUser,
    idempotency_key: Annotated[
        str | None,
        Header(alias="Idempotency-Key", description="Required. A new UUID per checkout; reuse it only to retry."),
    ] = None,
) -> JSONResponse:
    """Checkout: turns the whole cart into an order and reserves the stock, all-or-nothing.

    - Same key + same body again → the original 201 response (no new order), with `Idempotent-Replayed: true`.
    - Same key + different body → 409 `IDEMPOTENCY_KEY_REUSED`.
    - 409 `INSUFFICIENT_STOCK` lists every item that can't be ordered; 409 `CART_EMPTY` if there is nothing to buy.
      Failed checkouts don't consume the key, so the same key can be retried.
    """
    key = _validated_idempotency_key(idempotency_key)
    result = order_service.checkout(db, user, body, key)
    headers = {"Idempotent-Replayed": "true"} if result.replayed else None
    return JSONResponse(status_code=result.status_code, content=result.body, headers=headers)


@router.get("", response_model=Page[OrderResponse], responses=error_responses(401, 403, 422))
def list_orders(
    db: DbSession,
    user: CurrentUser,
    all_users: Annotated[bool, Query(description="Admins only: everyone's orders")] = False,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[OrderResponse]:
    if all_users and user.role != Role.ADMIN:
        raise ForbiddenError("Only admins can list all orders")
    orders, total = order_service.list_orders(
        db, user_id=None if all_users else user.id, limit=limit, offset=offset
    )
    return Page(items=[OrderResponse.from_order(o) for o in orders], total=total, limit=limit, offset=offset)


@router.get("/{order_id}", response_model=OrderResponse, responses=error_responses(401, 404))
def get_order(order_id: int, db: DbSession, user: CurrentUser) -> OrderResponse:
    return OrderResponse.from_order(order_service.get_order(db, user, order_id))


@router.post("/{order_id}/cancel", response_model=OrderResponse, responses=error_responses(401, 404, 409))
def cancel_order(order_id: int, db: DbSession, user: CurrentUser) -> OrderResponse:
    """Owner or admin. Only pending/confirmed orders; the stock goes back with a `cancel` movement."""
    return OrderResponse.from_order(order_service.cancel_order(db, user, order_id))


@router.patch(
    "/{order_id}/status", response_model=OrderResponse, responses=error_responses(401, 403, 404, 409, 422)
)
def update_status(order_id: int, body: UpdateOrderStatus, db: DbSession, admin: AdminUser) -> OrderResponse:
    """Admin: pending → confirmed → shipped, or → cancelled (returns stock). Anything else → 409."""
    return OrderResponse.from_order(order_service.update_status(db, admin, order_id, body.status))
