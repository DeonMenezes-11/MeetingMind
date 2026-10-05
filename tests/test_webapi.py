"""Web API tests (FastAPI TestClient). Offline: they work on a temporary copy of the cached
sample run, and every OpenAI call goes to the FakeClient from conftest."""
import json
import os
import shutil
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from conftest import ROOT, FakeClient
from meetingmind import ask as ask_mod
from meetingmind import orchestrator, settings, webapi
from meetingmind.followups import EmailBundle, EmailDraft

SAMPLE = ROOT / "runs" / "sample"
pytestmark = pytest.mark.skipif(not (SAMPLE / "minutes.json").exists(), reason="cached sample run missing")


@pytest.fixture
def client(tmp_path, monkeypatch):
    runs = tmp_path / "runs"
    shutil.copytree(SAMPLE, runs / "sample")
    (runs / "sample" / "actions_edited.json").unlink(missing_ok=True)
    monkeypatch.setattr(settings, "RUNS_DIR", runs)
    with TestClient(webapi.create_app()) as c:
        yield c


def _fake_index(monkeypatch, reply: str):
    """Rebuild the sample index with the fake (bag-of-words) embedder and route get_client to it."""
    fake = FakeClient(chat_reply=reply)
    run = orchestrator.load_run("sample")
    index, _ = ask_mod.build_index(run.segments, run.names, client=fake, model="text-embedding-3-small")
    index.save(run.dir / "index.npz")
    monkeypatch.setattr(settings, "get_client", lambda *a, **k: fake)
    return fake


# ------------------------------------------------------------------ meta / runs
def test_health_never_exposes_the_key(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["models"]["chat"]
    key = os.getenv("OPENAI_API_KEY")
    if key:
        assert key not in r.text and key[:12] not in r.text


def test_runs_library_and_detail(client):
    lib = client.get("/api/runs").json()["runs"]
    card = next(c for c in lib if c["run_id"] == "sample")
    assert card["counts"]["actions"] >= 1 and card["speakers"] and card["is_sample"]
    d = client.get("/api/runs/sample").json()
    assert len(d["segments"]) == d["meta"]["segments"]
    assert [s["index"] for s in d["speakers"]] == list(range(len(d["speakers"])))
    assert all(a["id"].startswith("a") and a["source"] == "ai" for a in d["actions"])
    assert d["audio_url"] == "/api/runs/sample/audio" and "source_sha256" not in d["meta"]


def test_bad_and_missing_ids(client):
    assert client.get("/api/runs/bad.id").status_code == 400
    r = client.get("/api/runs/nope")
    assert r.status_code == 404 and "not found" in r.json()["error"]
    assert client.get("/api/whatever").json()["error"].startswith("Unknown API route")


# ------------------------------------------------------------------ audio
def test_audio_supports_range_requests(client):
    size = (SAMPLE / "audio.mp3").stat().st_size
    full = client.get("/api/runs/sample/audio")
    assert full.status_code == 200 and full.headers["accept-ranges"] == "bytes" and len(full.content) == size
    part = client.get("/api/runs/sample/audio", headers={"Range": "bytes=1000-1999"})
    assert part.status_code == 206 and part.headers["content-range"] == f"bytes 1000-1999/{size}"
    assert part.content == full.content[1000:2000]
    tail = client.get("/api/runs/sample/audio", headers={"Range": "bytes=-500"})
    assert tail.status_code == 206 and tail.content == full.content[-500:]
    bad = client.get("/api/runs/sample/audio", headers={"Range": f"bytes={size + 10}-"})
    assert bad.status_code == 416 and bad.headers["content-range"] == f"bytes */{size}"


# ------------------------------------------------------------------ speakers
def test_rename_speakers_round_trip(client):
    d = client.put("/api/runs/sample/speakers", json={"overrides": {"Meera": "  Mira  K "}}).json()
    assert {s["speaker"] for s in d["segments"]} >= {"Mira K"}
    assert next(s for s in d["speakers"] if s["label"] == "Meera")["renamed"]
    assert d["names_changed_since_minutes"]
    assert client.put("/api/runs/sample/speakers", json={"overrides": {"Zed": "X"}}).status_code == 400
    back = client.put("/api/runs/sample/speakers", json={"overrides": {}}).json()
    assert not back["names_changed_since_minutes"] and "Meera" in {s["speaker"] for s in back["segments"]}


# ------------------------------------------------------------------ actions / emails / exports
def test_actions_are_saved_and_flow_into_emails_and_csv(client):
    rows = client.get("/api/runs/sample").json()["actions"]
    rows[0]["owner"], rows[0]["include"] = "Arjun", False
    body = {"rows": [*rows, {"id": "", "owner": "Meera", "task": "Book the seminar hall", "due": "Friday",
                             "priority": "urgent", "include": True},
                     {"id": "", "owner": "x", "task": "   "}]}
    saved = client.put("/api/runs/sample/actions", json=body).json()
    assert saved["actions_edited"] and len(saved["actions"]) == len(rows) + 1  # blank task dropped
    manual = saved["actions"][-1]
    assert manual["source"] == "manual" and manual["priority"] == "medium" and not manual["grounded"]
    again = client.get("/api/runs/sample").json()
    assert again["actions_edited"] and again["actions"][0]["owner"] == "Arjun"

    mails = client.post("/api/runs/sample/emails", json={"tone": "friendly", "sender": "Priya"}).json()
    assert mails["mode"] == "template" and mails["excluded"][0]["id"] == rows[0]["id"]
    meera = next(m for m in mails["emails"] if m["to"] == "Meera")
    assert "Book the seminar hall" in meera["body"] and meera["body"].startswith("Hi Meera")
    assert rows[0]["task"] not in "".join(m["body"] for m in mails["emails"] if m["kind"] == "owner")

    csv_text = client.get("/api/runs/sample/export/csv").text
    assert "Book the seminar hall" in csv_text
    reset = client.delete("/api/runs/sample/actions").json()
    assert not reset["actions_edited"] and len(reset["actions"]) == len(rows)


def test_ai_emails_use_the_structured_drafter(client, monkeypatch):
    bundle = EmailBundle(emails=[EmailDraft(kind="owner", to="Rohan", subject="Hi", body="Rohan tasks"),
                                 EmailDraft(kind="owner", to="Nobody", subject="x", body="invented"),
                                 EmailDraft(kind="recap", to="Team", subject="Recap", body="All")])
    monkeypatch.setattr(settings, "get_client", lambda *a, **k: FakeClient(parsed={"EmailBundle": bundle}))
    r = client.post("/api/runs/sample/emails", json={"mode": "ai"}).json()
    assert r["mode"] == "ai" and [e["to"] for e in r["emails"]] == ["Rohan", "Team"] and r["cost"] > 0


@pytest.mark.parametrize("kind,needle", [("md", "# "), ("json", '"action_items"'), ("srt", "-->"), ("csv", "owner")])
def test_exports(client, kind, needle):
    r = client.get(f"/api/runs/sample/export/{kind}")
    assert r.status_code == 200 and needle in r.text and "attachment" in r.headers["content-disposition"]


def test_unknown_export_kind(client):
    assert client.get("/api/runs/sample/export/pdf").status_code == 404


# ------------------------------------------------------------------ ask
def test_ask_returns_cited_answer(client, monkeypatch):
    _fake_index(monkeypatch, "Rohan builds the event schedule and registration API [02:08].")
    r = client.post("/api/runs/sample/ask", json={"question": "Who builds the registration API for the schedule?"})
    out = r.json()
    assert r.status_code == 200 and out["found"] and out["citations"][0]["timestamp"] == "02:08"
    assert out["hits"] and "usage" not in out


def test_ask_not_found_and_validation(client, monkeypatch):
    _fake_index(monkeypatch, "NOT_FOUND")
    out = client.post("/api/runs/sample/ask", json={"question": "What is the capital of Australia?"}).json()
    assert out["found"] is False
    assert client.post("/api/runs/sample/ask", json={"question": "  "}).status_code == 400
    assert client.post("/api/runs/sample/ask", json={"question": "x" * 501}).status_code == 400
    assert client.post("/api/runs/sample/ask", json={}).status_code == 422


# ------------------------------------------------------------------ jobs
def _wait(client, job_id, timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        snap = client.get(f"/api/jobs/{job_id}").json()
        if snap["status"] in ("done", "error"):
            return snap
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_upload_validation(client, monkeypatch):
    f = {"file": ("talk.mp3", b"ID3fake", "audio/mpeg")}
    assert client.post("/api/jobs", files=f, data={"consent": "false"}).status_code == 400
    bad = client.post("/api/jobs", files={"file": ("notes.txt", b"hello", "text/plain")}, data={"consent": "true"})
    assert bad.status_code == 415
    empty = client.post("/api/jobs", files={"file": ("a.wav", b"", "audio/wav")}, data={"consent": "true"})
    assert empty.status_code == 400
    monkeypatch.setattr(settings, "key_status", lambda: {"configured": False, "source": None})
    assert client.post("/api/jobs", files=f, data={"consent": "true"}).status_code == 503


def test_upload_job_streams_progress_events(client, monkeypatch):
    seen = {}

    def fake_pipeline(audio_path, run_id=None, progress=None, participants=None, **kw):
        seen.update(path=audio_path, participants=participants, exists=audio_path.exists())
        for key in ("prepare", "transcribe", "minutes"):
            progress(key, "running", key)
            progress(key, "done", "0.1s")
        return SimpleNamespace(run_id=run_id)

    monkeypatch.setattr(orchestrator, "run_pipeline", fake_pipeline)
    r = client.post("/api/jobs", files={"file": ("Team Sync!.mp3", b"ID3data", "audio/mpeg")},
                    data={"consent": "true", "participants": "Asha, Ben\nChen"})
    job_id, run_id = r.json()["job_id"], r.json()["run_id"]
    snap = _wait(client, job_id)
    assert snap["status"] == "done" and snap["run_id"] == run_id and run_id.startswith("team_sync")
    assert seen["exists"] and seen["participants"] == ["Asha", "Ben", "Chen"]
    assert not seen["path"].exists()  # temp upload cleaned up afterwards

    with client.stream("GET", f"/api/jobs/{job_id}/events") as s:
        text = "".join(s.iter_text())
    events = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
    kinds = [(e["type"], e.get("status") or e.get("stage")) for e in events]
    assert kinds[0] == ("status", "queued") and kinds[1] == ("status", "running")
    assert ("stage", "transcribe") in kinds and events[-1] == {**events[-1], "type": "done", "run_id": run_id}


def test_failed_job_reports_error(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("diarization service unavailable\nstack")

    monkeypatch.setattr(orchestrator, "run_pipeline", boom)
    job_id = client.post("/api/jobs", files={"file": ("x.wav", b"RIFF", "audio/wav")},
                         data={"consent": "true"}).json()["job_id"]
    snap = _wait(client, job_id)
    assert snap["status"] == "error" and snap["error"] == "diarization service unavailable"


def test_sample_opens_cached_run_without_a_job(client):
    assert client.post("/api/jobs/sample").json() == {"job_id": None, "run_id": "sample"}


def test_unknown_job(client):
    assert client.get("/api/jobs/nope").status_code == 404


# ------------------------------------------------------------------ single-page app
def test_spa_fallback_and_assets(client, tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>")
    (dist / "assets" / "app-123.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("nope")
    monkeypatch.setattr(webapi, "WEB_DIST", dist)
    page = client.get("/m/sample/transcript")
    assert page.status_code == 200 and "root" in page.text and page.headers["cache-control"] == "no-cache"
    js = client.get("/assets/app-123.js")
    assert js.text == "console.log(1)" and "immutable" in js.headers["cache-control"]
    assert "nope" not in client.get("/%2e%2e/secret.txt").text


def test_spa_not_built_message(client, tmp_path, monkeypatch):
    monkeypatch.setattr(webapi, "WEB_DIST", tmp_path / "missing")
    r = client.get("/")
    assert r.status_code == 503 and "npm --prefix web run build" in r.text
