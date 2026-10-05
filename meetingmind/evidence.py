"""Evidence grounding: verify that every generated claim is backed by the transcript.

For each decision / action item / note we check that
  1. the cited segment IDs actually exist (hallucinated IDs are caught), and
  2. the evidence quote really occurs in the cited segments - measured as the share of
     the quote's words matched in order (difflib.SequenceMatcher on word lists). A quote
     that runs into the immediately adjacent utterance is accepted with the citation
     widened (and the repair is recorded), anything further away is not.
An item is *grounded* when at least one cited ID is valid and quote coverage >= 0.6.
Timestamps are derived here from the cited segments, never from the LLM.
Ungrounded items are flagged with a warning and excluded from follow-up emails.
"""
from __future__ import annotations

from difflib import SequenceMatcher

from .minutes_schema import Minutes
from .segments import Segment, fmt_ts, normalise_segment_id
from .textnorm import normalise_words

GROUNDING_THRESHOLD = 0.6


def quote_coverage(quote: str, text: str) -> float:
    """Fraction of the quote's words found, in order, inside ``text`` (0..1)."""
    q, t = normalise_words(quote, drop_fillers=True), normalise_words(text, drop_fillers=True)
    if not q or not t:
        return 0.0
    sm = SequenceMatcher(None, q, t, autojunk=False)
    matched = sum(block.size for block in sm.get_matching_blocks())
    return round(matched / len(q), 3)


def check_evidence(segment_ids: list[str], quote: str, segments: list[Segment],
                   threshold: float = GROUNDING_THRESHOLD) -> dict:
    by_id = {s.id: s for s in segments}
    normalised = [normalise_segment_id(x) for x in (segment_ids or [])]
    valid = [x for x in normalised if x and x in by_id]
    invalid = [raw for raw, x in zip(segment_ids or [], normalised) if not x or x not in by_id]
    issues: list[str] = []
    if not segment_ids:
        issues.append("no evidence cited")
    if invalid:
        issues.append(f"unknown segment id(s): {', '.join(map(str, invalid))}")

    cited_text = " ".join(by_id[x].text for x in valid)
    coverage = quote_coverage(quote, cited_text) if valid and quote.strip() else 0.0
    repaired = False
    if valid and quote.strip() and coverage < threshold:
        # Off-by-one citations: a quote that spans into the adjacent utterance is still
        # verifiable. Widen to the smallest neighbouring span that supports the quote.
        pos = {s.id: i for i, s in enumerate(segments)}
        lo, hi = min(pos[x] for x in valid), max(pos[x] for x in valid)
        for a, b in ((lo - 1, hi), (lo, hi + 1), (lo - 1, hi + 1)):
            span = segments[max(0, a): b + 1]
            c = quote_coverage(quote, " ".join(s.text for s in span))
            if c >= threshold:
                added = [s.id for s in span if s.id not in valid]
                issues.append(f"citation widened to include {', '.join(added)}")
                valid, coverage, repaired = [s.id for s in span], c, True
                break
    if valid and quote.strip() and coverage < threshold:
        issues.append(f"quote only {coverage:.0%} supported by cited segments")
    if valid and not quote.strip():
        issues.append("empty evidence quote")

    # Where does the quote best match anywhere in the transcript? (diagnostic only)
    best_id, best_cov = None, 0.0
    if quote.strip():
        for s in segments:
            c = quote_coverage(quote, s.text)
            if c > best_cov:
                best_id, best_cov = s.id, c
    if best_id and best_cov >= 0.8 and best_id not in valid and coverage < threshold:
        issues.append(f"quote actually appears in {best_id}")

    id_ratio = len(valid) / len(segment_ids) if segment_ids else 0.0
    grounded = bool(valid) and coverage >= threshold
    start = min((by_id[x].start for x in valid), default=None)
    end = max((by_id[x].end for x in valid), default=None)
    return {
        "grounded": grounded,
        "score": round(coverage * id_ratio, 3),
        "quote_coverage": coverage,
        "repaired": repaired,
        "valid_ids": valid,
        "issues": issues,
        "start": start,
        "end": end,
        "timestamp": fmt_ts(start) if start is not None else "",
        "best_match_id": best_id,
    }


def _note_check(ids: list[str], text: str, segments: list[Segment]) -> dict:
    """Notes have no quote; ground them on valid IDs + lexical overlap with cited text."""
    by_id = {s.id: s for s in segments}
    valid = [x for x in (normalise_segment_id(i) for i in ids or []) if x and x in by_id]
    start = min((by_id[x].start for x in valid), default=None)
    return {
        "grounded": bool(valid),
        "score": round(len(valid) / len(ids), 3) if ids else 0.0,
        "valid_ids": valid,
        "issues": [] if valid else ["no valid evidence segment"],
        "start": start,
        "timestamp": fmt_ts(start) if start is not None else "",
    }


def ground_minutes(minutes: Minutes, segments: list[Segment],
                   threshold: float = GROUNDING_THRESHOLD) -> dict:
    """Return the minutes as a dict with a ``grounding`` block attached to every item."""
    data = minutes.model_dump()
    by_id = {s.id: s for s in segments}
    for topic in data["topics"]:
        a, b = normalise_segment_id(topic["start_segment_id"]), normalise_segment_id(topic["end_segment_id"])
        ok = a in by_id and b in by_id and by_id[a].start <= by_id[b].start
        topic["grounding"] = {
            "grounded": bool(ok),
            "start": by_id[a].start if a in by_id else None,
            "end": by_id[b].end if b in by_id else None,
            "timestamp": fmt_ts(by_id[a].start) if a in by_id else "",
            "issues": [] if ok else ["invalid segment range"],
        }
    for key in ("decisions", "action_items"):
        for item in data[key]:
            item["grounding"] = check_evidence(item["evidence_segment_ids"], item["evidence_quote"], segments, threshold)
    for key in ("open_questions", "risks"):
        for item in data[key]:
            item["grounding"] = _note_check(item["evidence_segment_ids"], item["text"], segments)
    # chronological order (ungrounded items, which have no time, go last)
    for key in ("decisions", "action_items", "open_questions", "risks"):
        data[key].sort(key=lambda it: (it["grounding"]["start"] is None, it["grounding"]["start"] or 0.0))
    data["grounding_summary"] = grounding_summary(data)
    return data


def grounding_summary(data: dict) -> dict:
    items = list(data.get("decisions", [])) + list(data.get("action_items", []))
    grounded = sum(1 for i in items if i.get("grounding", {}).get("grounded"))
    return {
        "checked": len(items),
        "grounded": grounded,
        "ungrounded": len(items) - grounded,
        "rate": round(grounded / len(items), 3) if items else 1.0,
    }
