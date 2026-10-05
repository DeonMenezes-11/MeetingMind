import pytest

from conftest import FakeClient
from meetingmind.ask import NOT_FOUND_MESSAGE, MeetingIndex, answer_question, build_index, build_windows


def test_windows_size_and_overlap(segments, names):
    w = build_windows(segments, names, size=4, overlap=1)
    assert [x.segment_ids for x in w] == [["S1", "S2", "S3", "S4"], ["S4", "S5", "S6", "S7"]]
    assert w[0].start == 0.0 and w[1].end == 30.0
    assert w[0].text.splitlines()[0] == "[00:00 Priya] Hi everyone, I'm Priya, the product manager."


def test_windows_cover_all_segments(segments):
    for size, overlap in [(1, 0), (2, 1), (3, 1), (4, 2), (10, 3)]:
        w = build_windows(segments, None, size=size, overlap=overlap)
        covered = {sid for x in w for sid in x.segment_ids}
        assert covered == {s.id for s in segments}
        assert all(len(x.segment_ids) <= size for x in w)


def test_bad_window_params(segments):
    with pytest.raises(ValueError):
        build_windows(segments, None, size=2, overlap=2)


def test_index_round_trip(tmp_path, segments, names):
    idx, usage = build_index(segments, names, client=FakeClient(), model="fake-embed", size=3, overlap=1)
    assert usage["kind"] == "embed" and usage["input_tokens"] > 0
    idx.save(tmp_path / "index.npz")
    loaded = MeetingIndex.load(tmp_path / "index.npz")
    assert loaded.model == "fake-embed"
    assert [w.segment_ids for w in loaded.windows] == [w.segment_ids for w in idx.windows]
    assert loaded.vectors.shape == idx.vectors.shape


def test_answer_with_citation(segments, names):
    client = FakeClient(chat_reply="Rohan will have the registration API on staging by Friday [00:12].")
    idx, _ = build_index(segments, names, client=client, model="fake", size=2, overlap=1)
    res = answer_question("When is the registration API on staging?", idx, segments, client=client,
                          chat_model="fake-chat", min_score=0.1)
    assert res.found
    assert res.citations == [{"timestamp": "00:12", "seconds": 12, "valid": True, "segment_id": "S4"}]


def test_model_not_found_token_becomes_refusal(segments, names):
    client = FakeClient(chat_reply="NOT_FOUND")
    idx, _ = build_index(segments, names, client=client, model="fake", size=2, overlap=1)
    res = answer_question("What is the registration API deadline?", idx, segments, client=client,
                          chat_model="fake-chat", min_score=0.1)
    assert not res.found and res.answer == NOT_FOUND_MESSAGE
    assert res.reason == "model replied NOT_FOUND"


def test_retrieval_gate_skips_llm(segments, names):
    client = FakeClient(chat_reply="This should never be used [00:00].")
    idx, _ = build_index(segments, names, client=client, model="fake", size=2, overlap=1)
    res = answer_question("Quantum chromodynamics lattice gauge?", idx, segments, client=client,
                          chat_model="fake-chat", min_score=0.3)
    assert not res.found and res.answer == NOT_FOUND_MESSAGE
    assert "retrieval gate" in res.reason
    assert not any(kind == "chat" for kind, _ in client.calls)


def test_invalid_citation_is_marked(segments, names):
    client = FakeClient(chat_reply="It was on Friday [09:59].")
    idx, _ = build_index(segments, names, client=client, model="fake", size=2, overlap=1)
    res = answer_question("registration API staging Friday", idx, segments, client=client, chat_model="x",
                          min_score=0.1)
    assert res.citations and res.citations[0]["valid"] is False


def test_hybrid_ranking_rescues_exact_terms(segments, names):
    import numpy as np

    idx, _ = build_index(segments, names, client=FakeClient(), model="fake", size=1, overlap=0)
    q = np.zeros(idx.vectors.shape[1], dtype=np.float32)  # uninformative query vector
    plain = idx.search(q, k=1)
    hybrid = idx.search(q, k=1, query_text="Firebase Flutter FestPal decided")
    assert hybrid[0][0].segment_ids == ["S3"]
    assert plain[0][1] == hybrid[0][1] == 0.0  # reported score is still the cosine
