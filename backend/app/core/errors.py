"""One error shape for every failure: {"error": {"code", "message", "details"}}."""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base class for errors raised on purpose by our code (services, dependencies)."""

    status_code: int = HTTPStatus.BAD_REQUEST
    code: str = "BAD_REQUEST"
    headers: dict[str, str] | None = None

    def __init__(self, message: str, details: Any = None, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        if code is not None:
            self.code = code


class UnauthorizedError(AppError):
    status_code = HTTPStatus.UNAUTHORIZED
    code = "UNAUTHORIZED"
    # RFC 9110: a 401 must tell the client which auth scheme to use.
    headers = {"WWW-Authenticate": "Bearer"}


class ForbiddenError(AppError):
    status_code = HTTPStatus.FORBIDDEN
    code = "FORBIDDEN"


class NotFoundError(AppError):
    status_code = HTTPStatus.NOT_FOUND
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = HTTPStatus.CONFLICT
    code = "CONFLICT"


def error_response(
    status_code: int, code: str, message: str, details: Any = None, headers: dict[str, str] | None = None
) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "details": details}}
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def _code_for_status(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).name  # e.g. 404 -> "NOT_FOUND"
    except ValueError:
        return "HTTP_ERROR"


async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details, headers=exc.headers)


async def _http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return error_response(exc.status_code, _code_for_status(exc.status_code), str(exc.detail), headers=exc.headers)


async def _validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Keep only location, message and type: the raw `input` could echo back a password.
    details = [{"loc": list(err["loc"]), "msg": err["msg"], "type": err["type"]} for err in exc.errors()]
    return error_response(HTTPStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Request validation failed", details)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    # Unexpected exceptions become a 500 in the request middleware, so they are logged with the request id.
