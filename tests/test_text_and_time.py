import pytest

from meetingmind.segments import fmt_srt_ts, fmt_ts, normalise_segment_id, parse_ts, speaker_name
from meetingmind.textnorm import normalise_words, token_f1


@pytest.mark.parametrize("seconds,expected", [
    (0, "00:00"), (5.9, "00:05"), (61, "01:01"), (221.4, "03:41"), (3599, "59:59"), (3600, "1:00:00"),
    (3725, "1:02:05"), (-3, "00:00"),
])
def test_fmt_ts(seconds, expected):
    assert fmt_ts(seconds) == expected


def test_parse_ts_round_trip():
    for s in (0, 59, 61, 221, 3725):
        assert parse_ts(fmt_ts(s)) == s
    assert parse_ts("[03:41]") == 221
    with pytest.raises(ValueError):
        parse_ts("3 minutes")


def test_srt_timestamp():
    assert fmt_srt_ts(0) == "00:00:00,000"
    assert fmt_srt_ts(61.2346) == "00:01:01,235"
    assert fmt_srt_ts(3725.5) == "01:02:05,500"


def test_segment_id_normalisation():
    assert normalise_segment_id("S12") == "S12"
    assert normalise_segment_id("s7") == "S7"
    assert normalise_segment_id("[S3]") == "S3"
    assert normalise_segment_id("4") == "S4"
    assert normalise_segment_id("03:41") is None
    assert normalise_segment_id("seg_4") is None


def test_speaker_name_fallbacks():
    assert speaker_name("A", {"A": "Priya"}) == "Priya"
    assert speaker_name("B", {"A": "Priya"}) == "Speaker B"
    assert speaker_name("?", None) == "Unknown speaker"


def test_normalise_words_numbers_and_punctuation():
    assert normalise_words("Twenty-five people, uh, on March fifteenth!") == ["25", "people", "on", "march", "15"]
    assert normalise_words("2,000 users at 80%") == ["2000", "users", "at", "80", "percent"]
    assert normalise_words("March 14th") == normalise_words("march fourteenth")


def test_token_f1():
    assert token_f1("Finalise the wireframes", "finalize wireframes") == 1.0
    assert token_f1("Build the API", "Email the sponsors") == 0.0
    assert 0 < token_f1("Build the event schedule API", "Build the schedule API endpoints and docs") < 1
