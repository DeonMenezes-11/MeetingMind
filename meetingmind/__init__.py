"""MeetingMind - meeting audio to grounded minutes, follow-ups and Q&A.

Pipeline: audio_prep -> stt (diarized ASR) -> speaker_naming -> minutes (structured
LLM output) -> evidence (grounding check) -> followups / ask (RAG) -> exporters,
with orchestrator.py tying the stages together and scorecard.py evaluating them.
"""

__version__ = "1.0.0"
