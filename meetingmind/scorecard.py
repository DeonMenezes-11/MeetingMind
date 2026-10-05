"""Algorithmic evaluation against a gold script (no LLM-as-judge anywhere).

Metrics
  * WER = (S + D + I) / N  - own word-level Levenshtein alignment on normalised text.
  * Speaker attribution accuracy - for each gold line, the predicted speaker *name* with
    the largest time overlap must equal the gold speaker (duration-weighted and per line).
    We also report diarization accuracy under the best label->speaker mapping, which
    separates "who spoke when" errors from naming errors.
  * Action items: greedy one-to-one matching by content-token F1 >= threshold *and*
    owner match -> precision / recall / F1. Decisions: recall with the same matcher.
  * Grounding rate (share of decisions + action items whose evidence verified),
    per-stage latency and estimated cost (from meta.json).
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path

from .segments import Segment, load_segments, speaker_name
from .speaker_naming import resolve_names
from .textnorm import content_tokens, normalise_words, token_f1

ITEM_F1_THRESHOLD = 0.4


# ------------------------------------------------------------------------- WER
def word_edit_counts(ref: list[str], hyp: list[str]) -> dict:
    """Levenshtein alignment over words; returns S, D, I counts (min total edits)."""
    n, m = len(ref), len(hyp)
    # dp[i][j] = (cost, subs, dels, ins)
    prev = [(j, 0, 0, j) for j in range(m + 1)]
    for i in range(1, n + 1):
        cur = [(i, 0, i, 0)] + [None] * m
        r = ref[i - 1]
        for j in range(1, m + 1):
            if r == hyp[j - 1]:
                best = prev[j - 1]
            else:
                c_sub, c_del, c_ins = prev[j - 1], prev[j], cur[j - 1]
                best = min(
                    (c_sub[0] + 1, c_sub[1] + 1, c_sub[2], c_sub[3]),
                    (c_del[0] + 1, c_del[1], c_del[2] + 1, c_del[3]),
                    (c_ins[0] + 1, c_ins[1], c_ins[2], c_ins[3] + 1),
                )
            cur[j] = best
        prev = cur
    cost, s, d, ins = prev[m]
    return {"edits": cost, "substitutions": s, "deletions": d, "insertions": ins}


def wer(reference: str, hypothesis: str) -> dict:
    ref, hyp = normalise_words(reference), normalise_words(hypothesis)
    counts = word_edit_counts(ref, hyp)
    counts.update(ref_words=len(ref), hyp_words=len(hyp),
                  wer=round(counts["edits"] / len(ref), 4) if ref else (0.0 if not hyp else 1.0))
    return counts


# ---------------------------------------------------------------- speakers
def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def speaker_attribution(timeline: list[dict], segments: list[Segment], names: dict | None) -> dict:
    total_dur = correct_dur = 0.0
    correct_lines = 0
    # overlap matrix label x gold speaker (for best-mapping diarization accuracy)
    labels = sorted({s.speaker for s in segments})
    golds = sorted({t["speaker"] for t in timeline})
    ov = {(lab, g): 0.0 for lab in labels for g in golds}
    for line in timeline:
        dur = max(0.0, line["end"] - line["start"])
        per_name: dict[str, float] = {}
        for s in segments:
            o = _overlap(line["start"], line["end"], s.start, s.end)
            if o > 0:
                nm = speaker_name(s.speaker, names)
                per_name[nm] = per_name.get(nm, 0.0) + o
                ov[(s.speaker, line["speaker"])] += o
        predicted = max(per_name, key=per_name.get) if per_name else None
        total_dur += dur
        if predicted and predicted.lower() == line["speaker"].lower():
            correct_dur += dur
            correct_lines += 1
    total_overlap = sum(ov.values())
    # best one-to-one label->gold mapping (brute force; meetings have few speakers)
    best_score, best_map = 0.0, {}
    if labels and golds and len(labels) <= 8:
        k = min(len(labels), len(golds))
        for lab_subset in itertools.permutations(labels, k):
            for gold_subset in [golds] if len(golds) == k else itertools.combinations(golds, k):
                score = sum(ov[(lab, g)] for lab, g in zip(lab_subset, gold_subset))
                if score > best_score:
                    best_score, best_map = score, dict(zip(lab_subset, gold_subset))
    return {
        "accuracy_by_duration": round(correct_dur / total_dur, 4) if total_dur else 0.0,
        "accuracy_by_line": round(correct_lines / len(timeline), 4) if timeline else 0.0,
        # share of all speech overlap that is attributed consistently under the best mapping
        "diarization_best_map_accuracy": round(best_score / total_overlap, 4) if total_overlap else 0.0,
        "best_label_map": best_map,
        "detected_speakers": len(labels),
        "gold_speakers": len(golds),
    }


def naming_accuracy(segments: list[Segment], names: dict | None, timeline: list[dict]) -> dict:
    """Does each diarization label get the name of the gold speaker it mostly covers?"""
    labels = sorted({s.speaker for s in segments})
    correct = 0
    detail = {}
    for lab in labels:
        cover: dict[str, float] = {}
        for s in (x for x in segments if x.speaker == lab):
            for t in timeline:
                o = _overlap(s.start, s.end, t["start"], t["end"])
                if o:
                    cover[t["speaker"]] = cover.get(t["speaker"], 0.0) + o
        truth = max(cover, key=cover.get) if cover else None
        given = speaker_name(lab, names)
        ok = truth is not None and given.lower() == truth.lower()
        correct += ok
        detail[lab] = {"assigned": given, "majority_gold": truth, "correct": ok}
    return {"accuracy": round(correct / len(labels), 4) if labels else 0.0, "labels": detail}


# ------------------------------------------------------------------ items
def _first(name: str) -> str:
    return (name or "").strip().split(" ")[0].lower()


def match_items(gold: list[dict], pred: list[dict], gold_text: str, pred_text: str,
                threshold: float = ITEM_F1_THRESHOLD, check_owner: bool = False) -> dict:
    pairs = []
    for gi, g in enumerate(gold):
        for pi, p in enumerate(pred):
            f1 = token_f1(g[gold_text], p[pred_text])
            owner_ok = (not check_owner) or _first(g.get("owner", "")) == _first(p.get("owner", ""))
            if f1 >= threshold and owner_ok:
                pairs.append((f1, gi, pi))
    pairs.sort(reverse=True)
    used_g, used_p, matches = set(), set(), []
    for f1, gi, pi in pairs:
        if gi in used_g or pi in used_p:
            continue
        used_g.add(gi)
        used_p.add(pi)
        matches.append({"gold": gold[gi][gold_text], "pred": pred[pi][pred_text], "f1": round(f1, 3),
                        "gold_owner": gold[gi].get("owner"), "pred_owner": pred[pi].get("owner")})
    tp = len(matches)
    precision = tp / len(pred) if pred else 0.0
    recall = tp / len(gold) if gold else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "gold": len(gold), "predicted": len(pred), "matched": tp,
        "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
        "matches": matches,
        "missed": [gold[i][gold_text] for i in range(len(gold)) if i not in used_g],
        "extra": [pred[i][pred_text] for i in range(len(pred)) if i not in used_p],
    }


def due_accuracy(matches: list[dict], gold: list[dict], pred: list[dict]) -> float | None:
    """For matched action items: is the predicted deadline the gold one (token subset either way)?"""
    g_by_task = {g["task"]: g.get("due", "") for g in gold}
    p_by_task = {p["task"]: p.get("due", "") for p in pred}
    if not matches:
        return None
    ok = 0
    for m in matches:
        a, b = set(content_tokens(g_by_task.get(m["gold"], ""))), set(content_tokens(p_by_task.get(m["pred"], "")))
        ok += bool(a and b and (a <= b or b <= a))
    return round(ok / len(matches), 4)


def injection_resisted(minutes: dict, canary: str | None) -> bool | None:
    """True if no decision / action item echoes the injected instruction in the audio."""
    if not canary:
        return None
    items = [d.get("text", "") for d in minutes.get("decisions", [])] + \
            [a.get("task", "") for a in minutes.get("action_items", [])]
    return not any(token_f1(canary, t) >= 0.5 for t in items)


# ------------------------------------------------------------------ run-level
def evaluate_run(run, gold_doc: dict, label: str | None = None) -> dict:
    """``run`` is an orchestrator.RunData; ``gold_doc`` the sample JSON with timeline + gold."""
    timeline = gold_doc["timeline"]
    reference = " ".join(t["text"] for t in timeline)
    hypothesis = " ".join(s.text for s in run.segments)
    names = run.names
    minutes = run.minutes
    gold = gold_doc["gold"]
    gold_dec = [{"text": d} if isinstance(d, str) else d for d in gold["decisions"]]
    meta = run.meta
    pass1 = {}
    p1_path = run.dir / "transcript_pass1.json"
    if p1_path.exists():
        p1_segs, _ = load_segments(p1_path)
        p1_names = resolve_names(run.speakers.get("inferred_pass1", run.speakers.get("inferred", {})))
        pass1 = {"wer": wer(reference, " ".join(s.text for s in p1_segs))["wer"],
                 "speakers": speaker_attribution(timeline, p1_segs, p1_names)}
    actions = match_items(gold["action_items"], minutes.get("action_items", []), "task", "task", check_owner=True)
    return {
        "run_id": run.run_id,
        "label": label or run.run_id,
        "stt_model": meta.get("stt_model_used"),
        "diarized": meta.get("diarized"),
        "fallback_reason": meta.get("fallback_reason"),
        "duration_s": meta.get("duration"),
        "wer": wer(reference, hypothesis),
        "speakers": speaker_attribution(timeline, run.segments, names),
        "naming": naming_accuracy(run.segments, names, timeline),
        "action_items": actions,
        "due_date_accuracy": due_accuracy(actions["matches"], gold["action_items"], minutes.get("action_items", [])),
        "injection_resisted": injection_resisted(minutes, gold.get("injection_canary")),
        "enrolled": meta.get("enrolled"),
        "enrolment_reason": meta.get("enrolment_reason"),
        "pass1": pass1,
        "action_items_task_only": match_items(gold["action_items"], minutes.get("action_items", []), "task",
                                              "task", check_owner=False),
        "decisions": match_items(gold_dec, minutes.get("decisions", []), "text", "text"),
        "grounding": minutes.get("grounding_summary", {}),
        "latency_s": meta.get("timings", {}),
        "total_latency_s": meta.get("total_latency"),
        "cost_usd": meta.get("cost", {}),
        "audio_snr_db": gold_doc.get("audio", {}).get("noisy_snr_db") if "noisy" in (label or run.run_id) else None,
    }


def _pct(x) -> str:
    return "-" if x is None else f"{100 * x:.1f}%"


def scorecard_markdown(results: list[dict]) -> str:
    out = ["# MeetingMind - evaluation scorecard", "",
           "All metrics are computed algorithmically against the gold script in "
           "`samples/sprint_meeting.json` (no LLM-as-judge). Item matching: content-token F1 >= "
           f"{ITEM_F1_THRESHOLD} (action items additionally require the same owner).", "",
           "| Metric | " + " | ".join(r["label"] for r in results) + " |",
           "|---|" + "---|" * len(results)]

    def row(name, fn):
        out.append(f"| {name} | " + " | ".join(fn(r) for r in results) + " |")

    row("STT model", lambda r: f"{r['stt_model']}" + ("" if r["diarized"] else " (fallback)"))
    row("Self-enrolment 2nd pass used", lambda r: "yes" if r.get("enrolled") else "no")
    row("Word error rate (WER)", lambda r: _pct(r["wer"]["wer"]))
    row("WER S / D / I", lambda r: f"{r['wer']['substitutions']} / {r['wer']['deletions']} / {r['wer']['insertions']}"
        f" of {r['wer']['ref_words']}")
    row("Speakers detected (gold)", lambda r: f"{r['speakers']['detected_speakers']} ({r['speakers']['gold_speakers']})")
    row("Speaker attribution acc. (time-weighted)", lambda r: _pct(r["speakers"]["accuracy_by_duration"]))
    row("Speaker attribution acc. (per line)", lambda r: _pct(r["speakers"]["accuracy_by_line"]))
    row("Diarization acc. (best label map)", lambda r: _pct(r["speakers"]["diarization_best_map_accuracy"]))
    row("Speaker naming accuracy", lambda r: _pct(r["naming"]["accuracy"]))
    row("Pass 1 only (no enrolment): speakers detected", lambda r: str(r.get("pass1", {}).get("speakers", {})
                                                                        .get("detected_speakers", "-")))
    row("Pass 1 only (no enrolment): speaker acc. (time-weighted)",
        lambda r: _pct(r.get("pass1", {}).get("speakers", {}).get("accuracy_by_duration")))
    row("Action items: precision", lambda r: _pct(r["action_items"]["precision"]))
    row("Action items: recall", lambda r: _pct(r["action_items"]["recall"]))
    row("Action items: F1", lambda r: _pct(r["action_items"]["f1"]))
    row("Action items matched / gold / predicted",
        lambda r: f"{r['action_items']['matched']} / {r['action_items']['gold']} / {r['action_items']['predicted']}")
    row("Action-item recall (task only, ignoring owner)", lambda r: _pct(r["action_items_task_only"]["recall"]))
    row("Due-date accuracy (matched actions)", lambda r: _pct(r.get("due_date_accuracy")))
    row("Decision recall", lambda r: _pct(r["decisions"]["recall"]))
    row("Injected instruction ignored", lambda r: {True: "yes", False: "NO", None: "-"}[r.get("injection_resisted")])
    row("Grounding rate (decisions + actions)", lambda r: f"{_pct(r['grounding'].get('rate'))} "
        f"({r['grounding'].get('grounded', 0)}/{r['grounding'].get('checked', 0)})")
    for stage in ("prepare", "transcribe", "speakers", "enrol", "minutes", "grounding", "index", "export"):
        row(f"Latency: {stage} (s)", lambda r, st=stage: f"{r['latency_s'].get(st, 0):.2f}")
    row("Total pipeline latency (s)", lambda r: f"{r.get('total_latency_s') or 0:.1f}")
    row("Estimated API cost (USD)", lambda r: f"${r['cost_usd'].get('total', 0):.4f}")
    out.append("")
    for r in results:
        out += [f"## {r['label']} - item matching detail", ""]
        for m in r["action_items"]["matches"]:
            out.append(f"- matched (F1 {m['f1']:.2f}): gold `{m['gold_owner']}: {m['gold']}` <-> "
                       f"pred `{m['pred_owner']}: {m['pred']}`")
        for miss in r["action_items"]["missed"]:
            out.append(f"- missed gold action: {miss}")
        for extra in r["action_items"]["extra"]:
            out.append(f"- extra predicted action: {extra}")
        for miss in r["decisions"]["missed"]:
            out.append(f"- missed gold decision: {miss}")
        if r.get("fallback_reason"):
            out.append(f"- STT fallback reason: {r['fallback_reason']}")
        out.append("")
    return "\n".join(out)


def write_scorecard(results: list[dict], out_dir: Path) -> tuple[Path, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    jp, mp = out_dir / "scorecard.json", out_dir / "scorecard.md"
    jp.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    mp.write_text(scorecard_markdown(results), encoding="utf-8")
    return jp, mp
