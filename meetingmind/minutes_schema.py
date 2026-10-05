"""Pydantic schema for structured minutes (sent to the model as a strict JSON schema).

Design notes for strict structured outputs: every field is required (no non-None
defaults), there are no free-form dict fields, and there are deliberately *no*
timestamp fields - the model cites segment IDs and we derive times from the
transcript ourselves (see evidence.py).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Topic(BaseModel):
    title: str = Field(description="Short topic heading")
    start_segment_id: str = Field(description="First transcript segment ID of this topic, e.g. S4")
    end_segment_id: str = Field(description="Last transcript segment ID of this topic, e.g. S11")
    summary: str = Field(description="1-3 sentence summary of what was said")


class Decision(BaseModel):
    text: str = Field(description="The decision that the group agreed on")
    evidence_segment_ids: list[str] = Field(description="Segment IDs (e.g. S12) that state the decision")
    evidence_quote: str = Field(description="Short verbatim excerpt copied from one cited segment")


class ActionItem(BaseModel):
    owner: str = Field(description="Name of the single responsible person, or 'Unassigned'")
    task: str = Field(description="What must be done, starting with a verb")
    due: str = Field(description="Deadline exactly as stated in the meeting, or 'Not specified'")
    priority: Literal["high", "medium", "low"]
    evidence_segment_ids: list[str] = Field(description="Segment IDs where the task was assigned/accepted")
    evidence_quote: str = Field(description="Short verbatim excerpt copied from one cited segment")


class Note(BaseModel):
    text: str
    evidence_segment_ids: list[str]


class Minutes(BaseModel):
    title: str = Field(description="Descriptive meeting title")
    executive_summary: str = Field(description="3-5 sentence summary for someone who missed the meeting")
    topics: list[Topic]
    decisions: list[Decision]
    action_items: list[ActionItem]
    open_questions: list[Note] = Field(description="Questions raised but not resolved")
    risks: list[Note] = Field(description="Risks, blockers or concerns raised")
