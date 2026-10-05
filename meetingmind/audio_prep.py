"""Audio normalisation with ffmpeg/ffprobe.

Every upload is converted to mono 16 kHz 64 kbps MP3 (~0.48 MB/min), which keeps a
50-minute meeting under the 25 MB request limit of the transcription endpoint. The
SDK does not enforce that limit, so we check it ourselves. Audio is only split
when it is longer than ~20 minutes (10-minute chunks via the segment muxer); chunk
offsets come from ffprobe, not from ``600 * i``.
"""
from __future__ import annotations

import base64
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"

MAX_REQUEST_BYTES = 25 * 1024 * 1024
SPLIT_THRESHOLD_S = 20 * 60
CHUNK_SECONDS = 600
SUPPORTED_EXTS = {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg", ".flac", ".mpga", ".mpeg"}


class AudioError(RuntimeError):
    pass


@dataclass
class AudioChunk:
    path: Path
    offset: float
    duration: float
    size_bytes: int


@dataclass
class PreparedAudio:
    source: Path
    path: Path  # normalised full-length mp3
    duration: float
    size_bytes: int
    chunks: list[AudioChunk] = field(default_factory=list)


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        raise AudioError(f"{Path(cmd[0]).name} failed: {' | '.join(tail)}")
    return proc


def probe_duration(path: Path | str) -> float:
    proc = _run([
        FFPROBE, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ])
    try:
        return float(proc.stdout.strip())
    except ValueError as exc:
        raise AudioError(f"could not read duration of {Path(path).name}") from exc


def to_mono_mp3(src: Path | str, dst: Path | str, sample_rate: int = 16000, bitrate: str = "64k") -> Path:
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    _run([
        FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
        "-vn", "-ac", "1", "-ar", str(sample_rate), "-c:a", "libmp3lame", "-b:a", bitrate, str(dst),
    ])
    return dst


def split_audio(src: Path | str, out_dir: Path | str, chunk_seconds: int = CHUNK_SECONDS) -> list[AudioChunk]:
    """Split with the segment muxer and compute real offsets with ffprobe."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("chunk_*.mp3"):
        old.unlink()
    _run([
        FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
        "-f", "segment", "-segment_time", str(chunk_seconds), "-reset_timestamps", "1",
        "-c", "copy", str(out_dir / "chunk_%03d.mp3"),
    ])
    chunks, offset = [], 0.0
    for path in sorted(out_dir.glob("chunk_*.mp3")):
        dur = probe_duration(path)
        chunks.append(AudioChunk(path=path, offset=offset, duration=dur, size_bytes=path.stat().st_size))
        offset += dur
    return chunks


def extract_clip(src: Path | str, start: float, duration: float, dst: Path | str) -> Path:
    dst = Path(dst)
    _run([
        FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
        "-i", str(src), "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", str(dst),
    ])
    return dst


def to_data_url(path: Path | str) -> str:
    path = Path(path)
    mime = {".wav": "audio/wav", ".m4a": "audio/mp4", ".mp3": "audio/mpeg"}.get(path.suffix.lower(), "audio/mpeg")
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def prepare_audio(src: Path | str, work_dir: Path | str) -> PreparedAudio:
    """Normalise ``src`` into ``work_dir/audio.mp3`` and split if it is long."""
    src = Path(src)
    if not src.exists():
        raise AudioError(f"audio file not found: {src}")
    if src.suffix.lower() not in SUPPORTED_EXTS:
        raise AudioError(f"unsupported audio type {src.suffix!r}")
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    out = work_dir / "audio.mp3"
    if src.resolve() != out.resolve():
        to_mono_mp3(src, out)
    duration = probe_duration(out)
    size = out.stat().st_size
    if duration > SPLIT_THRESHOLD_S:
        chunks = split_audio(out, work_dir / "chunks")
    else:
        chunks = [AudioChunk(path=out, offset=0.0, duration=duration, size_bytes=size)]
    too_big = [c for c in chunks if c.size_bytes > MAX_REQUEST_BYTES]
    if too_big:
        raise AudioError(
            f"{len(too_big)} audio chunk(s) exceed the 25 MB request limit even after compression"
        )
    return PreparedAudio(source=src, path=out, duration=duration, size_bytes=size, chunks=chunks)
