"""FastAPI application factory."""

from fastapi import FastAPI

from app.api.routes import auth, cart, health, inventory, orders, products
from app.core.concurrency import ConcurrencyLimitMiddleware
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import HEALTH_PATH, request_context_middleware


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, version="0.1.0")
    register_exception_handlers(app)
    # Added first, so it sits *inside* the request-log middleware below: shed requests are still logged.
    app.add_middleware(
        ConcurrencyLimitMiddleware,
        limit=settings.db_pool_size + settings.db_max_overflow,  # one request per pooled DB connection
        queue_timeout_seconds=settings.request_queue_timeout_seconds,
        exempt_paths=frozenset({HEALTH_PATH}),
    )
    app.middleware("http")(request_context_middleware)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(products.router, prefix="/api")
    app.include_router(inventory.router, prefix="/api")
    app.include_router(cart.router, prefix="/api")
    app.include_router(orders.router, prefix="/api")
    return app


app = create_app()
