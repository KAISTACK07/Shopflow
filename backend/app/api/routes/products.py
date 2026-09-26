"""Catalogue endpoints: anyone reads active products; admins create, update, deactivate."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import AdminUser, DbSession, OptionalUser
from app.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SEARCH_QUERY_MAX_LENGTH
from app.core.errors import ForbiddenError
from app.models import Role, User
from app.schemas.common import Page, error_responses
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])


def _is_admin(user: User | None) -> bool:
    return user is not None and user.role == Role.ADMIN


@router.get("", response_model=Page[ProductResponse], responses=error_responses(401, 403, 422))
def list_products(
    db: DbSession,
    user: OptionalUser,
    q: Annotated[str | None, Query(max_length=SEARCH_QUERY_MAX_LENGTH, description="Search name or SKU")] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
    include_inactive: Annotated[bool, Query(description="Admins only")] = False,
) -> Page[ProductResponse]:
    if include_inactive and not _is_admin(user):
        raise ForbiddenError("Only admins can list inactive products")
    search = q.strip() if q else None
    products, total = product_service.list_products(
        db, search=search, limit=limit, offset=offset, include_inactive=include_inactive
    )
    return Page(items=[ProductResponse.from_model(p) for p in products], total=total, limit=limit, offset=offset)


@router.get("/{product_id}", response_model=ProductResponse, responses=error_responses(401, 404))
def get_product(product_id: int, db: DbSession, user: OptionalUser) -> ProductResponse:
    product = product_service.get_product(db, product_id, include_inactive=_is_admin(user))
    return ProductResponse.from_model(product)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ProductResponse,
    responses=error_responses(401, 403, 409, 422),
)
def create_product(body: ProductCreate, db: DbSession, admin: AdminUser) -> ProductResponse:
    product = product_service.create_product(db, body, actor=admin)
    return ProductResponse.from_model(product)


@router.patch("/{product_id}", response_model=ProductResponse, responses=error_responses(401, 403, 404, 422))
def update_product(product_id: int, body: ProductUpdate, db: DbSession, admin: AdminUser) -> ProductResponse:
    # exclude_unset: only fields the client actually sent are changed.
    product = product_service.update_product(db, product_id, body.model_dump(exclude_unset=True))
    return ProductResponse.from_model(product)


@router.delete(
    "/{product_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(401, 403, 404)
)
def deactivate_product(product_id: int, db: DbSession, admin: AdminUser) -> None:
    """Soft delete: the product disappears from the catalogue but stays in order history."""
    product_service.deactivate_product(db, product_id)
