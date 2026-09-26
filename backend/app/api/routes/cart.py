"""The current user's cart. Every write returns the whole cart, so the client never computes totals."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.cart import AddCartItem, CartResponse, UpdateCartItem
from app.schemas.common import error_responses
from app.services import cart_service

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartResponse, responses=error_responses(401))
def get_cart(db: DbSession, user: CurrentUser) -> CartResponse:
    return CartResponse.from_cart(cart_service.get_cart(db, user))


@router.post("/items", response_model=CartResponse, responses=error_responses(401, 404, 409, 422))
def add_item(body: AddCartItem, db: DbSession, user: CurrentUser) -> CartResponse:
    """Adds the product, or increases its quantity if already in the cart. Stock is checked but not reserved."""
    return CartResponse.from_cart(cart_service.add_item(db, user, body.product_id, body.quantity))


@router.patch("/items/{product_id}", response_model=CartResponse, responses=error_responses(401, 404, 409, 422))
def set_item_quantity(product_id: int, body: UpdateCartItem, db: DbSession, user: CurrentUser) -> CartResponse:
    return CartResponse.from_cart(cart_service.set_item_quantity(db, user, product_id, body.quantity))


@router.delete("/items/{product_id}", response_model=CartResponse, responses=error_responses(401, 404))
def remove_item(product_id: int, db: DbSession, user: CurrentUser) -> CartResponse:
    return CartResponse.from_cart(cart_service.remove_item(db, user, product_id))
