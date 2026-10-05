from meetingmind.evidence import check_evidence, ground_minutes, quote_coverage
from meetingmind.minutes_schema import ActionItem, Decision, Minutes, Note, Topic


def test_quote_coverage_exact_and_partial():
    text = "I'll build the event schedule and registration API and have it on staging by Friday."
    assert quote_coverage("build the event schedule and registration API", text) == 1.0
    assert quote_coverage("Build the event schedule API by Monday", text) < 1.0
    assert quote_coverage("We will migrate to Kubernetes", text) < 0.3


def test_grounded_item(segments):
    g = check_evidence(["S4"], "build the event schedule and registration API", segments)
    assert g["grounded"] and g["score"] == 1.0
    assert g["timestamp"] == "00:12" and g["start"] == 12.5


def test_hallucinated_segment_id_is_flagged(segments):
    g = check_evidence(["S99"], "build the event schedule and registration API", segments)
    assert not g["grounded"]
    assert any("unknown segment" in i for i in g["issues"])


def test_wrong_citation_points_to_real_location(segments):
    g = check_evidence(["S2"], "I'll finish the high fidelity designs for the schedule screens", segments)
    assert not g["grounded"]
    assert g["best_match_id"] == "S5"
    assert any("actually appears in S5" in i for i in g["issues"])


def test_fabricated_quote_is_not_grounded(segments):
    g = check_evidence(["S4"], "Rohan promised to rewrite everything in Rust tonight", segments)
    assert not g["grounded"]


def test_id_formats_accepted(segments):
    assert check_evidence(["s4"], "registration API and have it on staging", segments)["grounded"]
    assert check_evidence(["[S4]"], "registration API and have it on staging", segments)["grounded"]


def _minutes():
    return Minutes(
        title="Sprint planning", executive_summary="Plan.",
        topics=[Topic(title="Intro", start_segment_id="S1", end_segment_id="S2", summary="Intros")],
        decisions=[Decision(text="Build in Flutter", evidence_segment_ids=["S3"],
                            evidence_quote="FestPal will be built in Flutter")],
        action_items=[
            ActionItem(owner="Rohan", task="Build schedule API", due="Friday", priority="high",
                       evidence_segment_ids=["S4"], evidence_quote="build the event schedule and registration API"),
            ActionItem(owner="Arjun", task="Approve all testing", due="Not specified", priority="low",
                       evidence_segment_ids=["S42"], evidence_quote="all testing is already complete"),
        ],
        open_questions=[Note(text="Paid workshops in app?", evidence_segment_ids=["S7"])],
        risks=[Note(text="Wi-Fi collapses", evidence_segment_ids=["S6"])],
    )


def test_ground_minutes_summary(segments):
    data = ground_minutes(_minutes(), segments)
    assert data["decisions"][0]["grounding"]["grounded"]
    assert data["action_items"][0]["grounding"]["grounded"]
    assert not data["action_items"][1]["grounding"]["grounded"]
    assert data["grounding_summary"] == {"checked": 3, "grounded": 2, "ungrounded": 1, "rate": 0.667}
    assert data["topics"][0]["grounding"]["timestamp"] == "00:00"
    assert data["risks"][0]["grounding"]["timestamp"] == "00:22"


def test_off_by_one_citation_is_widened(segments):
    # quote spans S3 + S4 but only S3 is cited
    g = check_evidence(["S3"], "built in Flutter. I'll build the event schedule and registration API", segments)
    assert g["grounded"] and g["repaired"]
    assert g["valid_ids"] == ["S3", "S4"]
    assert any("widened" in i for i in g["issues"])
