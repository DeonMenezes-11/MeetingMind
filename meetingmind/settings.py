"""Configuration: secrets, model names, paths and price constants.

The API key is read from the environment - locally from ``.env`` (python-dotenv),
in Docker / on a host from a real environment variable. The key itself is never
returned to callers that display status - use :func:`key_status` for that.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = PROJECT_ROOT / "runs"
SAMPLES_DIR = PROJECT_ROOT / "samples"
RESULTS_DIR = PROJECT_ROOT / "results"

try:  # optional dependency in tests
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env", override=False)
except Exception:  # pragma: no cover
    pass


def get_setting(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    return value if value else default


# --------------------------------------------------------------------- models
@dataclass(frozen=True)
class Models:
    chat: str
    stt: str
    stt_fallback: str
    embed: str
    tts: str


def models() -> Models:
    return Models(
        chat=get_setting("MM_CHAT_MODEL", "gpt-4o-mini"),
        stt=get_setting("MM_STT_MODEL", "gpt-4o-transcribe-diarize"),
        stt_fallback=get_setting("MM_STT_FALLBACK", "whisper-1"),
        embed=get_setting("MM_EMBED_MODEL", "text-embedding-3-small"),
        tts=get_setting("MM_TTS_MODEL", "gpt-4o-mini-tts"),
    )


def key_status() -> dict:
    """Return whether a key is configured and where from - never the key."""
    if os.getenv("OPENAI_API_KEY"):
        return {"configured": True, "source": ".env / environment"}
    return {"configured": False, "source": None}


def get_client(timeout: float = 180.0):
    """Create an OpenAI client. Raises RuntimeError if no key is configured."""
    from openai import OpenAI

    key = get_setting("OPENAI_API_KEY")
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Copy .env.example to .env (local) or pass it "
            "as an environment variable (Docker / hosting)."
        )
    return OpenAI(api_key=key, timeout=timeout, max_retries=2)


# --------------------------------------------------------------------- prices
# Published list prices (USD) used only for an *estimated* cost read-out.
CHAT_PRICE_PER_1M = {  # (input, output)
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
}
EMBED_PRICE_PER_1M = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
}
STT_PRICE_PER_MIN = {
    "gpt-4o-transcribe-diarize": 0.006,
    "gpt-4o-transcribe": 0.006,
    "gpt-4o-mini-transcribe": 0.003,
    "whisper-1": 0.006,
}
TTS_PRICE_PER_MIN = {"gpt-4o-mini-tts": 0.015}


def chat_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = CHAT_PRICE_PER_1M.get(model, (0.15, 0.60))
    return (input_tokens * pin + output_tokens * pout) / 1_000_000


def embed_cost(model: str, tokens: int) -> float:
    return tokens * EMBED_PRICE_PER_1M.get(model, 0.02) / 1_000_000


def stt_cost(model: str, seconds: float) -> float:
    return seconds / 60.0 * STT_PRICE_PER_MIN.get(model, 0.006)


def tts_cost(model: str, seconds: float) -> float:
    return seconds / 60.0 * TTS_PRICE_PER_MIN.get(model, 0.015)
