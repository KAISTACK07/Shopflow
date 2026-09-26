from datetime import UTC, datetime, timedelta

import jwt
import pytest
from argon2 import PasswordHasher
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AdminUser
from app.core.errors import register_exception_handlers
from app.core.security import create_access_token, verify_password
from app.models import User
from tests.conftest import CUSTOMER_PASSWORD, auth_headers

VALID_PASSWORD = "correct-horse-battery"


def register(client: TestClient, email: str = "new.user@example.com", password: str = VALID_PASSWORD, **extra):
    return client.post("/api/auth/register", json={"email": email, "password": password, **extra})


def login(client: TestClient, email: str, password: str):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def user_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User))


# --- register -----------------------------------------------------------------------------------


def test_register_creates_customer(client: TestClient, db: Session) -> None:
    response = register(client, email="New.User@Example.com")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.user@example.com"
    assert body["role"] == "customer"
    assert "password" not in response.text and "password_hash" not in body

    stored = db.scalar(select(User).where(User.email == "new.user@example.com"))
    assert stored.password_hash != VALID_PASSWORD
    assert verify_password(stored.password_hash, VALID_PASSWORD)


def test_register_duplicate_email_is_409_case_insensitive(client: TestClient) -> None:
    assert register(client, email="dup@example.com").status_code == 201

    response = register(client, email="DUP@example.com")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_cannot_choose_role(client: TestClient, db: Session) -> None:
    response = register(client, role="admin")

    assert response.status_code == 422
    assert user_count(db) == 0


@pytest.mark.parametrize(
    ("email", "password"),
    # Passwords are distinctive strings so "not echoed back" can't accidentally match error text.
    [("not-an-email", VALID_PASSWORD), ("ok@example.com", "Tiny-7x"), ("ok@example.com", "Q" * 129)],
)
def test_register_rejects_invalid_input(client: TestClient, db: Session, email: str, password: str) -> None:
    response = register(client, email=email, password=password)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert password not in response.text  # validation errors never echo the input back
    assert user_count(db) == 0


# --- login --------------------------------------------------------------------------------------


def test_login_returns_working_token(client: TestClient, customer: User) -> None:
    response = login(client, "Customer@Example.com", CUSTOMER_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == customer.id


def test_wrong_password_and_unknown_email_look_identical(client: TestClient, customer: User) -> None:
    wrong_password = login(client, customer.email, "not-the-password")
    unknown_email = login(client, "nobody@example.com", CUSTOMER_PASSWORD)

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert wrong_password.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_upgrades_weak_password_hash(client: TestClient, db: Session, customer: User) -> None:
    weak_hash = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(CUSTOMER_PASSWORD)
    customer.password_hash = weak_hash
    db.commit()

    assert login(client, customer.email, CUSTOMER_PASSWORD).status_code == 200

    db.refresh(customer)
    assert customer.password_hash != weak_hash
    assert verify_password(customer.password_hash, CUSTOMER_PASSWORD)


# --- tokens -------------------------------------------------------------------------------------


def test_me_without_token_is_401_with_bearer_challenge(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def _token_signed_with(secret: str, user_id: int, algorithm: str = "HS256") -> str:
    now = datetime.now(UTC)
    return jwt.encode({"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=5)}, secret, algorithm)


@pytest.mark.parametrize(
    "make_token",
    [
        pytest.param(lambda user: "not.a.jwt", id="garbage"),
        pytest.param(lambda user: create_access_token(user.id, expires_in=timedelta(seconds=-1)), id="expired"),
        pytest.param(lambda user: _token_signed_with("some-other-secret-" * 3, user.id), id="wrong-secret"),
        pytest.param(lambda user: _token_signed_with("", user.id, algorithm="none"), id="alg-none"),
    ],
)
def test_invalid_tokens_are_rejected(client: TestClient, customer: User, make_token) -> None:
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {make_token(customer)}"})

    assert response.status_code == 401


def test_token_of_deleted_user_is_rejected(client: TestClient, db: Session, customer: User) -> None:
    headers = auth_headers(customer)
    db.delete(customer)
    db.commit()

    assert client.get("/api/auth/me", headers=headers).status_code == 401


# --- admin guard --------------------------------------------------------------------------------


@pytest.fixture
def admin_only_client() -> TestClient:
    """A tiny app with one admin-only route, to test the guard on its own."""
    guarded_app = FastAPI()
    register_exception_handlers(guarded_app)

    @guarded_app.get("/admin-only")
    def admin_only(user: AdminUser) -> dict[str, int]:
        return {"admin_id": user.id}

    return TestClient(guarded_app)


def test_admin_guard_allows_admin(admin_only_client: TestClient, admin: User, admin_headers) -> None:
    response = admin_only_client.get("/admin-only", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {"admin_id": admin.id}


def test_admin_guard_rejects_customer_with_403(admin_only_client: TestClient, customer_headers) -> None:
    response = admin_only_client.get("/admin-only", headers=customer_headers)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_admin_guard_rejects_anonymous_with_401(admin_only_client: TestClient) -> None:
    assert admin_only_client.get("/admin-only").status_code == 401
