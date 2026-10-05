import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  CalendarClock,
  CheckSquare,
  Clock,
  FileAudio,
  Loader2,
  MessagesSquare,
  Mic,
  Search,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AvatarStack, SpeakerAvatar } from "../components/meeting";
import { useToast } from "../components/overlays";
import { Badge, Button, Card, EmptyState, ProgressBar, Skeleton } from "../components/ui";
import { fmtDate, fmtDuration, fmtTime, plural } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";
import type { JobSnapshot, RunCard } from "../types";

export default function Home() {
  useDocumentTitle(undefined);
  const nav = useNavigate();
  const toast = useToast();
  const lib = useAsync(() => api.runs(), []);
  const [q, setQ] = useState("");
  const [openingSample, setOpeningSample] = useState(false);

  const openSample = async () => {
    setOpeningSample(true);
    try {
      const r = await api.sample();
      nav(r.job_id ? `/jobs/${r.job_id}` : `/m/${r.run_id}/overview`);
    } catch (e) {
      toast.error("Couldn't open the sample", (e as Error).message);
    } finally {
      setOpeningSample(false);
    }
  };

  const runs = useMemo(() => {
    const all = lib.data?.runs ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) => [r.title, r.summary, ...r.speakers].join(" ").toLowerCase().includes(needle));
  }, [lib.data, q]);

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-bg absolute inset-0" aria-hidden />
        <div className="grid-fade absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto grid grid-cols-1 max-w-[1440px] items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-rise">
            <Badge tone="accent" icon={<Sparkles className="size-3.5" />} className="mb-5">
              End-to-end Generative AI · Experiment 8
            </Badge>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.4rem]">
              Meetings in.
              <br />
              <span className="bg-gradient-to-r from-teal-500 to-indigo-500 bg-clip-text text-transparent">Decisions out.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
              Upload a recording and MeetingMind writes a speaker-labelled transcript, minutes where every decision and
              action item is <span className="font-medium text-fg">checked against what was actually said</span>, ready-to-send
              follow-up emails - and lets you ask the meeting questions, answered with timestamps.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/new">
                <Button variant="primary" size="lg" icon={<Upload className="size-[18px]" />}>
                  Upload a recording
                </Button>
              </Link>
              <Button size="lg" onClick={openSample} loading={openingSample} icon={<AudioLines className="size-[18px]" />}>
                Explore the sample meeting
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-subtle">
              <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> Knows who said what</span>
              <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4" /> Every item evidence-checked</span>
              <span className="inline-flex items-center gap-1.5"><MessagesSquare className="size-4" /> Answers cite timestamps</span>
            </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Mic className="size-5" />, title: "Transcribe & diarize", body: "A speech model writes the transcript and separates the voices, then re-checks them using each person's own introduction." },
            { icon: <Users className="size-5" />, title: "Name the speakers", body: "Speakers are named from how they introduce themselves - and you can rename anyone in one click." },
            { icon: <BadgeCheck className="size-5" />, title: "Grounded minutes", body: "Decisions, action items, questions and risks are drafted with evidence, then verified line-by-line against the transcript." },
            { icon: <MessagesSquare className="size-5" />, title: "Follow up & ask", body: "Review the action items, send follow-up emails, and ask questions that are answered only from the meeting." },
          ].map((s, i) => (
            <div key={s.title} className="card relative p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">{s.icon}</span>
                <span className="font-mono text-xs text-subtle">0{i + 1}</span>
              </div>
              <h3 className="font-semibold tracking-tight text-fg">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ library */}
      <section className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-6" aria-labelledby="lib-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="lib-title" className="text-xl font-semibold tracking-tight">Your meetings</h2>
            <p className="mt-1 text-sm text-subtle">
              {lib.data ? `${plural(lib.data.runs.length, "processed meeting")} · open one to review, listen and ask questions` : "Loading…"}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="relative flex-1 sm:w-72">
              <span className="sr-only">Search meetings</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input className="field pl-9" placeholder="Search titles, people…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Link to="/new">
              <Button variant="primary" icon={<Upload className="size-4" />}>Upload</Button>
            </Link>
          </div>
        </div>

        {lib.data?.active_jobs?.length ? (
          <div className="mb-4 grid gap-3">
            {lib.data.active_jobs.map((j) => <ActiveJobCard key={j.id} job={j} />)}
          </div>
        ) : null}

        {lib.loading && !lib.data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-3 h-3.5 w-1/3" />
                <Skeleton className="mt-5 h-3.5 w-full" />
                <Skeleton className="mt-2 h-3.5 w-5/6" />
                <Skeleton className="mt-6 h-7 w-1/2" />
              </Card>
            ))}
          </div>
        ) : lib.error ? (
          <Card>
            <EmptyState icon={<FileAudio className="size-6" />} title="Couldn't load your meetings" action={<Button onClick={lib.reload}>Try again</Button>}>
              {lib.error.message}
            </EmptyState>
          </Card>
        ) : runs.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileAudio className="size-6" />}
              title={q ? "No meetings match your search" : "No meetings yet"}
              action={!q && <Link to="/new"><Button variant="primary" icon={<Upload className="size-4" />}>Upload your first recording</Button></Link>}
            >
              {q ? "Try a different title or a participant's name." : "Upload a recording, or open the sample meeting to see what MeetingMind produces."}
            </EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {runs.map((r, i) => <MeetingCard key={r.run_id} run={r} delay={i * 40} />)}
          </div>
        )}
      </section>
    </>
  );
}

function MeetingCard({ run, delay }: { run: RunCard; delay: number }) {
  const g = run.grounding;
  return (
    <Link
      to={`/m/${run.run_id}/overview`}
      className="card group flex animate-rise flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 font-semibold leading-snug tracking-tight text-fg group-hover:text-accent-text">{run.title}</h3>
        {run.is_sample && <Badge tone="info">{run.run_id.includes("noisy") ? "Sample · noisy audio" : "Sample"}</Badge>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-subtle">
        <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{fmtDate(run.created)}</span>
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{fmtDuration(run.duration)}</span>
      </div>
      <p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-muted">{run.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <AvatarStack names={run.speakers} />
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-muted"><CheckSquare className="size-3.5" />{run.counts.actions}</span>
          <Badge tone={g.rate >= 1 ? "success" : "warning"} icon={<BadgeCheck className="size-3.5" />}>
            {g.grounded}/{g.checked}
          </Badge>
          <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text" />
        </div>
      </div>
    </Link>
  );
}

function ActiveJobCard({ job }: { job: JobSnapshot }) {
  const done = job.events.filter((e) => e.type === "stage" && (e.state === "done" || e.state === "cached")).length;
  return (
    <Link to={`/jobs/${job.id}`} className="card flex items-center gap-4 p-4 hover:border-line-strong">
      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
        <Loader2 className="size-5 animate-spin" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {job.status === "queued" ? "Waiting to start" : "Processing"} · <span className="truncate">{job.title}</span>
        </div>
        <ProgressBar value={done / Math.max(1, job.stages.length)} className="mt-2" />
      </div>
      <span className="text-xs text-subtle">View progress →</span>
    </Link>
  );
}

/** Decorative product preview (pure markup, hidden from screen readers). */
function HeroPreview() {
  const lines = [
    { who: "Priya", i: 0, t: 32, text: "We planned this sprint so the app is on the Play Store before the fest." },
    { who: "Rohan", i: 1, t: 128, text: "I'll build the schedule and registration API and have it on staging by Friday." },
    { who: "Meera", i: 2, t: 141, text: "High-fidelity designs for the schedule screens by Wednesday." },
  ];
  return (
    <div className="relative hidden animate-rise [animation-delay:120ms] lg:block" aria-hidden>
      <div className="card overflow-hidden shadow-lg">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-2.5 rounded-full bg-rose-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-xs font-medium text-subtle">FestPAL Sprint Planning · 05:19</span>
        </div>
        <div className="space-y-1 p-3">
          {lines.map((l, n) => (
            <div key={n} className={`flex gap-3 rounded-xl p-2.5 ${n === 1 ? "bg-accent-soft" : ""}`}>
              <SpeakerAvatar name={l.who} index={l.i} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold" style={{ color: `var(--spk-${l.i}-text)` }}>{l.who}</span>
                  <span className="font-mono text-subtle">{fmtTime(l.t)}</span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-fg">{l.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-surface-2/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Action item</div>
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="mt-0.5 grid size-5 place-items-center rounded-md border-2 border-accent" />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="font-medium text-fg">Build the event schedule and registration API</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-subtle">
                <span>Rohan · due Friday</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-medium text-success-text">
                  <BadgeCheck className="size-3" /> Verified at 02:08
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -top-7 right-8 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-4 shadow-lg">
        <span className="grid size-9 place-items-center rounded-xl bg-indigo-500/15 text-indigo-500"><MessagesSquare className="size-4.5" /></span>
        <div className="text-[12.5px]">
          <div className="font-medium text-fg">“When is the code freeze?”</div>
          <div className="text-subtle">March 14th <span className="font-mono text-accent-text">[04:45]</span></div>
        </div>
      </div>
    </div>
  );
}
