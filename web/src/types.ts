// Shapes returned by meetingmind/webapi.py

export interface Grounding {
  grounded: boolean;
  score?: number;
  quote_coverage?: number;
  repaired?: boolean;
  valid_ids?: string[];
  issues?: string[];
  start?: number | null;
  end?: number | null;
  timestamp?: string;
  best_match_id?: string;
}

export interface Topic {
  title: string;
  start_segment_id: string;
  end_segment_id: string;
  summary: string;
  grounding: Grounding;
}

export interface Decision {
  text: string;
  evidence_segment_ids: string[];
  evidence_quote: string;
  grounding: Grounding;
}

export interface Note {
  text: string;
  evidence_segment_ids: string[];
  grounding: Grounding;
}

export interface ActionItem {
  owner: string;
  task: string;
  due: string;
  priority: string;
  evidence_segment_ids: string[];
  evidence_quote: string;
  grounding: Grounding;
}

export interface Minutes {
  title: string;
  executive_summary: string;
  topics: Topic[];
  decisions: Decision[];
  action_items: ActionItem[];
  open_questions: Note[];
  risks: Note[];
  grounding_summary: { checked: number; grounded: number; ungrounded: number; rate: number };
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  label: string;
  speaker: string;
  text: string;
}

export interface Speaker {
  label: string;
  name: string;
  index: number;
  role: string;
  method: string;
  confidence: number | null;
  evidence: string;
  renamed: boolean;
  talk_time: number;
  share: number;
  turns: number;
  words: number;
  wpm: number;
}

export type Priority = "high" | "medium" | "low";

export interface ActionRow {
  id: string;
  owner: string;
  task: string;
  due: string;
  priority: Priority;
  grounded: boolean;
  include: boolean;
  evidence: string;
  start: number | null;
  score: number;
  source: "ai" | "manual";
  quote: string;
  segment_ids: string[];
  timestamp: string;
  edited?: boolean;
}

export interface Usage {
  stage: string;
  model: string;
  kind: string;
  audio_seconds?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost: number;
}

export interface RunMeta {
  run_id: string;
  created: string;
  source_name: string;
  models: { chat: string; stt: string; stt_fallback: string; embed: string };
  timings: Record<string, number>;
  cached_stages: string[];
  usage: Usage[];
  duration: number;
  audio_bytes: number;
  chunks: number;
  participants: string[] | null;
  stt_model_used: string;
  diarized: boolean;
  fallback_reason: string | null;
  enrolled: boolean;
  enrolment_reason: string;
  segments: number;
  speakers: number;
  grounding: { checked: number; grounded: number; ungrounded: number; rate: number };
  index_windows: number;
  title: string;
  cost: { total: number; by_stage: Record<string, number> };
  total_latency: number;
}

export interface Introduction {
  name: string;
  role: string;
  segment_id: string;
  label: string;
  start: number;
}

export interface RunPayload {
  run_id: string;
  title: string;
  meta: RunMeta;
  transcript: {
    model: string;
    diarized: boolean;
    fallback_reason: string | null;
    enrolled: boolean;
    enrolment_reason: string;
    enrolment_error?: string | null;
  };
  segments: Segment[];
  speakers: Speaker[];
  introductions: Introduction[];
  participants: string[];
  names_changed_since_minutes: boolean;
  minutes: Minutes;
  actions: ActionRow[];
  actions_edited: boolean;
  has_index: boolean;
  audio_url: string;
}

export interface RunCard {
  run_id: string;
  title: string;
  summary: string;
  created: string;
  duration: number;
  source_name: string;
  speakers: string[];
  counts: { decisions: number; actions: number; questions: number; risks: number };
  grounding: { checked: number; grounded: number; rate: number };
  cost: number;
  is_sample: boolean;
}

export interface Citation {
  timestamp: string;
  seconds: number;
  valid: boolean;
  segment_id: string;
}

export interface Hit {
  window: number;
  score: number;
  start: number;
  timestamp: string;
  segment_ids: string[];
  text: string;
}

export interface AskResult {
  question: string;
  answer: string;
  found: boolean;
  reason: string;
  citations: Citation[];
  hits: Hit[];
  cost: number;
}

export interface Email {
  kind: "owner" | "recap";
  to: string;
  subject: string;
  body: string;
}

export interface EmailsResult {
  emails: Email[];
  excluded: ActionRow[];
  mode: "template" | "ai";
  cost: number;
}

export type JobEvent =
  | { type: "status"; status: "queued" | "running"; t: number }
  | { type: "stage"; stage: string; state: "running" | "done" | "cached"; detail: string; t: number }
  | { type: "done"; run_id: string; t: number }
  | { type: "error"; message: string; t: number };

export interface JobSnapshot {
  id: string;
  kind: "process" | "regenerate" | "sample";
  title: string;
  run_id: string | null;
  status: "queued" | "running" | "done" | "error";
  error: string | null;
  created: number;
  started: number | null;
  finished: number | null;
  events: JobEvent[];
  stages: { key: string; label: string }[];
  elapsed: number;
}

export interface Health {
  ok: boolean;
  key: { configured: boolean; source: string | null };
  models: { chat: string; stt: string; stt_fallback: string; embed: string; tts: string };
  jobs_active: number;
  web_built: boolean;
}

export interface ScorecardRow {
  run_id: string;
  label: string;
  stt_model: string;
  duration_s: number;
  audio_snr_db: number | null;
  enrolled: boolean;
  wer: { wer: number; substitutions: number; deletions: number; insertions: number; ref_words: number };
  speakers: { accuracy_by_duration: number; accuracy_by_line: number; detected_speakers: number; gold_speakers: number };
  naming: { accuracy: number };
  pass1?: { wer: number; speakers: { accuracy_by_duration: number; detected_speakers: number } };
  action_items: { precision: number; recall: number; f1: number; matched: number; gold: number; predicted: number };
  decisions: { precision: number; recall: number; f1: number };
  due_date_accuracy: number;
  injection_resisted: boolean;
  grounding: { checked: number; grounded: number; rate: number };
  latency_s: Record<string, number>;
  total_latency_s: number;
  cost_usd: { total: number };
}
