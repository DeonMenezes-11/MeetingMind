"""Core transcript data type and time-formatting helpers."""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class Segment:
    """One diarized utterance. ``id`` is our stable display id (S1, S2, ...)."""

    id: str
    start: float
    end: float
    speaker: str  # diarization label, e.g. "A" ("?" when no diarization)
    text: str

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Segment":
        return cls(
            id=str(d["id"]),
            start=float(d["start"]),
            end=float(d["end"]),
            speaker=str(d.get("speaker", "?")),
            text=str(d.get("text", "")),
        )


def fmt_ts(seconds: float) -> str:
    """Seconds -> ``mm:ss`` (or ``h:mm:ss`` for meetings longer than an hour)."""
    total = int(max(0.0, float(seconds)) + 1e-6)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def parse_ts(text: str) -> float:
    """``mm:ss`` / ``h:mm:ss`` -> seconds. Raises ValueError on bad input."""
    parts = text.strip().strip("[]").split(":")
    if not 2 <= len(parts) <= 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f"not a timestamp: {text!r}")
    nums = [int(p) for p in parts]
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    return nums[0] * 3600 + nums[1] * 60 + nums[2]


def fmt_srt_ts(seconds: float) -> str:
    ms_total = int(round(max(0.0, float(seconds)) * 1000))
    h, rem = divmod(ms_total, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


_SEG_ID_RE = re.compile(r"^\[?\s*[sS]?\s*(\d+)\s*\]?$")


def normalise_segment_id(raw: str) -> str | None:
    """Accept "S12", "s12", "12", "[S12]" -> "S12"; anything else -> None."""
    m = _SEG_ID_RE.match(str(raw).strip())
    return f"S{int(m.group(1))}" if m else None


def speaker_name(label: str, names: dict | None) -> str:
    if names and names.get(label):
        return names[label]
    return "Unknown speaker" if label in ("?", "", None) else f"Speaker {label}"


def save_segments(path: Path, segments: Iterable[Segment], extra: dict | None = None) -> None:
    payload = dict(extra or {})
    payload["segments"] = [s.to_dict() for s in segments]
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def load_segments(path: Path) -> tuple[list[Segment], dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    segs = [Segment.from_dict(d) for d in data.get("segments", [])]
    info = {k: v for k, v in data.items() if k != "segments"}
    return segs, info
