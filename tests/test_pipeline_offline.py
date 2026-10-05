"""End-to-end orchestrator test with a fake client and a 12 s synthetic tone (no network)."""
import shutil
import subprocess

import pytest

from conftest import FakeClient
from meetingmind import orchestrator, settings
from meetingmind.audio_prep import FFMPEG, prepare_audio
from meetingmind.minutes_schema import ActionItem, Decision, Minutes, Note, Topic
from meetingmind.speaker_naming import Introduction, SpeakerGuess, SpeakerNaming

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None and not FFMPEG, reason="ffmpeg missing")

DIARIZED = [
    (0.2, 3.0, "A", "Hi, I'm Priya, the product manager."),
    (3.4, 6.0, "B", "I'm Rohan from backend."),
    (6.3, 11.5, "B", "I'll set up push notifications with Firebase Cloud Messaging by next Tuesday."),
]


def _tone(path, seconds=12):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                    str(path)], check=True)


def test_prepare_audio_converts_to_mono_16k(tmp_path):
    src = tmp_path / "tone.wav"
    _tone(src, 3)
    prep = prepare_audio(src, tmp_path / "work")
    assert prep.path.name == "audio.mp3" and abs(prep.duration - 3) < 0.2
    assert len(prep.chunks) == 1 and prep.chunks[0].offset == 0.0


def test_full_pipeline_with_fake_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "RUNS_DIR", tmp_path / "runs")
    audio = tmp_path / "meeting.wav"
    _tone(audio)
    minutes = Minutes(
        title="Notifications sync", executive_summary="Short sync.",
        topics=[Topic(title="Intros", start_segment_id="S1", end_segment_id="S3", summary="Intros and plan")],
        decisions=[],
        action_items=[ActionItem(owner="Rohan", task="Set up push notifications", due="next Tuesday",
                                 priority="medium", evidence_segment_ids=["S2"],
                                 evidence_quote="set up push notifications with Firebase Cloud Messaging")],
        open_questions=[], risks=[Note(text="None", evidence_segment_ids=["S2"])],
    )
    naming = SpeakerNaming(speakers=[
        SpeakerGuess(label="A", name="Priya", role="Product manager", evidence_segment_id="S1", confidence=0.9),
        SpeakerGuess(label="B", name="Rohan", role="Backend", evidence_segment_id="S2", confidence=0.9),
    ], introductions=[])
    client = FakeClient(parsed={"Minutes": minutes, "SpeakerNaming": naming}, diarized_segments=DIARIZED)
    events = []
    run = orchestrator.run_pipeline(audio, run_id="t1", client=client,
                                    progress=lambda st, state, d: events.append((st, state)))
    assert run.names == {"A": "Priya", "B": "Rohan"}
    assert run.minutes["action_items"][0]["grounding"]["grounded"]
    assert run.minutes["action_items"][0]["grounding"]["timestamp"] == "00:03"
    assert len(run.segments) == 2  # Rohan's two fragments (gap 0.3 s) merged into one utterance
    assert (run.dir / "index.npz").exists() and (run.dir / "exports" / "transcript.srt").exists()
    assert set(orchestrator.STAGE_LABELS) == set(run.meta["timings"])
    assert run.meta["enrolled"] is False
    assert run.meta["cost"]["total"] > 0
    stt_call = next(kw for kind, kw in client.calls if kind == "stt")
    assert stt_call["response_format"] == "diarized_json" and stt_call["chunking_strategy"] == "auto"

    # second run re-uses every cached stage: no new API calls
    n_calls = len(client.calls)
    again = orchestrator.run_pipeline(audio, run_id="t1", client=client)
    assert len(client.calls) == n_calls
    assert set(again.meta["cached_stages"]) == set(orchestrator.STAGE_LABELS)
    assert [r["run_id"] for r in orchestrator.list_runs()] == ["t1"]


def test_whisper_fallback_when_diarize_fails(tmp_path):
    from meetingmind.stt import transcribe

    audio = tmp_path / "a.wav"
    _tone(audio, 2)
    prep = prepare_audio(audio, tmp_path / "w")
    client = FakeClient(diarized_segments=[(0.0, 1.0, "A", "hello there")])
    real_create = client.audio.transcriptions.create

    def create(**kw):
        if kw["model"] == "gpt-4o-transcribe-diarize":
            raise RuntimeError("model unavailable")
        resp = real_create(**kw)
        for s in resp.segments:
            s.id = 0
        return resp

    client.audio.transcriptions.create = create
    res = transcribe(prep, client=client, model="gpt-4o-transcribe-diarize", fallback_model="whisper-1")
    assert not res.diarized and res.model == "whisper-1"
    assert res.segments[0].speaker == "?" and "model unavailable" in res.fallback_reason


MERGED = [  # pass 1: Meera's intro is wrongly given Priya's label "A"
    (0.2, 3.0, "A", "Hi, I'm Priya, the product manager."),
    (3.4, 6.0, "B", "I'm Rohan from backend."),
    (6.4, 9.6, "A", "Hello, I'm Meera, the designer."),
    (10.0, 11.8, "A", "I'll do the icon by Friday."),
]
ENROLLED = [
    (0.2, 3.0, "A", "Hi, I'm Priya, the product manager."),
    (3.4, 6.0, "B", "I'm Rohan from backend."),
    (6.4, 9.6, "C", "Hello, I'm Meera, the designer."),
    (10.0, 11.8, "C", "I'll do the icon by Friday."),
]


def test_self_enrolment_second_pass(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "RUNS_DIR", tmp_path / "runs")
    audio = tmp_path / "m.wav"
    _tone(audio)
    naming = SpeakerNaming(
        speakers=[SpeakerGuess(label="A", name="Priya", role="PM", evidence_segment_id="S1", confidence=0.6),
                  SpeakerGuess(label="B", name="Rohan", role="Backend", evidence_segment_id="S2", confidence=0.9)],
        introductions=[Introduction(name="Priya", role="PM", segment_id="S1"),
                       Introduction(name="Rohan", role="Backend", segment_id="S2"),
                       Introduction(name="Meera", role="Designer", segment_id="S3")])
    minutes = Minutes(title="t", executive_summary="s", topics=[], decisions=[], action_items=[
        ActionItem(owner="Meera", task="Create the icon", due="Friday", priority="low",
                   evidence_segment_ids=["S4"], evidence_quote="I'll do the icon by Friday")],
        open_questions=[], risks=[])
    client = FakeClient(parsed={"Minutes": minutes, "SpeakerNaming": naming}, diarized_segments=MERGED,
                        enrolled_segments=ENROLLED)
    run = orchestrator.run_pipeline(audio, run_id="enrol", client=client, participants=["Priya", "Rohan", "Meera"])
    plan = run.speakers["enrolment"]
    assert plan["needed"] and "label A covers Meera and Priya" in plan["reason"]
    assert [sp["name"] for sp in plan["speakers"]] == ["Priya", "Rohan", "Meera"]
    stt_calls = [kw for kind, kw in client.calls if kind == "stt"]
    assert len(stt_calls) == 2 and stt_calls[1]["known_speaker_names"] == ["Priya", "Rohan", "Meera"]
    assert all(r.startswith("data:audio/mpeg;base64,") for r in stt_calls[1]["known_speaker_references"])
    assert run.meta["enrolled"] is True and run.meta["speakers"] == 3
    assert run.names == {"Priya": "Priya", "Rohan": "Rohan", "Meera": "Meera"}
    assert [s.speaker for s in run.segments] == ["Priya", "Rohan", "Meera"]  # S3+S4 merged into one utterance
    assert any(u["stage"] == "enrol" for u in run.meta["usage"])
