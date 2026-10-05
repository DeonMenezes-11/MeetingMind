"""Shared fixtures. Everything here is offline: a FakeClient stands in for OpenAI."""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from meetingmind.segments import Segment  # noqa: E402


def bow_vector(text: str, dim: int = 256) -> list[float]:
    """Deterministic bag-of-words hashing embedding (cosine works on word overlap)."""
    v = np.zeros(dim)
    for w in re.findall(r"[a-z]+", text.lower()):
        if len(w) > 2:
            v[int(hashlib.md5(w.encode()).hexdigest(), 16) % dim] += 1.0
    return v.tolist()


class FakeClient:
    """Mimics the subset of the OpenAI client MeetingMind uses."""

    def __init__(self, chat_reply: str = "", parsed: dict | None = None, diarized_segments=None,
                 enrolled_segments=None):
        self.calls: list[tuple[str, dict]] = []
        self.chat_reply = chat_reply
        self.parsed = parsed or {}
        self.diarized_segments = diarized_segments or []
        self.enrolled_segments = enrolled_segments
        outer = self

        class _Emb:
            def create(self, model, input):
                outer.calls.append(("embeddings", {"model": model, "n": len(input)}))
                data = [SimpleNamespace(index=i, embedding=bow_vector(t)) for i, t in enumerate(input)]
                return SimpleNamespace(data=data, usage=SimpleNamespace(prompt_tokens=7 * len(input)))

        class _Completions:
            def create(self, **kw):
                outer.calls.append(("chat", kw))
                msg = SimpleNamespace(content=outer.chat_reply, refusal=None)
                return SimpleNamespace(choices=[SimpleNamespace(message=msg)],
                                       usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20))

            def parse(self, **kw):
                outer.calls.append(("parse", kw))
                schema = kw["response_format"]
                parsed = outer.parsed[schema.__name__]
                obj = parsed(kw) if callable(parsed) else parsed
                msg = SimpleNamespace(parsed=obj, refusal=None)
                return SimpleNamespace(choices=[SimpleNamespace(message=msg)],
                                       usage=SimpleNamespace(prompt_tokens=1000, completion_tokens=300))

        class _Transcriptions:
            def create(self, **kw):
                outer.calls.append(("stt", {k: v for k, v in kw.items() if k != "file"}))
                rows = outer.diarized_segments
                if kw.get("known_speaker_names"):  # enrolled pass: labels become the known names
                    known = list(kw["known_speaker_names"])
                    rows = outer.enrolled_segments or rows
                    rows = [(s, e, known[ord(spk) - 65] if len(spk) == 1 and ord(spk) - 65 < len(known) else spk, t)
                            for s, e, spk, t in rows]
                segs = [SimpleNamespace(id=f"seg_{i}", start=s, end=e, speaker=spk, text=t,
                                        type="transcript.text.segment")
                        for i, (s, e, spk, t) in enumerate(rows)]
                return SimpleNamespace(segments=segs, duration=segs[-1].end if segs else 0, text="",
                                       usage=SimpleNamespace(type="duration", seconds=10.0))

        self.embeddings = _Emb()
        self.chat = SimpleNamespace(completions=_Completions())
        self.audio = SimpleNamespace(transcriptions=_Transcriptions())


@pytest.fixture
def segments() -> list[Segment]:
    rows = [
        (0.0, 4.0, "A", "Hi everyone, I'm Priya, the product manager."),
        (4.5, 7.0, "B", "Hi, I'm Rohan, I handle the backend."),
        (7.5, 12.0, "A", "Okay, then it's decided. FestPal will be built in Flutter."),
        (12.5, 18.0, "B", "I'll build the event schedule and registration API and have it on staging by Friday."),
        (18.5, 22.0, "C", "I'll finish the high fidelity designs for the schedule screens by Wednesday."),
        (22.5, 26.0, "A", "The campus Wi-Fi collapses during the fest, so the app has to work offline."),
        (26.5, 30.0, "C", "Should paid workshops be paid inside the app?"),
    ]
    return [Segment(f"S{i}", s, e, spk, t) for i, (s, e, spk, t) in enumerate(rows, start=1)]


@pytest.fixture
def names() -> dict:
    return {"A": "Priya", "B": "Rohan", "C": "Meera"}
