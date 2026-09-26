"""FastAPI application factory."""

from fastapi import FastAPI

from app.api.routes import health
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import request_context_middleware


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, version="0.1.0")
    register_exception_handlers(app)
    app.middleware("http")(request_context_middleware)
    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
