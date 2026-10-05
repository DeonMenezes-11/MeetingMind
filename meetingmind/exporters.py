"""Exports: minutes.md, minutes.json, action_items.csv, transcript.srt."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from .segments import Segment, fmt_srt_ts, fmt_ts, speaker_name

WARN = "⚠"
OK = "✓"


def _flag(item: dict) -> str:
    return OK if item.get("grounding", {}).get("grounded") else WARN


def minutes_markdown(minutes: dict, segments: list[Segment], names: dict | None = None,
                     meta: dict | None = None) -> str:
    meta = meta or {}
    people = sorted({speaker_name(s.speaker, names) for s in segments})
    duration = meta.get("duration") or (segments[-1].end if segments else 0)
    gs = minutes.get("grounding_summary", {})
    out = [f"# {minutes.get('title', 'Meeting minutes')}", ""]
    out.append(f"**Participants:** {', '.join(people)}  ")
    out.append(f"**Duration:** {fmt_ts(duration)}  ")
    if gs:
        out.append(f"**Evidence check:** {gs.get('grounded', 0)}/{gs.get('checked', 0)} items grounded "
                   f"({gs.get('rate', 0):.0%})  ")
    out += ["", "## Executive summary", "", minutes.get("executive_summary", ""), "", "## Topics", ""]
    for t in minutes.get("topics", []):
        ts = t.get("grounding", {}).get("timestamp", "")
        out.append(f"- **[{ts}] {t['title']}** - {t['summary']}")
    out += ["", "## Decisions", ""]
    for d in minutes.get("decisions", []) or []:
        g = d.get("grounding", {})
        out.append(f"- {_flag(d)} {d['text']} _(at {g.get('timestamp') or '?'}; \"{d['evidence_quote']}\")_")
    if not minutes.get("decisions"):
        out.append("- None recorded")
    out += ["", "## Action items", "", "| | Owner | Task | Due | Priority | Evidence |", "|---|---|---|---|---|---|"]
    for a in minutes.get("action_items", []):
        g = a.get("grounding", {})
        out.append(f"| {_flag(a)} | {a['owner']} | {a['task']} | {a['due']} | {a['priority']} | "
                   f"{g.get('timestamp') or '?'} ({', '.join(g.get('valid_ids', [])) or '-'}) |")
    for key, heading in (("open_questions", "Open questions"), ("risks", "Risks")):
        out += ["", f"## {heading}", ""]
        items = minutes.get(key, [])
        out += [f"- {n['text']} _(at {n.get('grounding', {}).get('timestamp') or '?'})_" for n in items] or ["- None"]
    out += ["", f"_{OK} = evidence verified against the transcript; {WARN} = needs review "
                "(cited evidence missing or not matching)._", ""]
    return "\n".join(out)


def minutes_json(minutes: dict) -> str:
    return json.dumps(minutes, indent=2, ensure_ascii=False)


CSV_FIELDS = ["owner", "task", "due", "priority", "grounded", "grounding_score", "timestamp",
              "evidence_segment_ids", "evidence_quote"]


def action_items_csv(minutes: dict) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    for a in minutes.get("action_items", []):
        g = a.get("grounding", {})
        writer.writerow({
            "owner": a.get("owner", ""), "task": a.get("task", ""), "due": a.get("due", ""),
            "priority": a.get("priority", ""), "grounded": "yes" if g.get("grounded") else "no",
            "grounding_score": g.get("score", ""), "timestamp": g.get("timestamp", ""),
            "evidence_segment_ids": " ".join(a.get("evidence_segment_ids", [])),
            "evidence_quote": a.get("evidence_quote", ""),
        })
    return buf.getvalue()


def rows_csv(rows: list[dict]) -> str:
    """CSV of the (possibly user-edited) action-item table shown in the UI."""
    fields = ["owner", "task", "due", "priority", "grounded", "include", "evidence"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k, "") for k in fields})
    return buf.getvalue()


def transcript_srt(segments: list[Segment], names: dict | None = None) -> str:
    blocks = []
    for n, s in enumerate(segments, start=1):
        end = s.end if s.end > s.start else s.start + 0.5
        blocks.append(f"{n}\n{fmt_srt_ts(s.start)} --> {fmt_srt_ts(end)}\n{speaker_name(s.speaker, names)}: {s.text}\n")
    return "\n".join(blocks)


def write_exports(out_dir: Path, minutes: dict, segments: list[Segment], names: dict | None = None,
                  meta: dict | None = None) -> dict[str, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "minutes.md": minutes_markdown(minutes, segments, names, meta),
        "minutes.json": minutes_json(minutes),
        "action_items.csv": action_items_csv(minutes),
        "transcript.srt": transcript_srt(segments, names),
    }
    paths = {}
    for name, text in files.items():
        p = out_dir / name
        p.write_text(text, encoding="utf-8")
        paths[name] = p
    return paths
