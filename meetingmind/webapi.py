"""FastAPI backend for the MeetingMind web app.

It is a thin HTTP layer over the existing package - every number, transcript line and
minute shown in the browser comes from the same functions the CLI uses:

  GET  /api/health                      key status (never the key) + model names
  GET  /api/runs                        meeting library cards
  GET  /api/runs/{id}                   everything the workspace needs in one payload
  GET  /api/runs/{id}/audio             playback with HTTP Range support (seeking)
  PUT  /api/runs/{id}/speakers          rename speakers (label -> name)
  POST /api/runs/{id}/regenerate        background job: minutes/index/exports with new names
  PUT  /api/runs/{id}/actions           save the reviewed action-item table   (DELETE resets it)
  POST /api/runs/{id}/ask               "Ask the Meeting" (RAG with timestamp citations)
  POST /api/runs/{id}/emails            follow-up emails (template or AI) from the reviewed table
  GET  /api/runs/{id}/export/{kind}     md | json | csv | srt downloads
  POST /api/jobs                        upload a recording -> background processing job
  POST /api/jobs/sample                 open (or process) the bundled sample meeting
  GET  /api/jobs/{id}                   job snapshot;  GET /api/jobs/{id}/events -> server-sent events
  GET  /api/scorecard                   evaluation results for the About page

Everything that is not /api/* is the single-page app built into web/dist.
"""
from __future__ import annotations

import asyncio
import json
import re
import shutil
import tempfile
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import orchestrator, settings
from .ask import answer_question
from .exporters import minutes_json, minutes_markdown, rows_csv, transcript_srt
from .followups import action_rows, ai_emails, template_emails
from .segments import fmt_ts, speaker_name
from .speaker_naming import resolve_names, speaker_stats

WEB_DIST = settings.PROJECT_ROOT / "web" / "dist"
RUN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
ALLOWED_EXT = {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg", ".oga", ".mpeg", ".mpga", ".flac", ".aac"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
PRIORITIES = ("high", "medium", "low")
SAMPLE_RUN_ID = "sample"
SAMPLE_AUDIO = settings.SAMPLES_DIR / "sprint_meeting.mp3"
SAMPLE_SCRIPT = settings.SAMPLES_DIR / "sprint_meeting.json"


# ============================================================================ helpers
def _read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
    except (OSError, json.JSONDecodeError):
        return default


def _run_dir(run_id: str) -> Path:
    if not RUN_ID_RE.match(run_id or ""):
        raise HTTPException(400, "Invalid meeting id.")
    d = settings.RUNS_DIR / run_id
    if not (d / "transcript.json").exists() or not (d / "minutes.json").exists():
        raise HTTPException(404, f"Meeting '{run_id}' was not found.")
    return d


def _load(run_id: str) -> orchestrator.RunData:
    _run_dir(run_id)
    try:
        return orchestrator.load_run(run_id)
    except FileNotFoundError:
        raise HTTPException(404, f"Meeting '{run_id}' was not found.") from None


def _speaker_order(run: orchestrator.RunData) -> list[str]:
    """Diarization labels in order of first appearance (drives the colour palette)."""
    order: list[str] = []
    for s in run.segments:
        if s.speaker not in order:
            order.append(s.speaker)
    return order


def _base_rows(run: orchestrator.RunData) -> list[dict]:
    rows = action_rows(run.minutes)
    items = run.minutes.get("action_items", [])
    for i, (row, item) in enumerate(zip(rows, items)):
        g = item.get("grounding", {})
        row.update(id=f"a{i + 1}", source="ai", quote=item.get("evidence_quote", ""),
                   segment_ids=g.get("valid_ids", []), timestamp=g.get("timestamp", ""))
    return rows


def _current_rows(run: orchestrator.RunData) -> tuple[list[dict], bool]:
    edited = _read_json(run.dir / "actions_edited.json")
    if isinstance(edited, list):
        return edited, True
    return _base_rows(run), False


def _require_key() -> None:
    if not settings.key_status()["configured"]:
        raise HTTPException(503, "No OpenAI API key is configured. Add OPENAI_API_KEY to the .env file and restart.")


def _api_error(exc: Exception) -> HTTPException:
    msg = str(exc).splitlines()[0][:300] if str(exc) else type(exc).__name__
    return HTTPException(502, f"The AI service call failed: {msg}")


def run_summary(run_id: str) -> dict | None:
    d = settings.RUNS_DIR / run_id
    meta = _read_json(d / "meta.json")
    minutes = _read_json(d / "minutes.json")
    if not meta or not minutes:
        return None
    transcript = _read_json(d / "transcript.json", {}) or {}
    speakers = _read_json(d / "speakers.json", {}) or {}
    names = resolve_names(speakers.get("inferred", {}), speakers.get("overrides", {}))
    order: list[str] = []
    for s in transcript.get("segments", []):
        if s.get("speaker") not in order:
            order.append(s.get("speaker"))
    gs = minutes.get("grounding_summary", {}) or {}
    return {
        "run_id": run_id,
        "title": meta.get("title") or minutes.get("title") or run_id,
        "summary": minutes.get("executive_summary", ""),
        "created": meta.get("created", ""),
        "duration": meta.get("duration", 0),
        "source_name": meta.get("source_name", ""),
        "speakers": [speaker_name(lbl, names) for lbl in order],
        "counts": {
            "decisions": len(minutes.get("decisions", []) or []),
            "actions": len(minutes.get("action_items", []) or []),
            "questions": len(minutes.get("open_questions", []) or []),
            "risks": len(minutes.get("risks", []) or []),
        },
        "grounding": {"checked": gs.get("checked", 0), "grounded": gs.get("grounded", 0), "rate": gs.get("rate", 0)},
        "cost": (meta.get("cost") or {}).get("total", 0),
        "is_sample": run_id.startswith(SAMPLE_RUN_ID),
    }


def run_payload(run: orchestrator.RunData) -> dict:
    names = run.names
    order = _speaker_order(run)
    stats = {r["speaker"]: r for r in speaker_stats(run.segments, names)}
    inferred = run.speakers.get("inferred", {}) or {}
    overrides = run.speakers.get("overrides", {}) or {}
    speakers = []
    for i, label in enumerate(order):
        name = speaker_name(label, names)
        inf = inferred.get(label, {}) or {}
        st = stats.get(name, {})
        speakers.append({
            "label": label, "name": name, "index": i,
            "role": inf.get("role", ""), "method": inf.get("method", "llm-introductions"),
            "confidence": inf.get("confidence"), "evidence": inf.get("evidence", ""),
            "renamed": label in overrides,
            "talk_time": st.get("talk_time", 0.0), "share": st.get("share", 0.0), "turns": st.get("turns", 0),
            "words": st.get("words", 0), "wpm": st.get("wpm", 0.0),
        })
    rows, edited = _current_rows(run)
    meta = dict(run.meta)
    meta.pop("source_sha256", None)
    return {
        "run_id": run.run_id,
        "title": meta.get("title") or run.minutes.get("title") or run.run_id,
        "meta": meta,
        "transcript": {k: run.transcript_info.get(k) for k in
                       ("model", "diarized", "fallback_reason", "enrolled", "enrolment_reason", "enrolment_error")},
        "segments": [{"id": s.id, "start": round(s.start, 3), "end": round(s.end, 3), "label": s.speaker,
                      "speaker": speaker_name(s.speaker, names), "text": s.text} for s in run.segments],
        "speakers": speakers,
        "introductions": run.speakers.get("introductions", []),
        "participants": run.speakers.get("participants") or [],
        "names_changed_since_minutes": bool(overrides) and not run.speakers.get("minutes_names_current", False),
        "minutes": run.minutes,
        "actions": rows,
        "actions_edited": edited,
        "has_index": (run.dir / "index.npz").exists(),
        "audio_url": f"/api/runs/{run.run_id}/audio",
    }


# ============================================================================ jobs
@dataclass
class Job:
    id: str
    kind: str  # "process" | "regenerate" | "sample"
    title: str
    run_id: str | None = None
    status: str = "queued"  # queued | running | done | error
    error: str | None = None
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    events: list[dict] = field(default_factory=list)

    def snapshot(self) -> dict:
        d = asdict(self)
        d["stages"] = [{"key": k, "label": label} for k, label in orchestrator.STAGES]
        d["elapsed"] = round((self.finished or time.time()) - (self.started or self.created), 1)
        return d


class JobManager:
    """One pipeline at a time (a lock), each job in its own daemon thread; events are
    appended to the job and polled by the SSE endpoint."""

    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pipeline = threading.Lock()

    def get(self, job_id: str) -> Job:
        job = self.jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found.")
        return job

    def active(self) -> list[Job]:
        return [j for j in self.jobs.values() if j.status in ("queued", "running")]

    def _emit(self, job: Job, **event) -> None:
        event["t"] = round(time.time() - (job.started or job.created), 2)
        with self._lock:
            job.events.append(event)

    def submit(self, kind: str, title: str, work, cleanup=None, run_id: str | None = None) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], kind=kind, title=title, run_id=run_id)
        self.jobs[job.id] = job
        self._emit(job, type="status", status="queued")

        def runner():
            try:
                with self._pipeline:
                    job.status, job.started = "running", time.time()
                    self._emit(job, type="status", status="running")
                    progress = lambda stage, state, detail: self._emit(  # noqa: E731
                        job, type="stage", stage=stage, state=state, detail=detail)
                    result = work(progress)
                    job.run_id = getattr(result, "run_id", None) or job.run_id
                    job.status = "done"
                    self._emit(job, type="done", run_id=job.run_id)
            except Exception as exc:  # surfaced to the UI, never crashes the server
                job.status = "error"
                job.error = str(exc).splitlines()[0][:400] if str(exc) else type(exc).__name__
                self._emit(job, type="error", message=job.error)
            finally:
                job.finished = time.time()
                if cleanup:
                    cleanup()

        threading.Thread(target=runner, name=f"mm-job-{job.id}", daemon=True).start()
        return job


# ============================================================================ request bodies
class SpeakersBody(BaseModel):
    overrides: dict[str, str] = Field(default_factory=dict)


class ActionRow(BaseModel):
    id: str = ""
    owner: str = "Unassigned"
    task: str = ""
    due: str = "Not specified"
    priority: str = "medium"
    include: bool = True


class ActionsBody(BaseModel):
    rows: list[ActionRow]


class AskBody(BaseModel):
    question: str


class EmailsBody(BaseModel):
    tone: str = "formal"
    mode: str = "template"
    sender: str = "Meeting organiser"


# ============================================================================ app
def create_app() -> FastAPI:
    app = FastAPI(title="MeetingMind", version="2.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
                  redoc_url=None)
    jobs = JobManager()
    app.state.jobs = jobs

    # ------------------------------------------------------------------ meta
    @app.get("/api/health")
    def health():
        m = settings.models()
        return {"ok": True, "key": settings.key_status(), "models": asdict(m),
                "jobs_active": len(jobs.active()), "web_built": (WEB_DIST / "index.html").exists()}

    @app.get("/api/scorecard")
    def scorecard():
        data = _read_json(settings.RESULTS_DIR / "scorecard.json", [])
        return data if isinstance(data, list) else []

    # ------------------------------------------------------------------ runs
    @app.get("/api/runs")
    def runs():
        out = [s for r in orchestrator.list_runs() if (s := run_summary(r["run_id"]))]
        samples = [r for r in out if r["is_sample"]]
        others = sorted((r for r in out if not r["is_sample"]), key=lambda r: r["created"], reverse=True)
        return {"runs": others + samples, "active_jobs": [j.snapshot() for j in jobs.active()]}

    @app.get("/api/runs/{run_id}")
    def run_detail(run_id: str):
        return run_payload(_load(run_id))

    @app.get("/api/runs/{run_id}/audio")
    def run_audio(run_id: str, request: Request):
        path = _run_dir(run_id) / "audio.mp3"
        if not path.exists():
            raise HTTPException(404, "Audio not found for this meeting.")
        return range_response(path, request.headers.get("range"), "audio/mpeg")

    @app.put("/api/runs/{run_id}/speakers")
    def rename_speakers(run_id: str, body: SpeakersBody):
        run = _load(run_id)
        labels = set(_speaker_order(run))
        clean = {}
        for label, name in body.overrides.items():
            if label not in labels:
                raise HTTPException(400, f"Unknown speaker label '{label}'.")
            name = re.sub(r"\s+", " ", (name or "")).strip()[:40]
            if name and name != speaker_name(label, resolve_names(run.speakers.get("inferred", {}), {})):
                clean[label] = name
        data = orchestrator.save_speaker_overrides(run_id, clean)
        data["minutes_names_current"] = not clean
        (run.dir / "speakers.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return run_payload(_load(run_id))

    @app.post("/api/runs/{run_id}/regenerate")
    def regenerate(run_id: str):
        run = _load(run_id)
        _require_key()

        def work(progress):
            result = orchestrator.regenerate_after_rename(run_id, progress=progress)
            sp = _read_json(run.dir / "speakers.json", {}) or {}
            sp["minutes_names_current"] = True
            (run.dir / "speakers.json").write_text(json.dumps(sp, indent=2, ensure_ascii=False), encoding="utf-8")
            (run.dir / "actions_edited.json").unlink(missing_ok=True)  # owners may have changed
            return result

        job = jobs.submit("regenerate", run.meta.get("title", run_id), work, run_id=run_id)
        return {"job_id": job.id, "run_id": run_id}

    @app.put("/api/runs/{run_id}/actions")
    def save_actions(run_id: str, body: ActionsBody):
        run = _load(run_id)
        base = {r["id"]: r for r in _base_rows(run)}
        rows = []
        for n, r in enumerate(body.rows, start=1):
            task = r.task.strip()[:500]
            if not task:
                continue
            src = base.get(r.id)
            manual_id = r.id if re.fullmatch(r"m[a-z0-9]{3,16}", r.id or "") else f"m{uuid.uuid4().hex[:6]}"
            row = dict(src) if src else {"id": manual_id, "source": "manual", "grounded": False,
                                         "evidence": "added by reviewer", "start": None, "score": 0.0,
                                         "quote": "", "segment_ids": [], "timestamp": ""}
            row.update(owner=r.owner.strip()[:60] or "Unassigned", task=task,
                       due=r.due.strip()[:60] or "Not specified",
                       priority=r.priority if r.priority in PRIORITIES else "medium", include=bool(r.include))
            if src and (row["task"] != src["task"]):
                row["edited"] = True
            rows.append(row)
        (run.dir / "actions_edited.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
        return {"actions": rows, "actions_edited": True}

    @app.delete("/api/runs/{run_id}/actions")
    def reset_actions(run_id: str):
        run = _load(run_id)
        (run.dir / "actions_edited.json").unlink(missing_ok=True)
        return {"actions": _base_rows(run), "actions_edited": False}

    @app.post("/api/runs/{run_id}/ask")
    def ask(run_id: str, body: AskBody):
        run = _load(run_id)
        question = body.question.strip()
        if not question:
            raise HTTPException(400, "Please type a question.")
        if len(question) > 500:
            raise HTTPException(400, "Questions are limited to 500 characters.")
        index = run.index()
        if index is None:
            raise HTTPException(409, "This meeting has no Q&A index yet.")
        _require_key()
        try:
            res = answer_question(question, index, run.segments)
        except HTTPException:
            raise
        except Exception as exc:
            raise _api_error(exc) from exc
        out = asdict(res)
        out["cost"] = round(sum(float(u.get("cost", 0)) for u in res.usage), 6)
        out.pop("usage", None)
        return out

    @app.post("/api/runs/{run_id}/emails")
    def emails(run_id: str, body: EmailsBody):
        run = _load(run_id)
        rows, _ = _current_rows(run)
        tone = body.tone if body.tone in ("formal", "friendly") else "formal"
        sender = re.sub(r"\s+", " ", body.sender).strip()[:60] or "Meeting organiser"
        title = run.minutes.get("title", run_id)
        summary = run.minutes.get("executive_summary", "")
        decisions = [d["text"] for d in run.minutes.get("decisions", []) if d.get("grounding", {}).get("grounded")]
        excluded = [r for r in rows if not r.get("include")]
        if body.mode == "ai":
            _require_key()
            try:
                drafts, usage = ai_emails(rows, title, summary, decisions, tone=tone, sender=sender)
            except Exception as exc:
                raise _api_error(exc) from exc
            cost = round(float(usage.get("cost", 0)), 6)
        else:
            drafts, cost = template_emails(rows, title, summary, decisions, tone=tone, sender=sender), 0.0
        return {"emails": drafts, "excluded": excluded, "mode": "ai" if body.mode == "ai" else "template",
                "cost": cost}

    @app.get("/api/runs/{run_id}/export/{kind}")
    def export(run_id: str, kind: str):
        run = _load(run_id)
        names = run.names
        if kind == "md":
            text, mime, fname = minutes_markdown(run.minutes, run.segments, names, run.meta), "text/markdown", "minutes.md"
        elif kind == "json":
            text, mime, fname = minutes_json(run.minutes), "application/json", "minutes.json"
        elif kind == "csv":
            text, mime, fname = rows_csv(_current_rows(run)[0]), "text/csv", "action_items.csv"
        elif kind == "srt":
            text, mime, fname = transcript_srt(run.segments, names), "application/x-subrip", "transcript.srt"
        else:
            raise HTTPException(404, "Unknown export type (use md, json, csv or srt).")
        return Response(text, media_type=f"{mime}; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{run_id}_{fname}"'})

    # ------------------------------------------------------------------ jobs
    @app.post("/api/jobs")
    async def upload(file: UploadFile = File(...), participants: str = Form(""), consent: bool = Form(False)):
        if not consent:
            raise HTTPException(400, "Please confirm that everyone in the recording agreed to be recorded.")
        _require_key()
        raw_name = Path(file.filename or "recording").name
        suffix = Path(raw_name).suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise HTTPException(415, f"Unsupported file type '{suffix or '?'}'. Use mp3, wav, m4a, mp4, webm or ogg.")
        safe = re.sub(r"[^A-Za-z0-9._ -]", "_", raw_name)[:100] or f"recording{suffix}"
        tmp = Path(tempfile.mkdtemp(prefix="mm_upload_"))
        dest = tmp / safe
        size = 0
        with open(dest, "wb") as fh:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    fh.close()
                    shutil.rmtree(tmp, ignore_errors=True)
                    raise HTTPException(413, "The file is larger than 200 MB.")
                fh.write(chunk)
        if size == 0:
            shutil.rmtree(tmp, ignore_errors=True)
            raise HTTPException(400, "The uploaded file is empty.")
        people = [p.strip()[:40] for p in re.split(r"[,\n]", participants) if p.strip()][:12] or None
        run_id = orchestrator.new_run_id(safe)
        job = jobs.submit(
            "process", Path(safe).stem,
            lambda progress: orchestrator.run_pipeline(dest, run_id=run_id, progress=progress, participants=people),
            cleanup=lambda: shutil.rmtree(tmp, ignore_errors=True), run_id=run_id)
        return {"job_id": job.id, "run_id": run_id}

    @app.post("/api/jobs/sample")
    def sample():
        if run_summary(SAMPLE_RUN_ID):
            return {"job_id": None, "run_id": SAMPLE_RUN_ID}
        if not SAMPLE_AUDIO.exists():
            raise HTTPException(404, "The sample recording is missing - run `python3 cli.py make-sample`.")
        _require_key()
        script = _read_json(SAMPLE_SCRIPT, {}) or {}
        people = list((script.get("speakers") or {}).keys()) or None
        job = jobs.submit("sample", "Sample meeting", lambda progress: orchestrator.run_pipeline(
            SAMPLE_AUDIO, run_id=SAMPLE_RUN_ID, progress=progress, participants=people), run_id=SAMPLE_RUN_ID)
        return {"job_id": job.id, "run_id": SAMPLE_RUN_ID}

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str):
        return jobs.get(job_id).snapshot()

    @app.get("/api/jobs/{job_id}/events")
    async def job_events(job_id: str, request: Request):
        job = jobs.get(job_id)

        async def stream():
            sent = 0
            yield "retry: 2000\n\n"
            last_beat = time.time()
            while True:
                if await request.is_disconnected():
                    return
                pending = job.events[sent:]
                for ev in pending:
                    yield f"data: {json.dumps(ev)}\n\n"
                sent += len(pending)
                if job.status in ("done", "error") and sent >= len(job.events):
                    return
                if time.time() - last_beat > 15:
                    yield ": keep-alive\n\n"
                    last_beat = time.time()
                await asyncio.sleep(0.25)

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"])
    def api_not_found(rest: str):
        raise HTTPException(404, f"Unknown API route /api/{rest}")

    # ------------------------------------------------------------------ single-page app
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        index = WEB_DIST / "index.html"
        if not index.exists():
            return HTMLResponse(NOT_BUILT_HTML, status_code=503)
        if path:
            candidate = (WEB_DIST / path).resolve()
            if candidate.is_file() and WEB_DIST.resolve() in candidate.parents:
                cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_request: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        first = (exc.errors() or [{}])[0]
        where = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        return JSONResponse({"error": f"Invalid request: {where} {first.get('msg', '')}".strip()}, status_code=422)

    return app


def range_response(path: Path, range_header: str | None, media_type: str) -> Response:
    """Serve a file with single-range support so browsers can seek inside the audio."""
    size = path.stat().st_size
    base = {"Accept-Ranges": "bytes", "Cache-Control": "no-cache"}
    if not range_header:
        return FileResponse(path, media_type=media_type, headers=base)
    m = re.fullmatch(r"\s*bytes=(\d*)-(\d*)\s*", range_header)
    if not m or (not m.group(1) and not m.group(2)):
        return Response(status_code=416, headers={**base, "Content-Range": f"bytes */{size}"})
    if m.group(1):
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
    else:  # suffix range: last N bytes
        start, end = max(0, size - int(m.group(2))), size - 1
    end = min(end, size - 1)
    if start >= size or start > end:
        return Response(status_code=416, headers={**base, "Content-Range": f"bytes */{size}"})
    with open(path, "rb") as fh:
        fh.seek(start)
        data = fh.read(end - start + 1)
    return Response(data, status_code=206, media_type=media_type,
                    headers={**base, "Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(len(data))})


NOT_BUILT_HTML = """<!doctype html><meta charset="utf-8"><title>MeetingMind</title>
<body style="font-family:system-ui;max-width:560px;margin:80px auto;line-height:1.5">
<h1>MeetingMind API is running</h1><p>The web front end has not been built yet. Run:</p>
<pre style="background:#f1f5f9;padding:12px;border-radius:8px">npm --prefix web install
npm --prefix web run build</pre><p>then reload this page. The API docs are at <a href="/api/docs">/api/docs</a>.</p>"""
