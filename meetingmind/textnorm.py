"""Text normalisation shared by grounding checks and the evaluation scorecard."""
from __future__ import annotations

import re

_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
          "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
          "nineteen"]
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
         "eighty": 80, "ninety": 90}
_ORDINALS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7,
             "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13,
             "fourteenth": 14, "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
             "nineteenth": 19, "twentieth": 20, "thirtieth": 30}
_NUM = {w: i for i, w in enumerate(_UNITS)} | _TENS
_FILLERS = {"uh", "um", "umm", "uhh", "er", "erm", "ah", "hmm", "mm", "mhm"}

STOPWORDS = set("""a an the and or but if of to in on at by for with from into onto about as is are was were be
been being it its this that these those we us our you your i me my he she they them their his her will would
shall should can could may might must do does did done have has had not no so than then there here up out
over just also very really all any some each per via let lets let's get gets got make makes made""".split())


def _numberise(tokens: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in _TENS and i + 1 < len(tokens) and tokens[i + 1] in _UNITS[1:10]:
            out.append(str(_TENS[t] + _UNITS.index(tokens[i + 1])))
            i += 2
            continue
        if t in _TENS and i + 1 < len(tokens) and tokens[i + 1] in _ORDINALS and _ORDINALS[tokens[i + 1]] < 10:
            out.append(str(_TENS[t] + _ORDINALS[tokens[i + 1]]))
            i += 2
            continue
        if t in _NUM:
            out.append(str(_NUM[t]))
        elif t in _ORDINALS:
            out.append(str(_ORDINALS[t]))
        else:
            m = re.fullmatch(r"(\d+)(st|nd|rd|th)", t)
            out.append(m.group(1) if m else t)
        i += 1
    return out


def normalise_words(text: str, drop_fillers: bool = True) -> list[str]:
    """Lower-case, unify quotes, split hyphens, strip punctuation, map number words to digits."""
    t = text.lower().replace("’", "'").replace("‘", "'")
    t = re.sub(r"\b(?:[a-z]_)+[a-z]?_?(?![a-z0-9])", lambda m: m.group(0).replace("_", ""), t)  # U_I_ -> ui
    t = t.replace("%", " percent ").replace("&", " and ")
    t = re.sub(r"(?<=\d),(?=\d{3})", "", t)  # 1,000 -> 1000
    t = re.sub(r"[-–—/]", " ", t)
    t = re.sub(r"[^a-z0-9'\s]", " ", t)
    tokens = [w.strip("'") for w in t.split()]
    tokens = [w for w in tokens if w and not (drop_fillers and w in _FILLERS)]
    return _numberise(_join_spelled(tokens))


def _join_spelled(tokens: list[str]) -> list[str]:
    """Runs of 3+ single letters are a spelled acronym: ["a", "p", "i"] -> ["api"]."""
    out, run = [], []
    for t in tokens + [""]:
        if len(t) == 1 and t.isalpha():
            run.append(t)
            continue
        out.extend(["".join(run)] if len(run) >= 3 else run)
        run = []
        if t:
            out.append(t)
    return out


def _stem(word: str) -> str:
    """Tiny suffix stripper (UK/US -ise/-ize unified) - enough for short task phrases."""
    if word.endswith(("ise", "ised", "ising", "ises")):
        word = word[: word.rfind("is")] + "iz" + word[word.rfind("is") + 2:]
    for suffix in ("ing", "ed", "es", "s", "e"):
        if len(word) > 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def content_tokens(text: str) -> list[str]:
    return [_stem(w) for w in normalise_words(text) if w not in STOPWORDS and w.replace("'", "") not in STOPWORDS]


def token_f1(a: str, b: str) -> float:
    """Bag-of-content-words F1 between two short texts (SQuAD-style)."""
    ta, tb = content_tokens(a), content_tokens(b)
    if not ta or not tb:
        return 0.0
    pool: dict[str, int] = {}
    for w in tb:
        pool[w] = pool.get(w, 0) + 1
    overlap = 0
    for w in ta:
        if pool.get(w, 0) > 0:
            pool[w] -= 1
            overlap += 1
    if overlap == 0:
        return 0.0
    p, r = overlap / len(ta), overlap / len(tb)
    return 2 * p * r / (p + r)
