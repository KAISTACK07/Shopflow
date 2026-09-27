# syntax=docker/dockerfile:1
FROM python:3.12-slim

# No .pyc files in the image; print logs immediately instead of buffering them (so `docker logs` is live).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first: this layer stays cached until requirements.txt changes, so code edits rebuild in seconds.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY --chmod=755 docker-entrypoint.sh .

# Don't run the app as root inside the container.
RUN useradd --create-home --uid 10001 shopflow
USER shopflow

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
