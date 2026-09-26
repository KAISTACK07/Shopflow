"""POST /api/auth/register, POST /api/auth/login, GET /api/auth/me."""

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.schemas.common import error_responses
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponse,
    responses=error_responses(409, 422),
)
def register(body: RegisterRequest, db: DbSession) -> UserResponse:
    user = auth_service.register_user(db, body.email, body.password)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse, responses=error_responses(401, 422))
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    user = auth_service.authenticate(db, body.email, body.password)
    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=get_settings().access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserResponse, responses=error_responses(401))
def me(user: CurrentUser) -> UserResponse:
    """The logged-in user; the frontend uses it to learn the role after login."""
    return UserResponse.model_validate(user)
