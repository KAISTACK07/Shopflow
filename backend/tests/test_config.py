import logging
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import configure_logging

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"


def test_env_example_documents_every_setting() -> None:
    """Every Settings field must appear in .env.example, so a new setting can't be added silently."""
    documented = set(re.findall(r"^([A-Z][A-Z0-9_]*)=", ENV_EXAMPLE.read_text(), flags=re.MULTILINE))

    missing = {name.upper() for name in Settings.model_fields} - documented

    assert missing == set(), f"add these to .env.example: {sorted(missing)}"


def test_uvicorn_messages_go_through_the_json_handler() -> None:
    """In a container every log line should be JSON, including uvicorn's own startup and error messages."""
    configure_logging("INFO")

    uvicorn_logger = logging.getLogger("uvicorn")

    assert uvicorn_logger.handlers == []
    assert uvicorn_logger.propagate is True


@pytest.mark.parametrize(
    "secret",
    [
        pytest.param("too-short", id="shorter-than-32-chars"),
        pytest.param("replace-with-a-long-random-string-at-least-32-chars", id="placeholder-from-env-example"),
    ],
)
def test_unsafe_jwt_secret_is_rejected_at_startup(secret: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        Settings(jwt_secret=secret)

    message = str(exc_info.value)
    assert "jwt_secret" in message
    # The rejected value must not appear, not even truncated (Pydantic shortens long inputs with "...").
    assert "input_value" not in message
    assert secret[:8] not in message
