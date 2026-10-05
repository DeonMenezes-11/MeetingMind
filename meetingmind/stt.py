"""Speech-to-text with speaker diarization.

Primary model: ``gpt-4o-transcribe-diarize`` with ``response_format="diarized_json"``
and ``chunking_strategy="auto"`` (required for audio longer than 30 s). Each returned
segment carries start/end/speaker/text. If that call fails we fall back to
``whisper-1`` ``verbose_json`` segments, which have timestamps but no speakers
(speaker label ``"?"``).

For very long meetings the audio is pre-split into 10-minute chunks. Diarization
labels restart at "A" in every request, so for chunks 2..n we pass 2-10 s reference
clips of each chunk-1 speaker as ``known_speaker_references`` to keep labels stable.
"""
from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from . import settings
from .audio_prep import AudioChunk, PreparedAudio, extract_clip, to_data_url
from .segments import Segment


@dataclass
class TranscriptResult:
    segments: list[Segment]
    model: str
    duration: float
    diarized: bool
    fallback_reason: str | None = None
    usage: list[dict] = field(default_factory=list)
    raw_segments: list[Segment] = field(default_factory=list)  # un-merged phrase fragments


def _usage_dict(resp, model: str, seconds: float) -> dict:
    u = getattr(resp, "usage", None)
    d = {"stage": "transcribe", "model": model, "kind": "stt", "audio_seconds": round(seconds, 2)}
    if u is not None and getattr(u, "type", None) == "tokens":
        d.update(input_tokens=u.input_tokens, output_tokens=u.output_tokens)
    d["cost"] = settings.stt_cost(model, seconds)
    return d


def _diarize_chunk(client, chunk: AudioChunk, model: str, known_names=None, known_refs=None):
    kwargs = dict(model=model, response_format="diarized_json", chunking_strategy="auto")
    if known_names and known_refs:
        kwargs.update(known_speaker_names=list(known_names)[:4], known_speaker_references=list(known_refs)[:4])
    with open(chunk.path, "rb") as fh:
        resp = client.audio.transcriptions.create(file=fh, **kwargs)
    rows = [
        (float(s.start) + chunk.offset, float(s.end) + chunk.offset, str(s.speaker or "?"), str(s.text or ""))
        for s in (resp.segments or [])
    ]
    return rows, resp


def _whisper_chunk(client, chunk: AudioChunk, model: str):
    with open(chunk.path, "rb") as fh:
        resp = client.audio.transcriptions.create(
            model=model, file=fh, response_format="verbose_json", timestamp_granularities=["segment"]
        )
    rows = [
        (float(s.start) + chunk.offset, float(s.end) + chunk.offset, "?", str(s.text or ""))
        for s in (resp.segments or [])
    ]
    return rows, resp


def _reference_clips(chunk: AudioChunk, rows: list[tuple], work_dir: Path) -> tuple[list[str], list[str]]:
    """Pick one 2-10 s clip per speaker (longest segment) from the first chunk."""
    best: dict[str, tuple] = {}
    for start, end, spk, _ in rows:
        if spk == "?":
            continue
        if end - start > (best[spk][1] - best[spk][0] if spk in best else 0):
            best[spk] = (start, end)
    names, refs = [], []
    for spk, (start, end) in sorted(best.items())[:4]:
        length = min(5.0, end - start)
        if length < 2.0:
            continue
        clip = extract_clip(chunk.path, start - chunk.offset, length, work_dir / f"ref_{spk}.mp3")
        names.append(spk)
        refs.append(to_data_url(clip))
    return names, refs


_ACRONYM_RE = re.compile(r"\b(?:[A-Za-z]_)+[A-Za-z]?_?(?![A-Za-z0-9])")
_SPELLED_RE = re.compile(r"\b[A-Za-z](?: [A-Za-z]){2,}\b")


def clean_asr_text(text: str) -> str:
    """Tidy formatting artefacts of the diarize model: spelled acronyms "U_I_" -> "UI" and
    runs of 3+ single letters "a p i" -> "API" (2-letter runs are left alone: "a I")."""
    text = _ACRONYM_RE.sub(lambda m: m.group(0).replace("_", "").upper(), text)
    text = _SPELLED_RE.sub(lambda m: m.group(0).replace(" ", "").upper(), text)
    return re.sub(r"\s+", " ", text).strip()


MERGE_MAX_GAP_S = 1.0
MERGE_MAX_LEN_S = 30.0


def merge_rows(rows: list[tuple], max_gap: float = MERGE_MAX_GAP_S, max_len: float = MERGE_MAX_LEN_S) -> list[tuple]:
    """Join phrase-level fragments of the same speaker into utterances.

    gpt-4o-transcribe-diarize often returns one segment per phrase ("Good morning," /
    "everyone."). Evidence quotes and Q&A windows work much better on utterances, so
    consecutive same-speaker fragments separated by < ``max_gap`` seconds are merged
    (capped at ``max_len`` seconds per utterance)."""
    merged: list[list] = []
    for start, end, spk, text in rows:
        if (merged and merged[-1][2] == spk and start - merged[-1][1] <= max_gap
                and end - merged[-1][0] <= max_len):
            merged[-1][1] = max(merged[-1][1], end)
            merged[-1][3] = f"{merged[-1][3]} {text.strip()}"
        else:
            merged.append([start, end, spk, text.strip()])
    return [tuple(m) for m in merged]


def _finalise(rows: list[tuple], merge: bool = True) -> list[Segment]:
    rows = sorted(((a, b, c, clean_asr_text(t)) for a, b, c, t in rows if t.strip()), key=lambda r: (r[0], r[1]))
    if merge:
        rows = merge_rows(rows)
    return [
        Segment(id=f"S{i}", start=round(s, 3), end=round(max(e, s), 3), speaker=spk, text=t.strip())
        for i, (s, e, spk, t) in enumerate(rows, start=1)
    ]


def transcribe(prepared: PreparedAudio, client=None, model: str | None = None,
               fallback_model: str | None = None, work_dir: Path | None = None,
               log=None, known_speakers: list[tuple[str, str]] | None = None,
               allow_fallback: bool = True) -> TranscriptResult:
    """``known_speakers`` = [(name, data-URL clip)] (max 4) enables enrolled diarization."""
    m = settings.models()
    model = model or m.stt
    fallback_model = fallback_model or m.stt_fallback
    client = client or settings.get_client()
    log = log or (lambda msg: None)
    work_dir = Path(work_dir or tempfile.mkdtemp(prefix="mm_stt_"))
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        rows, usage = [], []
        known_names, known_refs = None, None
        if known_speakers:
            known_names = [n for n, _ in known_speakers][:4]
            known_refs = [r for _, r in known_speakers][:4]
        for i, chunk in enumerate(prepared.chunks):
            log(f"diarizing chunk {i + 1}/{len(prepared.chunks)} with {model}")
            chunk_rows, resp = _diarize_chunk(client, chunk, model, known_names, known_refs)
            rows.extend(chunk_rows)
            usage.append(_usage_dict(resp, model, chunk.duration))
            if i == 0 and len(prepared.chunks) > 1 and not known_speakers:
                known_names, known_refs = _reference_clips(chunk, chunk_rows, work_dir)
        segments, raw = _finalise(rows), _finalise(rows, merge=False)
        if not segments:
            raise RuntimeError("diarization returned no segments")
        return TranscriptResult(segments, model, prepared.duration, True, None, usage,
                                [Segment(f"R{x.id[1:]}", x.start, x.end, x.speaker, x.text) for x in raw])
    except Exception as exc:  # fall back to whisper-1 (no speaker labels)
        if not allow_fallback:
            raise
        reason = f"{type(exc).__name__}: {str(exc)[:200]}"
        log(f"{model} failed ({reason}); falling back to {fallback_model}")
        rows, usage = [], []
        for chunk in prepared.chunks:
            chunk_rows, resp = _whisper_chunk(client, chunk, fallback_model)
            rows.extend(chunk_rows)
            usage.append(_usage_dict(resp, fallback_model, chunk.duration))
        return TranscriptResult(_finalise(rows), fallback_model, prepared.duration, False, reason, usage)
