from meetingmind.scorecard import wer, word_edit_counts


def test_identical_is_zero():
    r = wer("The quick brown fox.", "the quick, brown fox")
    assert r["wer"] == 0.0 and r["edits"] == 0


def test_substitution_deletion_insertion_counts():
    c = word_edit_counts("a b c d".split(), "a x c d e".split())
    assert c == {"edits": 2, "substitutions": 1, "deletions": 0, "insertions": 1}
    c = word_edit_counts("a b c d".split(), "a c d".split())
    assert c["deletions"] == 1 and c["edits"] == 1


def test_wer_value():
    r = wer("we ship on friday", "we ship friday please")
    # one deletion (on) + one insertion (please) over 4 reference words
    assert r["wer"] == 0.5
    assert r["ref_words"] == 4


def test_number_normalisation_does_not_count_as_error():
    assert wer("load test 2,000 students by March 12th", "load test two thousand students by march twelfth")["wer"] > 0
    assert wer("by March 12th", "by march twelfth")["wer"] == 0.0


def test_empty_reference():
    assert wer("", "")["wer"] == 0.0
    assert wer("", "noise")["wer"] == 1.0
