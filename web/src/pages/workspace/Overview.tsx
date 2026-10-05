import clsx from "clsx";
import {
  ArrowRight,
  BadgeCheck,
  CheckSquare,
  ChevronDown,
  CircleHelp,
  Gavel,
  ListTree,
  Mail,
  MessagesSquare,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EvidenceBadge, SpeakerAvatar, SpeakerName, TimestampChip } from "../../components/meeting";
import { Card, SectionTitle, Stat } from "../../components/ui";
import { fmtPct, fmtTime, prettyRole } from "../../lib/format";
import { speakerColor } from "../../lib/speakers";
import { segmentAt, usePlayer, usePlayerTime } from "../../player/PlayerContext";
import type { Decision, Note } from "../../types";
import { useRun } from "./RunContext";

export default function Overview() {
  const { run } = useRun();
  const m = run.minutes;
  const g = m.grounding_summary;

  return (
    <div className="space-y-6">
      {/* summary + people */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="relative overflow-hidden p-6">
          <div className="hero-bg absolute inset-0 opacity-70" aria-hidden />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
              <Sparkles className="size-3.5" /> Executive summary
            </div>
            <p className="text-[16.5px] leading-relaxed text-fg">{m.executive_summary}</p>
            <Agenda />
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle icon={<Users className="size-4" />} title="Participants" hint="Share of speaking time" className="!mb-4" />
          <ul className="space-y-3.5">
            {run.speakers.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <SpeakerAvatar name={s.name} index={s.index} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <SpeakerName name={s.name} index={s.index} className="truncate text-sm" />
                    <span className="font-mono text-xs text-subtle">{fmtPct(s.share)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${s.share * 100}%`, background: speakerColor(s.index).solid }} />
                    </div>
                  </div>
                  {s.role && <div className="mt-0.5 truncate text-xs text-subtle">{prettyRole(s.role)}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Decisions" value={m.decisions.length} icon={<Gavel className="size-3.5" />} />
        <Stat label="Action items" value={run.actions.length} icon={<CheckSquare className="size-3.5" />} sub={`${new Set(run.actions.map((a) => a.owner)).size} owners`} />
        <Stat label="Open questions" value={m.open_questions.length} icon={<CircleHelp className="size-3.5" />} />
        <Stat label="Risks" value={m.risks.length} icon={<ShieldAlert className="size-3.5" />} />
        <Stat
          label="Evidence verified"
          value={`${g.grounded}/${g.checked}`}
          sub={g.rate >= 1 ? "every item checked against the transcript" : `${g.ungrounded} need review`}
          tone={g.rate >= 1 ? "success" : "warning"}
          icon={<BadgeCheck className="size-3.5" />}
        />
      </div>

      {/* topics + decisions */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={<ListTree className="size-4" />} title="Topics" hint="Click a topic to listen from where it starts" />
          <TopicTimeline />
        </Card>
        <Card className="p-5">
          <SectionTitle icon={<Gavel className="size-4" />} title="Decisions" hint="What the group agreed, with the line that proves it" />
          {m.decisions.length ? (
            <ul className="space-y-2.5">
              {m.decisions.map((d, i) => <DecisionItem key={i} d={d} n={i + 1} />)}
            </ul>
          ) : (
            <p className="text-sm text-subtle">No decisions were recorded.</p>
          )}
        </Card>
      </div>

      {/* questions + risks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NoteCard title="Open questions" icon={<CircleHelp className="size-4" />} items={m.open_questions} empty="No open questions." tone="info" />
        <NoteCard title="Risks" icon={<ShieldAlert className="size-4" />} items={m.risks} empty="No risks were raised." tone="danger" />
      </div>

      {/* next steps */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <NextStep to="actions" icon={<CheckSquare className="size-5" />} title={`Review ${run.actions.length} action items`} body="Fix owners and dates before they go out." />
        <NextStep to="ask" icon={<MessagesSquare className="size-5" />} title="Ask the meeting" body="Get answers with timestamps you can play." />
        <NextStep to="emails" icon={<Mail className="size-5" />} title="Draft follow-up emails" body="One per owner, plus a team recap." />
      </div>
    </div>
  );
}

/** Compact, clickable agenda inside the summary card. */
function Agenda() {
  const { run, segStart } = useRun();
  const player = usePlayer();
  const topics = run.minutes.topics ?? [];
  if (!topics.length) return null;
  return (
    <div className="mt-6 border-t border-line/70 pt-4">
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-subtle">Agenda · {topics.length} topics</div>
      <div className="flex flex-wrap gap-2">
        {topics.map((tp, i) => {
          const start = segStart.get(tp.start_segment_id) ?? tp.grounding?.start ?? 0;
          return (
            <button
              key={i}
              onClick={() => player.seek(start)}
              className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pl-1 pr-3 text-[13px] font-medium text-fg shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-accent"
              title={`Play “${tp.title}” from ${fmtTime(start)}`}
            >
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] text-accent-text group-hover:bg-accent group-hover:text-accent-fg">{fmtTime(start)}</span>
              {tp.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TopicTimeline() {
  const { run, segStart, segById } = useRun();
  const t = usePlayerTime();
  const topics = run.minutes.topics ?? [];
  const starts = topics.map((tp) => segStart.get(tp.start_segment_id) ?? tp.grounding?.start ?? 0);
  const currentSeg = segmentAt(run.segments, t);
  const nowStart = currentSeg >= 0 ? run.segments[currentSeg].start : -1;
  let current = -1;
  starts.forEach((s, i) => s <= nowStart + 0.01 && (current = i));

  return (
    <ol className="relative">
      {topics.map((tp, i) => {
        const start = starts[i];
        const end = segById.get(tp.end_segment_id)?.end ?? starts[i + 1] ?? run.meta.duration;
        const active = i === current && t > 0;
        return (
          <li key={i} className="relative pb-1 pl-8 last:pb-0">
            {i < topics.length - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-line" aria-hidden />}
            <span
              className={clsx(
                "absolute left-0 top-3 grid size-[23px] place-items-center rounded-full border text-[10px] font-semibold",
                active ? "border-transparent bg-accent text-accent-fg" : "border-line bg-surface text-subtle",
              )}
            >
              {i + 1}
            </span>
            <TopicRow title={tp.title} summary={tp.summary} start={start} end={end} active={active} />
          </li>
        );
      })}
    </ol>
  );
}

function TopicRow({ title, summary, start, end, active }: { title: string; summary: string; start: number; end: number; active: boolean }) {
  return (
    <div className={clsx("rounded-xl p-2.5 transition-colors", active ? "bg-accent-soft" : "hover:bg-surface-2")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14.5px] font-semibold leading-snug text-fg">{title}</h3>
        <TimestampChip seconds={start} />
      </div>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{summary}</p>
      <div className="mt-1 font-mono text-[11px] text-subtle">
        {fmtTime(start)} – {fmtTime(end)}
      </div>
    </div>
  );
}

function Evidence({ ids, quote }: { ids: string[]; quote: string }) {
  const { segById, speakerIdx } = useRun();
  const seg = ids.map((id) => segById.get(id)).find(Boolean);
  return (
    <figure className="mt-2.5 rounded-lg border-l-[3px] bg-surface-2 py-2 pl-3 pr-2.5" style={{ borderColor: seg ? `var(--spk-${speakerIdx.get(seg.label) ?? 0})` : "var(--line-strong)" }}>
      <blockquote className="text-[13px] italic leading-relaxed text-muted">“{quote}”</blockquote>
      {seg && (
        <figcaption className="mt-1.5 flex items-center gap-2 text-xs">
          <SpeakerName name={seg.speaker} index={speakerIdx.get(seg.label) ?? 0} />
          <span className="text-subtle">{ids.join(", ")}</span>
          <TimestampChip seconds={seg.start} />
        </figcaption>
      )}
    </figure>
  );
}

function DecisionItem({ d, n }: { d: Decision; n: number }) {
  const [open, setOpen] = useState(false);
  const gnd = d.grounding;
  return (
    <li className="rounded-xl border border-line p-3 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-[11px] font-semibold text-muted">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-medium leading-snug text-fg">{d.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EvidenceBadge grounded={gnd.grounded} quote={d.evidence_quote} />
            <TimestampChip seconds={gnd.start} />
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-subtle hover:text-fg" aria-expanded={open}>
              {open ? "Hide" : "Show"} evidence <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </div>
          {open && <Evidence ids={gnd.valid_ids ?? d.evidence_segment_ids} quote={d.evidence_quote} />}
        </div>
      </div>
    </li>
  );
}

function NoteCard({ title, icon, items, empty, tone }: { title: string; icon: React.ReactNode; items: Note[]; empty: string; tone: "info" | "danger" }) {
  const { segById, speakerIdx } = useRun();
  return (
    <Card className="p-5">
      <SectionTitle icon={icon} title={title} />
      {items.length ? (
        <ul className="space-y-2">
          {items.map((it, i) => {
            const seg = (it.grounding?.valid_ids ?? it.evidence_segment_ids).map((id) => segById.get(id)).find(Boolean);
            return (
              <li key={i} className={clsx("flex items-start gap-3 rounded-xl p-3", tone === "info" ? "bg-info-soft/60" : "bg-danger-soft/60")}>
                <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", tone === "info" ? "bg-info" : "bg-danger")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-fg">{it.text}</p>
                  {seg && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-subtle">
                      raised by <SpeakerName name={seg.speaker} index={speakerIdx.get(seg.label) ?? 0} />
                    </div>
                  )}
                </div>
                <TimestampChip seconds={it.grounding?.start ?? seg?.start} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-subtle">{empty}</p>
      )}
    </Card>
  );
}

function NextStep({ to, icon, title, body }: { to: string; icon: React.ReactNode; title: string; body: string }) {
  const { run } = useRun();
  return (
    <Link to={`/m/${run.run_id}/${to}`} className="card group flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-fg">{title}</div>
        <div className="text-[13px] text-subtle">{body}</div>
      </div>
      <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text" />
    </Link>
  );
}
