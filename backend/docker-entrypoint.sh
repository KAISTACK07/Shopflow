#!/bin/sh
# Container start: migrate, optionally seed demo data, then run the API.
set -e

# Safe with several containers starting at once: migrations take turns on a PostgreSQL advisory lock (alembic/env.py).
alembic upgrade head

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
    python -m app.seed
fi

# exec: uvicorn replaces this shell as PID 1, so `docker stop` (SIGTERM) reaches it directly and it shuts down
# gracefully, finishing in-flight requests. Without exec the shell would get the signal and uvicorn would be killed.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 10
