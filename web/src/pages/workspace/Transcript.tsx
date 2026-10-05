import clsx from "clsx";
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Crosshair,
  Gavel,
  ListChecks,
  PenLine,
  Play,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { SpeakerAvatar } from "../../components/meeting";
import { Modal, Tooltip, useToast } from "../../components/overlays";
import { Button, Card, EmptyState, Switch } from "../../components/ui";
import { fmtPct, fmtTime, prettyRole } from "../../lib/format";
import { useLocalStorage } from "../../lib/hooks";
import { speakerColor } from "../../lib/speakers";
import { useActiveSegment, usePlayer } from "../../player/PlayerContext";
import type { Segment } from "../../types";
import { useRun } from "./RunContext";

export default function Transcript() {
  const { run, speakerIdx, citedBy } = useRun();
  const player = usePlayer();
  const active = useActiveSegment(run.segments);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [follow, setFollow] = useLocalStorage("mm-follow", true);
  const [matchIdx, setMatchIdx] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);

  // keyboard events from the workspace
  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    const toggle = () => setFollow((f) => !f);
    window.addEventListener("mm:focus-search", focus);
    window.addEventListener("mm:toggle-follow", toggle);
    return () => {
      window.removeEventListener("mm:focus-search", focus);
      window.removeEventListener("mm:toggle-follow", toggle);
    };
  }, [setFollow]);

  const topicStarts = useMemo(() => {
    const m = new Map<string, { title: string; n: number }>();
    (run.minutes.topics ?? []).forEach((t, i) => m.set(t.start_segment_id, { title: t.title, n: i + 1 }));
    return m;
  }, [run.minutes.topics]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => run.segments.filter((s) => !hidden.has(s.label)), [run.segments, hidden]);
  const matches = useMemo(() => (needle ? visible.filter((s) => s.text.toLowerCase().includes(needle) || s.speaker.toLowerCase().includes(needle)) : []), [visible, needle]);
  const matchIds = useMemo(() => new Set(matches.map((s) => s.id)), [matches]);
  const currentMatchId = matches.length ? matches[Math.min(matchIdx, matches.length - 1)].id : null;

  useEffect(() => {
    setMatchIdx(0);
  }, [needle]);

  const scrollTo = useCallback((id: string, smooth = true) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-seg="${id}"]`);
    el?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (currentMatchId) scrollTo(currentMatchId);
  }, [currentMatchId, scrollTo]);

  // follow playback (paused for a few seconds after the user scrolls manually)
  const activeId = active >= 0 ? run.segments[active].id : null;
  useEffect(() => {
    if (!follow || !activeId || !player.playing || needle) return;
    if (Date.now() - userScrolledAt.current < 4000) return;
    scrollTo(activeId);
  }, [activeId, follow, player.playing, needle, scrollTo]);

  useEffect(() => {
    const mark = () => (userScrolledAt.current = Date.now());
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
    };
  }, []);

  const toggleSpeaker = (label: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      if (n.size === run.speakers.length) return new Set();
      return n;
    });

  const step = (d: number) => matches.length && setMatchIdx((i) => (i + d + matches.length) % matches.length);

  return (
    <>
      {/* toolbar */}
      <div className="sticky top-14 z-20 -mx-1 mb-4 rounded-2xl border border-line bg-surface/90 p-3 shadow-sm backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">Search the transcript</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              ref={searchRef}
              className={clsx("field !py-2 pl-9", needle && "pr-28")}
              placeholder="Search words or names…  ( / )"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.preventDefault(), step(e.shiftKey ? -1 : 1));
                if (e.key === "Escape") (setQuery(""), (e.target as HTMLInputElement).blur());
              }}
            />
            {needle && (
              <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <span className="mr-1 font-mono text-xs text-subtle">{matches.length ? `${Math.min(matchIdx, matches.length - 1) + 1}/${matches.length}` : "0"}</span>
                <button className="grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" onClick={() => step(-1)} aria-label="Previous match"><ChevronUp className="size-4" /></button>
                <button className="grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" onClick={() => step(1)} aria-label="Next match"><ChevronDown className="size-4" /></button>
                <button className="grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" onClick={() => setQuery("")} aria-label="Clear search"><X className="size-3.5" /></button>
              </span>
            )}
          </label>
          <label className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] text-muted">
            <Switch checked={follow} onChange={setFollow} label="Follow playback" />
            <span className="hidden sm:inline">Follow playback</span>
          </label>
          <Button size="sm" variant="ghost" aria-label="Jump to the line being played" title="Jump to the line being played" icon={<Crosshair className="size-3.5" />} onClick={() => activeId && scrollTo(activeId)} disabled={!activeId}>
            <span className="hidden sm:inline">Jump to now</span>
          </Button>
          <Button size="sm" icon={<PenLine className="size-3.5" />} onClick={() => setRenaming(true)}>
            Rename speakers
          </Button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by speaker">
          {run.speakers.map((s) => {
            const on = !hidden.has(s.label);
            const c = speakerColor(s.index);
            return (
              <button
                key={s.label}
                onClick={() => toggleSpeaker(s.label)}
                aria-pressed={on}
                className={clsx("inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition-all", on ? "border-transparent" : "border-line opacity-55 grayscale")}
                style={on ? { background: c.soft, color: c.text } : undefined}
                title={on ? `Hide ${s.name}` : `Show ${s.name}`}
              >
                <SpeakerAvatar name={s.name} index={s.index} size="xs" />
                {s.name}
                <span className="font-mono text-[10px] opacity-70">{fmtPct(s.share)}</span>
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button className="text-xs font-medium text-accent-text hover:underline" onClick={() => setHidden(new Set())}>
              Show everyone
            </button>
          )}
        </div>
      </div>

      {/* lines */}
      <Card className="p-2 sm:p-3">
        <div ref={listRef} role="list" aria-label="Transcript">
          {visible.length === 0 ? (
            <EmptyState title="No lines to show" icon={<Search className="size-6" />}>Turn a speaker back on above.</EmptyState>
          ) : (
            visible.map((s) => {
              const topic = topicStarts.get(s.id);
              return (
                <Fragment key={s.id}>
                  {topic && (
                    <div className="flex items-center gap-3 px-2 pb-2 pt-4 first:pt-1">
                      <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold text-subtle">Topic {topic.n}</span>
                      <span className="text-[13px] font-semibold text-muted">{topic.title}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <Line
                    seg={s}
                    index={speakerIdx.get(s.label) ?? 0}
                    active={s.id === activeId}
                    match={matchIds.has(s.id)}
                    current={s.id === currentMatchId}
                    needle={needle}
                    cites={citedBy.get(s.id)}
                    onPlay={player.seek}
                  />
                </Fragment>
              );
            })
          )}
        </div>
      </Card>

      <RenameSpeakers open={renaming} onClose={() => setRenaming(false)} />
    </>
  );
}

const CITE_ICON: Record<string, ReactNode> = {
  decision: <Gavel className="size-3" />,
  action: <ListChecks className="size-3" />,
  question: <CircleHelp className="size-3" />,
  risk: <ShieldAlert className="size-3" />,
};

const Line = memo(function Line({
  seg,
  index,
  active,
  match,
  current,
  needle,
  cites,
  onPlay,
}: {
  seg: Segment;
  index: number;
  active: boolean;
  match: boolean;
  current: boolean;
  needle: string;
  cites?: { kind: string; text: string }[];
  onPlay: (t: number, play?: boolean) => void;
}) {
  const c = speakerColor(index);
  return (
    <div
      role="listitem"
      data-seg={seg.id}
      tabIndex={0}
      onClick={() => onPlay(seg.start)}
      onKeyDown={(e) => e.key === "Enter" && onPlay(seg.start)}
      aria-current={active ? "true" : undefined}
      className={clsx(
        "group relative flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition-colors",
        active ? "bg-accent-soft" : match ? "bg-warning-soft/50" : "hover:bg-surface-2",
      )}
    >
      <span className="absolute inset-y-2 left-0 w-[3px] rounded-full transition-opacity" style={{ background: c.solid, opacity: active ? 1 : 0 }} aria-hidden />
      <SpeakerAvatar name={seg.speaker} index={index} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold" style={{ color: c.text }}>{seg.speaker}</span>
          <span className="font-mono text-[11.5px] text-subtle">{fmtTime(seg.start)}</span>
          {cites?.map((ct, i) => (
            <Tooltip key={i} content={<><span className="font-semibold capitalize">Cited as {ct.kind}</span><span className="mt-0.5 block opacity-90">{ct.text}</span></>}>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-px text-[10.5px] font-medium capitalize text-muted">
                {CITE_ICON[ct.kind]} {ct.kind}
              </span>
            </Tooltip>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-accent-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Play className="size-3 fill-current" /> Play from here
          </span>
        </div>
        <p className={clsx("mt-0.5 text-[14.5px] leading-relaxed", active ? "text-fg" : "text-fg/90")}>
          <Highlight text={seg.text} needle={needle} current={current} />
        </p>
      </div>
    </div>
  );
});

function Highlight({ text, needle, current }: { text: string; needle: string; current: boolean }) {
  if (!needle) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0, k = 0;
  while (i < text.length) {
    const j = lower.indexOf(needle, i);
    if (j < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(<mark key={k++} className={clsx("hl", current && "current")}>{text.slice(j, j + needle.length)}</mark>);
    i = j + needle.length;
  }
  return <>{parts}</>;
}

function RenameSpeakers({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, setRun } = useRun();
  const toast = useToast();
  const [names, setNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNames(Object.fromEntries(run.speakers.map((s) => [s.label, s.name])));
  }, [open, run.speakers]);

  const firstLine = (label: string) => run.segments.find((s) => s.label === label);
  const changed = run.speakers.some((s) => (names[s.label] ?? s.name).trim() !== s.name);

  const save = async () => {
    setSaving(true);
    try {
      const overrides = Object.fromEntries(run.speakers.map((s) => [s.label, (names[s.label] ?? s.name).trim()]));
      const next = await api.renameSpeakers(run.run_id, overrides);
      setRun(next);
      toast.success("Speakers renamed", next.names_changed_since_minutes ? "Regenerate the minutes to update summaries and emails." : undefined);
      onClose();
    } catch (e) {
      toast.error("Couldn't rename speakers", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename speakers"
      description="Fix a misheard name or replace a generic label. The transcript updates immediately."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!changed}>Save names</Button>
        </>
      }
    >
      <ul className="space-y-3">
        {run.speakers.map((s) => {
          const line = firstLine(s.label);
          return (
            <li key={s.label} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-3">
                <SpeakerAvatar name={names[s.label] || s.name} index={s.index} />
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`spk-${s.label}`}>Name for {s.label}</label>
                  <input
                    id={`spk-${s.label}`}
                    className="field !py-1.5"
                    value={names[s.label] ?? ""}
                    maxLength={40}
                    onChange={(e) => setNames((n) => ({ ...n, [s.label]: e.target.value }))}
                  />
                </div>
                {line && <PlayChip t={line.start} />}
              </div>
              <div className="mt-2 flex items-center gap-2 pl-12 text-xs text-subtle">
                <span className="font-mono">voice {s.label}</span>
                {s.role && <span>· {prettyRole(s.role)}</span>}
                <span>· {fmtPct(s.share)} of talk time</span>
              </div>
              {line && <p className="mt-1.5 line-clamp-2 pl-12 text-[13px] italic text-muted">“{line.text}”</p>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function PlayChip({ t }: { t: number }) {
  const p = usePlayer();
  return (
    <Button size="sm" variant="soft" icon={<Play className="size-3 fill-current" />} onClick={() => p.seek(t)}>
      Listen
    </Button>
  );
}
