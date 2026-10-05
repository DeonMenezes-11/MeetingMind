"""End-to-end pipeline with per-stage timing, usage/cost accounting and an on-disk cache.

runs/<run_id>/
  audio.mp3        normalised mono 16 kHz copy used for playback
  transcript_pass1.json  first diarization pass (+ raw phrase fragments)
  transcript.json  final diarized utterances (after optional self-enrolment pass)
  speakers.json    inferred label->name mapping, user overrides
  minutes.json     structured minutes with grounding blocks
  index.npz        embedding index for "Ask the Meeting"
  meta.json        timings, usage, estimated cost, models
  exports/         minutes.md, minutes.json, action_items.csv, transcript.srt
Re-running with the same run id and the same audio re-uses cached stages, so paid API
calls are never repeated by accident.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import settings
from .ask import MeetingIndex, build_index
from .audio_prep import extract_clip, prepare_audio, probe_duration, to_data_url
from .evidence import ground_minutes
from .exporters import write_exports
from .minutes import generate_minutes
from .minutes_schema import Minutes
from .segments import Segment, load_segments, save_segments
from .speaker_naming import infer_speaker_names, plan_enrolment, resolve_names
from .stt import transcribe

STAGES = [
    ("prepare", "Preparing audio (ffmpeg, mono 16 kHz)"),
    ("transcribe", "Transcribing + diarizing speakers"),
    ("speakers", "Identifying speakers from introductions"),
    ("enrol", "Re-diarizing with self-enrolled voices"),
    ("minutes", "Drafting structured minutes"),
    ("grounding", "Verifying evidence for every item"),
    ("index", "Building the Q&A retrieval index"),
    ("export", "Writing exports"),
]
STAGE_LABELS = dict(STAGES)
Progress = Callable[[str, str, str], None]  # (stage, state, detail)


@dataclass
class RunData:
    run_id: str
    dir: Path
    segments: list[Segment]
    transcript_info: dict
    speakers: dict
    minutes: dict
    meta: dict

    @property
    def names(self) -> dict:
        return resolve_names(self.speakers.get("inferred", {}), self.speakers.get("overrides", {}))

    @property
    def audio_path(self) -> Path:
        return self.dir / "audio.mp3"

    def index(self) -> MeetingIndex | None:
        p = self.dir / "index.npz"
        return MeetingIndex.load(p) if p.exists() else None


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    return s[:40] or "meeting"


def new_run_id(source_name: str) -> str:
    return f"{slugify(Path(source_name).stem)}_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _read_json(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _summarise_usage(usage: list[dict]) -> dict:
    by_stage: dict[str, float] = {}
    for u in usage:
        by_stage[u["stage"]] = by_stage.get(u["stage"], 0.0) + float(u.get("cost", 0.0))
    return {"total": round(sum(by_stage.values()), 5), "by_stage": {k: round(v, 5) for k, v in by_stage.items()}}


def run_pipeline(audio_path: str | Path, run_id: str | None = None, client=None,
                 progress: Progress | None = None, force: bool = False,
                 participants: list[str] | None = None) -> RunData:
    audio_path = Path(audio_path)
    if not audio_path.is_file():
        raise FileNotFoundError(f"audio file not found: {audio_path}")
    run_id = run_id or new_run_id(audio_path.name)
    run_dir = settings.RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    progress = progress or (lambda stage, state, detail: None)
    m = settings.models()

    old_meta = _read_json(run_dir / "meta.json", {}) or {}
    source_hash = _sha256(audio_path)
    reuse = (not force) and old_meta.get("source_sha256") == source_hash
    meta = {
        "run_id": run_id,
        "created": old_meta.get("created") if reuse else dt.datetime.now().isoformat(timespec="seconds"),
        "source_name": old_meta.get("source_name", audio_path.name)
        if reuse and audio_path.name == "audio.mp3" else audio_path.name,
        "source_sha256": source_hash,
        "models": {"chat": m.chat, "stt": m.stt, "stt_fallback": m.stt_fallback, "embed": m.embed},
        "timings": dict(old_meta.get("timings", {})) if reuse else {},
        "cached_stages": [],
        "usage": [u for u in old_meta.get("usage", [])] if reuse else [],
    }
    recompute = not reuse

    def stage(key: str, fn, cached: bool):
        nonlocal recompute
        if cached and not recompute:
            meta["cached_stages"].append(key)
            progress(key, "cached", "re-used cached result")
            return None
        recompute = True  # everything downstream must be rebuilt too
        meta["usage"] = [u for u in meta["usage"] if u["stage"] != key]
        progress(key, "running", STAGE_LABELS[key])
        t0 = time.perf_counter()
        result = fn()
        meta["timings"][key] = round(time.perf_counter() - t0, 2)
        progress(key, "done", f"{meta['timings'][key]:.1f}s")
        return result

    # 1. prepare ---------------------------------------------------------------
    def do_prepare():
        return prepare_audio(audio_path, run_dir)
    prepared = stage("prepare", do_prepare, cached=(run_dir / "audio.mp3").exists())
    if prepared is not None:
        meta["duration"] = round(prepared.duration, 2)
        meta["audio_bytes"] = prepared.size_bytes
        meta["chunks"] = len(prepared.chunks)
    else:
        meta["duration"] = old_meta.get("duration") or round(probe_duration(run_dir / "audio.mp3"), 2)
        meta["audio_bytes"] = old_meta.get("audio_bytes", (run_dir / "audio.mp3").stat().st_size)
        meta["chunks"] = old_meta.get("chunks", 1)

    client_holder: dict = {}

    def get_client():
        if "c" not in client_holder:
            client_holder["c"] = client or settings.get_client()
        return client_holder["c"]

    # 2. transcribe (pass 1) -----------------------------------------------------
    def do_transcribe():
        prep = prepared or prepare_audio(run_dir / "audio.mp3", run_dir)
        res = transcribe(prep, client=get_client(), work_dir=run_dir / "stt_work",
                         log=lambda msg: progress("transcribe", "running", msg))
        info = {"model": res.model, "diarized": res.diarized, "fallback_reason": res.fallback_reason,
                "duration": res.duration, "raw_segments": [r.to_dict() for r in res.raw_segments]}
        save_segments(run_dir / "transcript_pass1.json", res.segments, info)
        meta["usage"].extend(res.usage)
        shutil.rmtree(run_dir / "stt_work", ignore_errors=True)
        return res
    stage("transcribe", do_transcribe, cached=(run_dir / "transcript_pass1.json").exists())
    pass1, p1info = load_segments(run_dir / "transcript_pass1.json")
    raw1 = [Segment.from_dict(d) for d in p1info.pop("raw_segments", [])]

    # 3. speaker names + introductions + enrolment plan ------------------------------
    old_speakers = _read_json(run_dir / "speakers.json", {}) or {}
    participants = [p.strip() for p in (participants or []) if p and p.strip()] or None

    def do_speakers():
        inferred, intros, usage = infer_speaker_names(pass1, client=get_client(), model=m.chat,
                                                      participants=participants)
        if usage:
            meta["usage"].append(usage)
        plan = plan_enrolment(pass1, intros, mode=(settings.get_setting("MM_ENROL", "auto") or "auto").lower(),
                              raw_segments=raw1)
        data = {"inferred": inferred, "introductions": intros, "enrolment": plan,
                "participants": participants, "overrides": old_speakers.get("overrides", {})}
        _write_json(run_dir / "speakers.json", data)
        return data
    speakers_cached = (run_dir / "speakers.json").exists() and old_speakers.get("participants") == participants
    stage("speakers", do_speakers, cached=speakers_cached)
    speakers = _read_json(run_dir / "speakers.json", {})

    # 4. enrol: second diarization pass guided by each person's own introduction ----------
    def do_enrol():
        plan = speakers.get("enrolment", {}) or {}
        info = dict(p1info, enrolled=False, enrolment_reason=plan.get("reason", ""))
        if not plan.get("needed"):
            save_segments(run_dir / "transcript.json", pass1, info)
            progress("enrol", "running", f"not needed - {plan.get('reason', 'no plan')}")
            return
        progress("enrol", "running", f"re-diarizing because {plan['reason']}")
        clip_dir = run_dir / "enrol_clips"
        clip_dir.mkdir(exist_ok=True)
        known = []
        for sp in plan["speakers"]:
            clip = extract_clip(run_dir / "audio.mp3", sp["clip_start"], sp["clip_end"] - sp["clip_start"],
                                clip_dir / f"{slugify(sp['name'])}.mp3")
            known.append((sp["name"], to_data_url(clip)))
        try:
            prep = prepare_audio(run_dir / "audio.mp3", run_dir)
            res = transcribe(prep, client=get_client(), known_speakers=known, allow_fallback=False)
        except Exception as exc:  # keep pass 1 if the enrolled pass fails
            info["enrolment_error"] = f"{type(exc).__name__}: {str(exc)[:200]}"
            save_segments(run_dir / "transcript.json", pass1, info)
            return
        for u in res.usage:
            u["stage"] = "enrol"
        meta["usage"].extend(res.usage)
        roles = {sp["name"]: (sp.get("role", ""), sp.get("segment_id", "")) for sp in plan["speakers"]}
        inferred = {}
        for label in sorted({x.speaker for x in res.segments}):
            role, ev = roles.get(label, ("", ""))
            inferred[label] = {"name": label if label in roles else "", "proposed": label, "role": role,
                               "evidence": ev, "confidence": 1.0 if label in roles else 0.0,
                               "accepted": label in roles, "method": "enrolled-reference"}
        speakers["inferred_pass1"] = speakers.get("inferred", {})
        speakers["inferred"] = inferred
        _write_json(run_dir / "speakers.json", speakers)
        info.update(enrolled=True, model=res.model, raw_segments=[r.to_dict() for r in res.raw_segments])
        save_segments(run_dir / "transcript.json", res.segments, info)
        shutil.rmtree(clip_dir, ignore_errors=True)
    stage("enrol", do_enrol, cached=(run_dir / "transcript.json").exists())
    speakers = _read_json(run_dir / "speakers.json", {})
    segments, tinfo = load_segments(run_dir / "transcript.json")
    tinfo.pop("raw_segments", None)
    names = resolve_names(speakers.get("inferred", {}), speakers.get("overrides", {}))
    meta["participants"] = participants
    meta["stt_model_used"] = tinfo.get("model")
    meta["diarized"] = tinfo.get("diarized")
    meta["fallback_reason"] = tinfo.get("fallback_reason")
    meta["enrolled"] = tinfo.get("enrolled", False)
    meta["enrolment_reason"] = tinfo.get("enrolment_reason", "")
    meta["segments"] = len(segments)
    meta["speakers"] = len({s.speaker for s in segments})

    # 4. minutes + 5. grounding -------------------------------------------------------
    def do_minutes():
        minutes, usage = generate_minutes(segments, names, client=get_client(), model=m.chat,
                                          duration=meta.get("duration"))
        meta["usage"].append(usage)
        (run_dir / "minutes_raw.json").write_text(minutes.model_dump_json(indent=2), encoding="utf-8")
        return minutes
    stage("minutes", do_minutes, cached=(run_dir / "minutes_raw.json").exists())

    def do_grounding():
        raw = Minutes.model_validate_json((run_dir / "minutes_raw.json").read_text(encoding="utf-8"))
        grounded = ground_minutes(raw, segments)
        _write_json(run_dir / "minutes.json", grounded)
        return grounded
    stage("grounding", do_grounding, cached=(run_dir / "minutes.json").exists())
    minutes = _read_json(run_dir / "minutes.json")
    meta["grounding"] = minutes.get("grounding_summary", {})

    # 6. index -------------------------------------------------------------------------
    def do_index():
        index, usage = build_index(segments, names, client=get_client(), model=m.embed)
        index.save(run_dir / "index.npz")
        meta["usage"].append(usage)
        meta["index_windows"] = len(index.windows)
    stage("index", do_index, cached=(run_dir / "index.npz").exists())
    meta.setdefault("index_windows", old_meta.get("index_windows"))

    # 7. exports -----------------------------------------------------------------------
    meta["title"] = minutes.get("title", run_id)
    meta["cost"] = _summarise_usage(meta["usage"])
    meta["total_latency"] = round(sum(meta["timings"].values()), 2)
    stage("export", lambda: write_exports(run_dir / "exports", minutes, segments, names, meta),
          cached=(run_dir / "exports" / "minutes.md").exists())
    meta["total_latency"] = round(sum(meta["timings"].values()), 2)
    _write_json(run_dir / "meta.json", meta)
    return load_run(run_id)


def load_run(run_id: str) -> RunData:
    run_dir = settings.RUNS_DIR / run_id
    if not (run_dir / "transcript.json").exists():
        raise FileNotFoundError(f"run '{run_id}' not found in {settings.RUNS_DIR}")
    segments, info = load_segments(run_dir / "transcript.json")
    return RunData(
        run_id=run_id, dir=run_dir, segments=segments, transcript_info=info,
        speakers=_read_json(run_dir / "speakers.json", {}) or {},
        minutes=_read_json(run_dir / "minutes.json", {}) or {},
        meta=_read_json(run_dir / "meta.json", {}) or {},
    )


def list_runs() -> list[dict]:
    runs = []
    if not settings.RUNS_DIR.exists():
        return runs
    for d in sorted(settings.RUNS_DIR.iterdir()):
        meta = _read_json(d / "meta.json") if d.is_dir() else None
        if meta and (d / "minutes.json").exists():
            runs.append({"run_id": d.name, "title": meta.get("title", d.name), "created": meta.get("created", ""),
                         "duration": meta.get("duration", 0)})
    return runs


def save_speaker_overrides(run_id: str, overrides: dict) -> dict:
    """Persist user renames (label -> name); returns the new speakers.json content."""
    run_dir = settings.RUNS_DIR / run_id
    data = _read_json(run_dir / "speakers.json", {}) or {}
    data["overrides"] = {k: v.strip() for k, v in overrides.items() if v and v.strip()}
    _write_json(run_dir / "speakers.json", data)
    return data


def regenerate_after_rename(run_id: str, client=None, progress: Progress | None = None) -> RunData:
    """Re-run minutes/grounding/index/export so that new speaker names flow everywhere."""
    run_dir = settings.RUNS_DIR / run_id
    for name in ("minutes_raw.json", "minutes.json", "index.npz"):
        (run_dir / name).unlink(missing_ok=True)
    shutil.rmtree(run_dir / "exports", ignore_errors=True)
    meta = _read_json(run_dir / "meta.json", {}) or {}
    source = run_dir / "audio.mp3"
    # keep the original hash so transcript/speaker caches are re-used
    meta["source_sha256"] = _sha256(source)
    _write_json(run_dir / "meta.json", meta)
    return run_pipeline(source, run_id=run_id, client=client, progress=progress,
                        participants=meta.get("participants"))
