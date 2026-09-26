"""Schemas shared across routers."""

from typing import Any

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    """The one error shape every endpoint returns; documented in OpenAPI via `error_responses`."""

    error: ErrorBody


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """`responses=` argument for a route, so /docs shows the error shape for each listed status code."""
    return {code: {"model": ErrorResponse} for code in status_codes}
