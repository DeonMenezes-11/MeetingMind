import clsx from "clsx";
import {
  ArrowDown,
  ArrowRight,
  AudioWaveform,
  BadgeCheck,
  Database,
  FileText,
  Fingerprint,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Lock,
  Mic,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { TEAM } from "../components/AppShell";
import { Badge, Button, Card, Skeleton } from "../components/ui";
import { fmtCost, fmtPct } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import type { ScorecardRow } from "../types";

const PIPELINE: { icon: ReactNode; title: string; model: string; body: string; kind: "local" | "ai" | "ui" }[] = [
  { icon: <AudioWaveform className="size-5" />, title: "Prepare audio", model: "ffmpeg", body: "Any recording → mono 16 kHz MP3; long meetings are split into chunks.", kind: "local" },
  { icon: <Mic className="size-5" />, title: "Transcribe + diarize", model: "gpt-4o-transcribe-diarize", body: "Speech-to-text with speaker labels (A, B, C…) and timestamps.", kind: "ai" },
  { icon: <Users className="size-5" />, title: "Name speakers", model: "gpt-4o-mini", body: "Structured output maps each voice to a name using introductions.", kind: "ai" },
  { icon: <Fingerprint className="size-5" />, title: "Self-enrolment", model: "diarize + references", body: "If voices merged, each intro becomes a voice reference for a 2nd pass.", kind: "ai" },
  { icon: <FileText className="size-5" />, title: "Structured minutes", model: "gpt-4o-mini · JSON schema", body: "Topics, decisions, action items, questions, risks - each citing segment IDs.", kind: "ai" },
  { icon: <BadgeCheck className="size-5" />, title: "Evidence grounding", model: "difflib (local)", body: "Every cited quote is matched against the transcript; mismatches are flagged.", kind: "local" },
  { icon: <Database className="size-5" />, title: "Retrieval index", model: "text-embedding-3-small", body: "Overlapping transcript windows are embedded for “Ask the meeting”.", kind: "ai" },
  { icon: <LayoutDashboard className="size-5" />, title: "Web app", model: "FastAPI + React", body: "Review, listen, edit action items, draft emails, ask questions, export.", kind: "ui" },
];

export default function About() {
  useDocumentTitle("How it works");
  const score = useAsync(() => api.scorecard(), []);
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-3xl">
        <Badge tone="accent" icon={<GraduationCap className="size-3.5" />}>Generative AI Laboratory · Experiment 8 · Mini project</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">How MeetingMind works</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          MeetingMind is an end-to-end Generative AI application: audio goes in, and every output - transcript, minutes, emails and answers -
          is produced by AI models, then checked by deterministic code before you see it.
        </p>
      </div>

      {/* pipeline */}
      <section className="mt-10" aria-labelledby="pipe">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="pipe" className="text-lg font-semibold tracking-tight">The pipeline</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Legend cls="bg-surface-3" label="local processing" />
            <Legend cls="bg-accent" label="OpenAI model call" />
            <Legend cls="bg-indigo-500" label="user-facing" />
          </div>
        </div>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((s, i) => (
            <li key={s.title} className="card relative flex flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={clsx(
                    "grid size-10 place-items-center rounded-xl",
                    s.kind === "ai" ? "bg-accent text-accent-fg" : s.kind === "ui" ? "bg-indigo-500 text-white" : "bg-surface-3 text-muted",
                  )}
                >
                  {s.icon}
                </span>
                <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <div className="mt-0.5 font-mono text-[11.5px] text-accent-text">{s.model}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.body}</p>
              {(i + 1) % 4 !== 0 && (
                <span className="absolute -right-2.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-subtle lg:grid">
                  <ArrowRight className="size-3" />
                </span>
              )}
              {i < PIPELINE.length - 1 && (
                <span className="absolute -bottom-2.5 left-1/2 z-10 grid size-5 -translate-x-1/2 place-items-center rounded-full border border-line bg-surface text-subtle sm:hidden">
                  <ArrowDown className="size-3" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* scorecard */}
      <section className="mt-12" aria-labelledby="eval">
        <h2 id="eval" className="text-lg font-semibold tracking-tight">Evaluation</h2>
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          Measured on a scripted 4-person sprint-planning meeting with a known gold transcript, decisions and action items - once clean and once
          with background noise. All metrics are computed by code (no LLM judging its own output).
        </p>
        <Card className="mt-4 overflow-hidden">
          {score.loading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : score.data && score.data.length ? (
            <Scorecard rows={score.data} />
          ) : (
            <p className="p-5 text-sm text-subtle">Run <code className="font-mono">python3 cli.py eval</code> to produce the scorecard.</p>
          )}
        </Card>
      </section>

      {/* principles */}
      <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Principle icon={<ShieldCheck className="size-5" />} title="Grounded, not trusted">
          The LLM must cite segment IDs and quote the transcript. A local checker verifies each quote; anything unverified is flagged and kept out of emails.
        </Principle>
        <Principle icon={<Lock className="size-5" />} title="Private by design">
          The API key never leaves the server, voice-reference clips are deleted after use, recordings need explicit consent, and emails are drafts only.
        </Principle>
        <Principle icon={<TriangleAlert className="size-5" />} title="Injection-aware">
          The transcript is treated as untrusted data - the test meeting even contains a spoken “ignore your instructions” line, which is ignored.
        </Principle>
      </section>

      {/* team */}
      <section className="mt-12">
        <Card className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle"><Layers className="size-3.5" /> Team · Batch B1</div>
            <div className="mt-3 flex flex-wrap gap-6">
              {TEAM.map((m) => (
                <div key={m.roll}>
                  <div className="text-[17px] font-semibold">{m.name}</div>
                  <div className="font-mono text-sm text-subtle">{m.roll}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Python 3.13", "FastAPI", "React 19", "TypeScript", "Tailwind CSS", "OpenAI API", "ffmpeg", "NumPy", "pytest"].map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </div>
          <Link to="/">
            <Button variant="primary" iconRight={<ArrowRight className="size-4" />}>Open the meetings</Button>
          </Link>
        </Card>
      </section>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-subtle">
      <span className={clsx("size-2.5 rounded-sm", cls)} /> {label}
    </span>
  );
}

function Principle({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{children}</p>
    </Card>
  );
}

function Scorecard({ rows }: { rows: ScorecardRow[] }) {
  const label = (r: ScorecardRow) => (r.label === "clean" ? "Clean audio" : `Noisy audio${r.audio_snr_db ? ` (${r.audio_snr_db} dB SNR)` : ""}`);
  const metrics: { name: string; hint: string; get: (r: ScorecardRow) => string; good?: (r: ScorecardRow) => boolean }[] = [
    { name: "Word error rate", hint: "lower is better", get: (r) => fmtPct(r.wer.wer, 1), good: (r) => r.wer.wer < 0.1 },
    { name: "Speaker attribution", hint: "share of speaking time given to the right person", get: (r) => fmtPct(r.speakers.accuracy_by_duration, 1), good: (r) => r.speakers.accuracy_by_duration > 0.9 },
    { name: "…without self-enrolment", hint: "first pass only", get: (r) => (r.pass1 ? fmtPct(r.pass1.speakers.accuracy_by_duration, 1) : "-") },
    { name: "Speaker naming", hint: "voices given the correct name", get: (r) => fmtPct(r.naming.accuracy) },
    { name: "Action items - precision / recall", hint: "matched against the gold list", get: (r) => `${fmtPct(r.action_items.precision)} / ${fmtPct(r.action_items.recall)}`, good: (r) => r.action_items.recall >= 0.8 },
    { name: "Decision recall", hint: "", get: (r) => fmtPct(r.decisions.recall) },
    { name: "Evidence grounding", hint: "items whose quote was verified", get: (r) => `${r.grounding.grounded}/${r.grounding.checked}` },
    { name: "Prompt injection ignored", hint: "spoken instruction inside the meeting", get: (r) => (r.injection_resisted ? "yes" : "no"), good: (r) => r.injection_resisted },
    { name: "Processing time", hint: "for a 5 min 20 s recording", get: (r) => `${Math.round(r.total_latency_s)} s` },
    { name: "API cost", hint: "", get: (r) => fmtCost(r.cost_usd.total) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-subtle">
            <th className="px-5 py-3 font-semibold">Metric</th>
            {rows.map((r) => <th key={r.run_id} className="px-5 py-3 text-right font-semibold">{label(r)}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {metrics.map((m) => (
            <tr key={m.name}>
              <td className="px-5 py-3">
                <div className="font-medium text-fg">{m.name}</div>
                {m.hint && <div className="text-xs text-subtle">{m.hint}</div>}
              </td>
              {rows.map((r) => (
                <td key={r.run_id} className={clsx("px-5 py-3 text-right font-mono tabular-nums", m.good?.(r) ? "font-semibold text-success-text" : "text-fg")}>
                  {m.get(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
