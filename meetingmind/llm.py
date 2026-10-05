"""Thin wrapper around Chat Completions structured outputs.

``client.chat.completions.parse(response_format=<pydantic model>)`` sends the model's
JSON schema with ``strict: true`` so the reply is constrained to that schema. We
surface refusals and truncation (``LengthFinishReasonError``) as ``LLMError`` and
record token usage + estimated cost for every call.
"""
from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from . import settings

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    pass


def usage_record(stage: str, model: str, usage) -> dict:
    pin = int(getattr(usage, "prompt_tokens", 0) or 0) if usage else 0
    pout = int(getattr(usage, "completion_tokens", 0) or 0) if usage else 0
    return {
        "stage": stage, "model": model, "kind": "chat",
        "input_tokens": pin, "output_tokens": pout,
        "cost": settings.chat_cost(model, pin, pout),
    }


def parse_structured(client, model: str, messages: list[dict], schema: type[T], *, stage: str,
                     temperature: float = 0.2, max_tokens: int = 6000) -> tuple[T, dict]:
    import openai

    try:
        completion = client.chat.completions.parse(
            model=model, messages=messages, response_format=schema,
            temperature=temperature, max_completion_tokens=max_tokens,
        )
    except openai.LengthFinishReasonError as exc:
        raise LLMError(f"{stage}: the model ran out of output tokens - try a shorter recording") from exc
    except openai.ContentFilterFinishReasonError as exc:
        raise LLMError(f"{stage}: the response was blocked by the content filter") from exc
    message = completion.choices[0].message
    if getattr(message, "refusal", None):
        raise LLMError(f"{stage}: the model refused: {message.refusal}")
    if message.parsed is None:
        raise LLMError(f"{stage}: no structured output returned")
    return message.parsed, usage_record(stage, model, completion.usage)


def chat_text(client, model: str, messages: list[dict], *, stage: str,
              temperature: float = 0.1, max_tokens: int = 600) -> tuple[str, dict]:
    completion = client.chat.completions.create(
        model=model, messages=messages, temperature=temperature, max_completion_tokens=max_tokens,
    )
    text = completion.choices[0].message.content or ""
    return text.strip(), usage_record(stage, model, getattr(completion, "usage", None))
