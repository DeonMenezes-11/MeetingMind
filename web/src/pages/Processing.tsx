import clsx from "clsx";
import {
  AlertOctagon,
  ArrowRight,
  AudioWaveform,
  BadgeCheck,
  Check,
  Database,
  FileDown,
  FileText,
  Fingerprint,
  Loader2,
  Mic,
  SkipForward,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/overlays";
import { Badge, Button, Card, EmptyState, ProgressBar, Skeleton } from "../components/ui";
import { fmtDuration } from "../lib/format";
import { useDocumentTitle } from "../lib/hooks";
import type { JobEvent, JobSnapshot } from "../types";

const INFO: Record<string, { icon: ReactNode; explain: string; weight: number; tau: number }> = {
  prepare: { icon: <AudioWaveform className="size-4" />, explain: "Converting the recording to 16 kHz mono with ffmpeg so every model hears the same audio.", weight: 1, tau: 2 },
  transcribe: { icon: <Mic className="size-4" />, explain: "A diarizing speech model writes the words and separates the voices (speaker A, B, C…).", weight: 40, tau: 70 },
  speakers: { icon: <Users className="size-4" />, explain: "An LLM reads the introductions to match each voice to a name and role.", weight: 2, tau: 4 },
  enrol: { icon: <Fingerprint className="size-4" />, explain: "If voices were merged, each person's own introduction becomes a voice reference for a second, more accurate pass.", weight: 42, tau: 70 },
  minutes: { icon: <FileText className="size-4" />, explain: "Structured output turns the transcript into topics, decisions, action items, questions and risks - each citing its lines.", weight: 8, tau: 8 },
  grounding: { icon: <BadgeCheck className="size-4" />, explain: "Every cited line is checked against the transcript; anything that doesn't match is flagged for review.", weight: 1, tau: 1 },
  index: { icon: <Database className="size-4" />, explain: "The transcript is split into overlapping windows and embedded so you can ask the meeting questions.", weight: 3, tau: 3 },
  export: { icon: <FileDown className="size-4" />, explain: "Markdown minutes, JSON, CSV and subtitles are written to disk.", weight: 1, tau: 1 },
};

type StageState = { state: "waiting" | "running" | "done" | "cached" | "skipped"; detail: string; startedAt?: number; seconds?: number; messages: string[] };

function reduce(stages: { key: string }[], events: JobEvent[]) {
  const map: Record<string, StageState> = Object.fromEntries(stages.map((s) => [s.key, { state: "waiting", detail: "", messages: [] }]));
  let status: JobSnapshot["status"] = "queued";
  let runId: string | null = null;
  let error: string | null = null;
  for (const e of events) {
    if (e.type === "status") status = e.status;
    else if (e.type === "done") (status = "done"), (runId = e.run_id);
    else if (e.type === "error") (status = "error"), (error = e.message);
    else if (e.type === "stage" && map[e.stage]) {
      const s = map[e.stage];
      if (e.state === "running") {
        if (s.state === "waiting") (s.state = "running"), (s.startedAt = e.t);
        if (e.detail.startsWith("not needed")) s.state = "skipped";
        s.detail = e.detail;
        s.messages.push(e.detail);
      } else if (e.state === "done") {
        if (s.state !== "skipped") s.state = "done";
        s.seconds = parseFloat(e.detail);
      } else if (e.state === "cached") {
        s.state = "cached";
        s.detail = "re-used cached result";
      }
    }
  }
  return { map, status, runId, error };
}

export default function Processing() {
  const { jobId = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [snap, setSnap] = useState<JobSnapshot | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const redirected = useRef(false);

  useDocumentTitle(snap ? `Processing · ${snap.title}` : "Processing");

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    api
      .job(jobId)
      .then((s) => {
        if (cancelled) return;
        setSnap(s);
        es = new EventSource(api.jobEventsUrl(jobId));
        const seen: JobEvent[] = [];
        es.onmessage = (m) => {
          seen.push(JSON.parse(m.data));
          setEvents([...seen]);
        };
        es.onerror = () => {
          // stream ends normally when the job finishes; refresh the snapshot either way
          es?.close();
          api.job(jobId).then((s2) => !cancelled && (setSnap(s2), setEvents(s2.events))).catch(() => undefined);
        };
      })
      .catch((e: Error) => setLoadError(e.message));
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [jobId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 500);
    return () => clearInterval(t);
  }, []);

  const stages = snap?.stages ?? [];
  const { map, status, runId, error } = useMemo(() => reduce(stages, events.length ? events : snap?.events ?? []), [stages, events, snap]);
  const startedAt = snap?.started ?? snap?.created ?? now;
  const elapsed = status === "done" || status === "error" ? (snap?.finished ?? now) - startedAt : now - startedAt;
  const lastT = events.length ? events[events.length - 1].t : 0;

  const progress = useMemo(() => {
    if (status === "done") return 1;
    const total = stages.reduce((a, s) => a + (INFO[s.key]?.weight ?? 1), 0) || 1;
    let got = 0;
    for (const s of stages) {
      const st = map[s.key];
      const w = INFO[s.key]?.weight ?? 1;
      if (st.state === "done" || st.state === "cached" || st.state === "skipped") got += w;
      else if (st.state === "running") {
        const inStage = Math.max(0, elapsed - (st.startedAt ?? lastT));
        got += w * 0.92 * (1 - Math.exp(-inStage / (INFO[s.key]?.tau ?? 10)));
      }
    }
    return got / total;
  }, [stages, map, status, elapsed, lastT]);

  useEffect(() => {
    if (status === "done" && runId && !redirected.current) {
      redirected.current = true;
      toast.success("Your meeting is ready", "Opening the workspace…");
      const t = setTimeout(() => nav(`/m/${runId}/overview`), 1400);
      return () => clearTimeout(t);
    }
  }, [status, runId, nav, toast]);

  if (loadError)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <EmptyState icon={<AlertOctagon className="size-6" />} title="This processing job isn't available" action={<Link to="/"><Button variant="primary">Back to meetings</Button></Link>}>
            {loadError}. Jobs are kept in memory, so they disappear when the server restarts - finished meetings are still in your library.
          </EmptyState>
        </Card>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {!snap ? (
        <Card className="p-6">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="mt-4 h-2 w-full" />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="mt-6 h-10 w-full" />)}
        </Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={status} />
                <span className="text-[13px] text-subtle">{snap.kind === "regenerate" ? "Regenerating minutes" : "Processing recording"}</span>
              </div>
              <h1 className="truncate text-2xl font-semibold tracking-tight">{snap.title}</h1>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-semibold tabular-nums">{fmtClock(elapsed)}</div>
              <div className="text-xs text-subtle">elapsed</div>
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-line p-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{status === "done" ? "Complete" : status === "error" ? "Stopped" : status === "queued" ? "Waiting for another job to finish…" : "Working…"}</span>
                <span className="font-mono text-xs text-subtle">{Math.round(progress * 100)}%</span>
              </div>
              <ProgressBar value={progress} tone={status === "error" ? "danger" : status === "done" ? "success" : "accent"} />
            </div>

            <ol className="relative p-2 sm:p-3" aria-label="Pipeline stages">
              {stages.map((s, i) => {
                const st = map[s.key];
                const info = INFO[s.key];
                const isLast = i === stages.length - 1;
                return (
                  <li key={s.key} className={clsx("relative flex gap-4 rounded-xl p-3", st.state === "running" && "bg-accent-soft/60")}>
                    {!isLast && <span className="absolute left-[29px] top-12 h-[calc(100%-36px)] w-px bg-line" aria-hidden />}
                    <StageIcon state={st.state} icon={info?.icon} />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={clsx("font-medium", st.state === "waiting" ? "text-subtle" : "text-fg")}>{s.label}</span>
                        <StageChip st={st} />
                      </div>
                      {(st.state === "running" || st.state === "waiting") && <p className="mt-1 text-[13px] leading-relaxed text-subtle">{info?.explain}</p>}
                      {st.state === "running" && st.messages.length > 1 && (
                        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-accent-text">
                          <Loader2 className="size-3 animate-spin" /> {st.messages[st.messages.length - 1]}
                        </p>
                      )}
                      {st.state === "skipped" && <p className="mt-1 text-[13px] text-subtle">{st.detail.replace(/^not needed - /, "Not needed: ")}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>

            {status === "error" && (
              <div className="border-t border-line bg-danger-soft p-5">
                <div className="flex items-start gap-3">
                  <AlertOctagon className="mt-0.5 size-5 shrink-0 text-danger-text" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-danger-text">Processing failed</div>
                    <p className="mt-1 break-words text-sm text-muted">{error}</p>
                    <div className="mt-4 flex gap-2">
                      <Link to="/new"><Button variant="primary">Try another upload</Button></Link>
                      <Link to="/"><Button>Back to meetings</Button></Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {status === "done" && runId && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-success-soft p-5">
                <div className="flex items-center gap-2 font-medium text-success-text">
                  <Check className="size-5" /> Finished in {fmtDuration(elapsed)}
                </div>
                <Link to={`/m/${runId}/overview`}>
                  <Button variant="primary" iconRight={<ArrowRight className="size-4" />}>Open meeting</Button>
                </Link>
              </div>
            )}
          </Card>
          {status !== "done" && status !== "error" && (
            <p className="mt-4 text-center text-[13px] text-subtle">
              You can leave this page - processing continues in the background and the meeting will appear in your library.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function fmtClock(s: number) {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: JobSnapshot["status"] }) {
  if (status === "done") return <Badge tone="success" icon={<Check className="size-3.5" />}>Done</Badge>;
  if (status === "error") return <Badge tone="danger" icon={<AlertOctagon className="size-3.5" />}>Failed</Badge>;
  if (status === "queued") return <Badge tone="neutral">Queued</Badge>;
  return <Badge tone="accent" icon={<Loader2 className="size-3.5 animate-spin" />}>Running</Badge>;
}

function StageIcon({ state, icon }: { state: StageState["state"]; icon: ReactNode }) {
  return (
    <span
      className={clsx(
        "relative z-10 grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
        state === "done" && "border-transparent bg-success text-white",
        state === "cached" && "border-transparent bg-info-soft text-info-text",
        state === "skipped" && "border-line bg-surface-2 text-subtle",
        state === "running" && "border-transparent bg-accent text-accent-fg animate-pulse-ring",
        state === "waiting" && "border-line bg-surface text-subtle",
      )}
    >
      {state === "done" ? <Check className="size-4" strokeWidth={3} /> : state === "skipped" ? <SkipForward className="size-4" /> : state === "running" ? <Loader2 className="size-4 animate-spin" /> : icon}
    </span>
  );
}

function StageChip({ st }: { st: StageState }) {
  if (st.state === "done") return <span className="font-mono text-xs text-success-text">{st.seconds != null ? `${st.seconds.toFixed(1)} s` : "done"}</span>;
  if (st.state === "cached") return <Badge tone="info">cached</Badge>;
  if (st.state === "skipped") return <Badge tone="neutral">skipped</Badge>;
  if (st.state === "running") return <span className="text-xs font-medium text-accent-text">in progress</span>;
  return null;
}
