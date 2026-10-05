from meetingmind.scorecard import match_items, naming_accuracy, scorecard_markdown, speaker_attribution
from meetingmind.segments import Segment
from meetingmind.speaker_naming import resolve_names, speaker_stats

GOLD_ACTIONS = [
    {"owner": "Rohan", "task": "Build the event schedule and registration API on staging", "due": "Friday"},
    {"owner": "Priya", "task": "Email the sponsors for their logo files", "due": "Wednesday"},
    {"owner": "Meera", "task": "Create the app icon and splash screen", "due": "Friday"},
]


def test_action_matching_precision_recall():
    pred = [
        {"owner": "Rohan", "task": "Build the event schedule and registration API and deploy it to staging"},
        {"owner": "Priya", "task": "Email sponsors to collect their logo files"},
        {"owner": "Rohan", "task": "Create the app icon and splash screen"},  # wrong owner
        {"owner": "Arjun", "task": "Order pizza for the team"},  # extra
    ]
    r = match_items(GOLD_ACTIONS, pred, "task", "task", check_owner=True)
    assert r["matched"] == 2
    assert r["precision"] == 0.5 and round(r["recall"], 3) == 0.667
    assert r["missed"] == ["Create the app icon and splash screen"]
    loose = match_items(GOLD_ACTIONS, pred, "task", "task", check_owner=False)
    assert loose["recall"] == 1.0


def test_matching_is_one_to_one():
    pred = [{"owner": "Priya", "task": "Email the sponsors for their logo files"}] * 2
    r = match_items(GOLD_ACTIONS, pred, "task", "task", check_owner=True)
    assert r["matched"] == 1 and r["precision"] == 0.5


def _timeline():
    return [
        {"speaker": "Priya", "start": 0.0, "end": 4.0, "text": "a"},
        {"speaker": "Rohan", "start": 4.5, "end": 7.0, "text": "b"},
        {"speaker": "Priya", "start": 7.5, "end": 12.0, "text": "c"},
    ]


def test_speaker_attribution_perfect_and_swapped():
    segs = [Segment("S1", 0.1, 3.9, "A", "a"), Segment("S2", 4.6, 6.9, "B", "b"), Segment("S3", 7.4, 12.1, "A", "c")]
    good = speaker_attribution(_timeline(), segs, {"A": "Priya", "B": "Rohan"})
    assert good["accuracy_by_line"] == 1.0 and good["accuracy_by_duration"] == 1.0
    swapped = speaker_attribution(_timeline(), segs, {"A": "Rohan", "B": "Priya"})
    assert swapped["accuracy_by_line"] == 0.0
    # diarization itself was perfect - only the naming was wrong
    assert swapped["diarization_best_map_accuracy"] == good["diarization_best_map_accuracy"] > 0.95
    assert naming_accuracy(segs, {"A": "Rohan", "B": "Priya"}, _timeline())["accuracy"] == 0.0


def test_speaker_stats_turns_and_share():
    segs = [Segment("S1", 0, 4, "A", "one two three"), Segment("S2", 4, 6, "A", "four"),
            Segment("S3", 6, 10, "B", "five six")]
    stats = {r["speaker"]: r for r in speaker_stats(segs, {"A": "Priya"})}
    assert stats["Priya"]["turns"] == 1 and stats["Priya"]["segments"] == 2
    assert stats["Priya"]["talk_time"] == 6.0 and stats["Priya"]["share"] == 0.6
    assert stats["Speaker B"]["words"] == 2


def test_resolve_names_overrides_win():
    inferred = {"A": {"name": "Priya"}, "B": {"name": ""}}
    assert resolve_names(inferred, {"B": "Rohan", "A": " "}) == {"A": "Priya", "B": "Rohan"}


def test_scorecard_markdown_renders():
    r = {
        "label": "clean", "stt_model": "m", "diarized": True, "fallback_reason": None,
        "wer": {"wer": 0.05, "substitutions": 1, "deletions": 1, "insertions": 0, "ref_words": 40},
        "speakers": {"detected_speakers": 4, "gold_speakers": 4, "accuracy_by_duration": 0.9,
                     "accuracy_by_line": 0.9, "diarization_best_map_accuracy": 0.95},
        "naming": {"accuracy": 1.0},
        "action_items": match_items(GOLD_ACTIONS, GOLD_ACTIONS, "task", "task", check_owner=True),
        "action_items_task_only": match_items(GOLD_ACTIONS, GOLD_ACTIONS, "task", "task"),
        "decisions": match_items([{"text": "x y z"}], [{"text": "x y z"}], "text", "text"),
        "grounding": {"rate": 1.0, "grounded": 3, "checked": 3},
        "latency_s": {"transcribe": 10.0}, "total_latency_s": 12.0, "cost_usd": {"total": 0.01},
    }
    md = scorecard_markdown([r])
    assert "| Word error rate (WER) | 5.0% |" in md
    assert "| Action items: recall | 100.0% |" in md


def test_plan_enrolment_and_reference_window():
    from meetingmind.speaker_naming import plan_enrolment

    segs = [Segment("S1", 0.0, 4.0, "A", "Hi, I'm Priya, the PM."), Segment("S2", 4.5, 7.0, "B", "I'm Rohan."),
            Segment("S3", 7.5, 12.0, "A", "Hello, I'm Mira, the designer.")]
    raw = [Segment("R1", 0.0, 0.8, "A", "Hi,"), Segment("R2", 1.0, 2.0, "A", "I'm Priya,"),
           Segment("R3", 2.3, 4.0, "A", "the PM."), Segment("R4", 4.5, 7.0, "B", "I'm Rohan."),
           Segment("R5", 7.5, 8.0, "A", "Hello,"), Segment("R6", 8.3, 9.0, "A", "I'm Mira,"),
           Segment("R7", 9.4, 12.0, "A", "the designer.")]
    intros = [{"name": "Priya", "role": "PM", "segment_id": "S1", "label": "A", "start": 0.0},
              {"name": "Rohan", "role": "", "segment_id": "S2", "label": "B", "start": 4.5},
              {"name": "Meera", "role": "Designer", "segment_id": "S3", "label": "A", "start": 7.5}]
    plan = plan_enrolment(segs, intros, raw_segments=raw)
    assert plan["needed"]
    clips = {sp["name"]: (sp["clip_start"], sp["clip_end"]) for sp in plan["speakers"]}
    assert clips["Priya"] == (1.0, 4.0)      # starts where the name is said
    assert clips["Rohan"] == (4.5, 7.0)
    assert clips["Meera"] == (8.3, 12.0)     # fuzzy match of ASR spelling "Mira"
    consistent = [dict(i, label=lab) for i, lab in zip(intros, "ABC")]
    assert not plan_enrolment(segs, consistent[:2], raw_segments=raw)["needed"]
    assert plan_enrolment(segs, intros, mode="off")["reason"] == "disabled"


def test_merge_rows_joins_fragments():
    from meetingmind.stt import merge_rows

    rows = [(0.0, 1.0, "A", "Good morning,"), (1.1, 1.4, "A", "everyone."), (2.5, 3.0, "A", "Next."),
            (3.2, 4.0, "B", "Hi."), (4.1, 40.0, "B", "Long"), (40.2, 41.0, "B", "tail")]
    out = merge_rows(rows, max_gap=1.0, max_len=30.0)
    assert out[0] == (0.0, 1.4, "A", "Good morning, everyone.")
    assert out[1][3] == "Next."  # gap 1.1 s > 1.0 s
    assert [o[3] for o in out[2:]] == ["Hi.", "Long", "tail"]  # merging would exceed the 30 s cap
