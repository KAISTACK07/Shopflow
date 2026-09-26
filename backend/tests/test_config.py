import pytest
from pydantic import ValidationError

from app.core.config import Settings


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
