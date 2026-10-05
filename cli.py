#!/usr/bin/env python3
"""MeetingMind command-line interface.

  python3 cli.py make-sample                       # build the synthetic gold meeting (+ noisy copy)
  python3 cli.py run <audio> [--run-id sample]     # full pipeline, cached under runs/<run_id>/
  python3 cli.py ask <run_id> "question"           # retrieval-augmented Q&A with [mm:ss] citations
  python3 cli.py eval                              # scorecard for the clean + noisy sample runs
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from meetingmind import settings  # noqa: E402
from meetingmind.orchestrator import STAGE_LABELS, list_runs, load_run, run_pipeline  # noqa: E402
from meetingmind.segments import fmt_ts, speaker_name  # noqa: E402
from meetingmind.speaker_naming import speaker_stats  # noqa: E402


def _progress(stage: str, state: str, detail: str) -> None:
    icon = {"running": "..", "done": "ok", "cached": "==", "error": "!!"}.get(state, "  ")
    label = STAGE_LABELS.get(stage, stage)
    if state == "running" and detail != label:
        print(f"   [{icon}] {stage:<10} {detail}", flush=True)
    elif state == "running":
        print(f"   [{icon}] {stage:<10} {label}", flush=True)
    else:
        print(f"   [{icon}] {stage:<10} {state} ({detail})", flush=True)


def cmd_make_sample(args) -> int:
    from samples.build_sample import build

    doc = build(force=args.force)
    print(f"gold: {len(doc['gold']['action_items'])} action items, {len(doc['gold']['decisions'])} decisions, "
          f"{len(doc['gold']['open_questions'])} open questions, {len(doc['gold']['risks'])} risks")
    return 0


def cmd_run(args) -> int:
    audio = Path(args.audio)
    print(f"MeetingMind run: {audio.name}  (run id: {args.run_id or 'auto'})")
    t0 = time.perf_counter()
    participants = [x.strip() for x in (args.participants or "").split(",") if x.strip()] or None
    run = run_pipeline(audio, run_id=args.run_id, progress=_progress, force=args.force, participants=participants)
    meta, names, minutes = run.meta, run.names, run.minutes
    print(f"\nRun '{run.run_id}' finished in {time.perf_counter() - t0:.1f}s wall "
          f"(pipeline stages total {meta.get('total_latency', 0):.1f}s; cached: {', '.join(meta['cached_stages']) or 'none'})")
    print(f"STT model: {meta.get('stt_model_used')}  diarized={meta.get('diarized')}"
          + (f"  fallback reason: {meta['fallback_reason']}" if meta.get("fallback_reason") else ""))
    enrol = run.speakers.get("enrolment", {})
    print(f"Self-enrolment pass: {'yes' if meta.get('enrolled') else 'no'} ({enrol.get('reason', '-')})")
    for sp in enrol.get("speakers", []) if meta.get("enrolled") else []:
        print(f"   reference clip {sp['name']:<8} {sp['clip_start']:6.2f}-{sp['clip_end']:6.2f}s (intro {sp['segment_id']})")
    print(f"Audio {fmt_ts(meta.get('duration', 0))}, {meta.get('segments')} segments, {meta.get('speakers')} speakers")
    print("Speakers:")
    inferred = run.speakers.get("inferred", {})
    for row in speaker_stats(run.segments, names):
        label = next((lab for lab in inferred if speaker_name(lab, names) == row["speaker"]), "?")
        role = inferred.get(label, {}).get("role", "")
        print(f"   {label} -> {row['speaker']:<10} {role:<20} talk {row['talk_time']:>5.1f}s "
              f"({row['share']:.0%}), {row['turns']} turns")
    print(f"\nMinutes: {minutes.get('title')}")
    print(f"   {len(minutes.get('topics', []))} topics, {len(minutes.get('decisions', []))} decisions, "
          f"{len(minutes.get('action_items', []))} action items, {len(minutes.get('open_questions', []))} open "
          f"questions, {len(minutes.get('risks', []))} risks")
    for d in minutes.get("decisions", []):
        g = d["grounding"]
        print(f"   {'OK  ' if g['grounded'] else 'WARN'} decision [{g['timestamp']}] {d['text']}")
    for a in minutes.get("action_items", []):
        g = a["grounding"]
        print(f"   {'OK  ' if g['grounded'] else 'WARN'} action   [{g['timestamp']}] {a['owner']}: {a['task']} "
              f"(due {a['due']}, {a['priority']})")
    gs = minutes.get("grounding_summary", {})
    print(f"Grounding: {gs.get('grounded')}/{gs.get('checked')} items verified ({gs.get('rate', 0):.0%})")
    print(f"Estimated API cost: ${meta.get('cost', {}).get('total', 0):.4f}  "
          f"(by stage: {json.dumps(meta.get('cost', {}).get('by_stage', {}))})")
    print(f"Exports: {', '.join(p.name for p in sorted((run.dir / 'exports').glob('*')))}")
    return 0


def cmd_ask(args) -> int:
    from meetingmind.ask import answer_question

    run = load_run(args.run_id)
    index = run.index()
    if index is None:
        print(f"run '{args.run_id}' has no index.npz - re-run the pipeline first")
        return 1
    res = answer_question(args.question, index, run.segments, k=args.k, min_score=args.min_score)
    print(f"Q: {res.question}")
    print(f"A: {res.answer}")
    best = max((h["score"] for h in res.hits), default=0.0)
    print(f"   found={res.found}  reason={res.reason}  best cosine={best:.3f}")
    for c in res.citations:
        print(f"   citation [{c['timestamp']}] -> {c['segment_id'] or '?'} {'(valid)' if c['valid'] else '(NOT in context)'}")
    if args.show_context:
        for h in res.hits:
            print(f"   --- window {h['window']} score {h['score']:.3f} ---")
            print("   " + h["text"].replace("\n", "\n   "))
    return 0


def cmd_eval(args) -> int:
    from meetingmind.scorecard import write_scorecard, evaluate_run

    gold = json.loads((settings.SAMPLES_DIR / "sprint_meeting.json").read_text(encoding="utf-8"))
    results = []
    for run_id, label in ((args.clean, "clean"), (args.noisy, "noisy (10 dB SNR)")):
        try:
            run = load_run(run_id)
        except FileNotFoundError:
            print(f"skip: run '{run_id}' not found")
            continue
        r = evaluate_run(run, gold, label=label)
        results.append(r)
        print(f"{label:<18} WER {r['wer']['wer']:.1%} | speaker acc {r['speakers']['accuracy_by_duration']:.1%} | "
              f"actions P {r['action_items']['precision']:.2f} R {r['action_items']['recall']:.2f} | "
              f"decision R {r['decisions']['recall']:.2f} | grounded {r['grounding'].get('rate', 0):.0%} | "
              f"latency {r.get('total_latency_s') or 0:.1f}s | cost ${r['cost_usd'].get('total', 0):.4f}")
    if not results:
        return 1
    jp, mp = write_scorecard(results, settings.RESULTS_DIR)
    print(f"wrote {jp.relative_to(ROOT)} and {mp.relative_to(ROOT)}")
    return 0


def cmd_runs(args) -> int:
    for r in list_runs():
        print(f"{r['run_id']:<24} {fmt_ts(r['duration'])}  {r['title']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="meetingmind", description="MeetingMind - meeting audio to grounded minutes")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("make-sample", help="synthesise the gold sample meeting (clean + noisy)")
    s.add_argument("--force", action="store_true", help="rebuild even if the files exist")
    s.set_defaults(func=cmd_make_sample)

    s = sub.add_parser("run", help="run the full pipeline on an audio file")
    s.add_argument("audio", help="path to .mp3/.wav/.m4a")
    s.add_argument("--run-id", help="cache folder name under runs/ (default: derived from file name)")
    s.add_argument("--force", action="store_true", help="ignore cached stages")
    s.add_argument("--participants", help="comma-separated invitee names, used to fix ASR name spellings")
    s.set_defaults(func=cmd_run)

    s = sub.add_parser("ask", help="ask a question about a processed meeting")
    s.add_argument("run_id")
    s.add_argument("question")
    s.add_argument("--k", type=int, default=4, help="number of transcript windows to retrieve")
    s.add_argument("--min-score", type=float, default=0.25, help="cosine threshold for the retrieval gate")
    s.add_argument("--show-context", action="store_true", help="print the retrieved windows")
    s.set_defaults(func=cmd_ask)

    s = sub.add_parser("eval", help="score the sample runs against the gold script")
    s.add_argument("--clean", default="sample")
    s.add_argument("--noisy", default="sample_noisy")
    s.set_defaults(func=cmd_eval)

    s = sub.add_parser("runs", help="list cached runs")
    s.set_defaults(func=cmd_runs)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
