import clsx from "clsx";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  Clock,
  Cpu,
  FileAudio,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  RefreshCw,
  ScrollText,
  Wallet,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { AvatarStack } from "../../components/meeting";
import { Tooltip, useToast } from "../../components/overlays";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import { fmtCost, fmtDate, fmtDuration } from "../../lib/format";
import { useAsync, useDocumentTitle, useHotkeys } from "../../lib/hooks";
import { speakerIndexMap } from "../../lib/speakers";
import { PlayerBar } from "../../player/PlayerBar";
import { PlayerProvider, usePlayer } from "../../player/PlayerContext";
import type { RunPayload } from "../../types";
import Actions from "./Actions";
import Ask from "./Ask";
import Emails from "./Emails";
import { ExportMenu } from "./ExportMenu";
import Overview from "./Overview";
import { buildCitations, RunContext, type RunCtx } from "./RunContext";
import Transcript from "./Transcript";

const Analytics = lazy(() => import("./Analytics"));

export const SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "transcript", label: "Transcript", icon: ScrollText },
  { key: "actions", label: "Action items", icon: CheckSquare },
  { key: "ask", label: "Ask the meeting", icon: MessagesSquare },
  { key: "emails", label: "Follow-up emails", icon: Mail },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default function Workspace() {
  const { runId = "", section } = useParams();
  const res = useAsync(() => api.run(runId), [runId]);

  if (section && !SECTIONS.some((s) => s.key === section)) return <Navigate to={`/m/${runId}/overview`} replace />;
  if (res.error)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <EmptyState icon={<FileAudio className="size-6" />} title={res.error.message} action={<Link to="/"><Button variant="primary">Back to meetings</Button></Link>}>
            The meeting may have been removed, or the link is mistyped.
          </EmptyState>
        </Card>
      </div>
    );
  if (!res.data) return <WorkspaceSkeleton />;
  return (
    <PlayerProvider src={res.data.audio_url} fallbackDuration={res.data.meta.duration}>
      <Loaded run={res.data} setRun={res.setData as RunCtx["setRun"]} reload={res.reload} section={(section ?? "overview") as SectionKey} />
    </PlayerProvider>
  );
}

function Loaded({ run, setRun, reload, section }: { run: RunPayload; setRun: RunCtx["setRun"]; reload: () => void; section: SectionKey }) {
  useDocumentTitle(run.title);
  const nav = useNavigate();
  const toast = useToast();
  const player = usePlayer();
  const [regenerating, setRegenerating] = useState(false);

  const ctx = useMemo<RunCtx>(() => {
    const segById = new Map(run.segments.map((s) => [s.id, s]));
    return {
      run,
      setRun,
      reload,
      speakerIdx: speakerIndexMap(run.speakers),
      segById,
      segStart: new Map(run.segments.map((s) => [s.id, s.start])),
      citedBy: buildCitations(run),
    };
  }, [run, setRun, reload]);

  const go = useCallback((key: string) => nav(`/m/${run.run_id}/${key}`), [nav, run.run_id]);

  useHotkeys({
    Space: (e) => (e.preventDefault(), player.toggle()),
    ArrowLeft: (e) => (e.preventDefault(), player.skip(-5)),
    ArrowRight: (e) => (e.preventDefault(), player.skip(5)),
    "Shift+ArrowLeft": (e) => (e.preventDefault(), player.skip(-10)),
    "Shift+ArrowRight": (e) => (e.preventDefault(), player.skip(10)),
    m: () => player.setMuted(!player.muted),
    "?": () => window.dispatchEvent(new Event("mm:shortcuts")),
    "/": (e) => {
      e.preventDefault();
      if (section !== "transcript" && section !== "ask") go("transcript");
      setTimeout(() => window.dispatchEvent(new Event("mm:focus-search")), 60);
    },
    f: () => window.dispatchEvent(new Event("mm:toggle-follow")),
    ...Object.fromEntries(SECTIONS.map((s, i) => [String(i + 1), () => go(s.key)])),
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [section]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const r = await api.regenerate(run.run_id);
      nav(`/jobs/${r.job_id}`);
    } catch (e) {
      toast.error("Couldn't regenerate", (e as Error).message);
      setRegenerating(false);
    }
  };

  const counts: Partial<Record<SectionKey, number>> = {
    transcript: run.segments.length,
    actions: run.actions.length,
    emails: new Set(run.actions.filter((a) => a.include).map((a) => a.owner)).size + 1,
  };
  const g = run.minutes.grounding_summary;

  return (
    <RunContext.Provider value={ctx}>
      <div className="mx-auto max-w-[1440px] px-4 pb-32 pt-6 sm:px-6">
        {/* header */}
        <nav className="mb-3 flex items-center gap-1 text-[13px] text-subtle" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-fg">Meetings</Link>
          <ChevronRight className="size-3.5" />
          <span className="truncate text-muted">{run.title}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{run.title}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <MetaChip icon={<CalendarClock className="size-3.5" />}>{fmtDate(run.meta.created)}</MetaChip>
              <MetaChip icon={<Clock className="size-3.5" />}>{fmtDuration(run.meta.duration)}</MetaChip>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-0.5 pl-1 pr-2.5 text-xs text-muted">
                <AvatarStack names={run.speakers.map((s) => s.name)} max={6} />
                {run.speakers.length} speakers
              </span>
              <Tooltip content="Decisions and action items whose cited evidence was found in the transcript.">
                <Badge tone={g.rate >= 1 ? "success" : "warning"} icon={<BadgeCheck className="size-3.5" />} tabIndex={0}>
                  {g.grounded}/{g.checked} evidence verified
                </Badge>
              </Tooltip>
              <span className="hidden sm:contents">
                <Tooltip content={`Speech: ${run.meta.stt_model_used} · Language: ${run.meta.models.chat} · Embeddings: ${run.meta.models.embed}`}>
                  <MetaChip icon={<Cpu className="size-3.5" />}>{run.meta.stt_model_used}</MetaChip>
                </Tooltip>
              </span>
              <Tooltip content="Estimated OpenAI API cost to process this meeting.">
                <MetaChip icon={<Wallet className="size-3.5" />}>{fmtCost(run.meta.cost?.total)}</MetaChip>
              </Tooltip>
            </div>
          </div>
          <ExportMenu />
        </div>

        {run.names_changed_since_minutes && (
          <Banner tone="info" icon={<RefreshCw className="size-4" />} action={<Button size="sm" variant="primary" loading={regenerating} onClick={regenerate}>Regenerate minutes</Button>}>
            You renamed speakers. The transcript uses the new names; regenerate the minutes so summaries, action items and emails use them too (takes ~15 s).
          </Banner>
        )}
        {run.transcript.fallback_reason && (
          <Banner tone="warning" icon={<AlertTriangle className="size-4" />}>
            Speaker separation wasn't available for this recording ({run.transcript.fallback_reason}). Lines are not attributed to individual speakers.
          </Banner>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* section nav */}
          <nav aria-label="Meeting sections" className="lg:sticky lg:top-20 lg:self-start">
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {SECTIONS.map((s) => {
                const active = s.key === section;
                const Icon = s.icon;
                return (
                  <li key={s.key} className="shrink-0">
                    <Link
                      to={`/m/${run.run_id}/${s.key}`}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <Icon className={clsx("size-[18px]", active ? "text-accent-text" : "text-subtle group-hover:text-muted")} />
                      <span className="whitespace-nowrap">{s.label}</span>
                      {counts[s.key] != null && (
                        <span className={clsx("ml-auto rounded-md px-1.5 text-[11px] tabular-nums", active ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-subtle")}>
                          {counts[s.key]}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 hidden rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-subtle lg:block">
              Press <kbd className="font-mono">?</kbd> for shortcuts. <kbd className="font-mono">Space</kbd> plays, <kbd className="font-mono">←</kbd>/<kbd className="font-mono">→</kbd> seek, <kbd className="font-mono">1–6</kbd> switch sections.
            </div>
          </nav>

          {/* content */}
          <div key={section} className="min-w-0 animate-fade-in">
            {section === "overview" && <Overview />}
            {section === "transcript" && <Transcript />}
            {section === "actions" && <Actions />}
            {section === "ask" && <Ask />}
            {section === "emails" && <Emails />}
            {section === "analytics" && (
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <Analytics />
              </Suspense>
            )}
          </div>
        </div>
      </div>
      <PlayerBar segments={run.segments} speakers={run.speakers} topics={run.minutes.topics ?? []} segStart={ctx.segStart} />
    </RunContext.Provider>
  );
}

function MetaChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
      <span className="text-subtle">{icon}</span>
      {children}
    </span>
  );
}

export function Banner({ tone, icon, children, action }: { tone: "info" | "warning"; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={clsx(
        "mt-4 flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center",
        tone === "info" ? "border-info/25 bg-info-soft text-info-text" : "border-warning/25 bg-warning-soft text-warning-text",
      )}
    >
      <span className="flex flex-1 items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span>{children}</span>
      </span>
      {action}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-8 w-96 max-w-full" />
      <div className="mt-4 flex gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-28" />)}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
