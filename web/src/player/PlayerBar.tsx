import clsx from "clsx";
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { SpeakerAvatar } from "../components/meeting";
import { fmtTime } from "../lib/format";
import { speakerColor } from "../lib/speakers";
import type { Segment, Speaker, Topic } from "../types";
import { segmentAt, usePlayer, usePlayerTime } from "./PlayerContext";

const RATES = [1, 1.25, 1.5, 2, 0.75];

export function PlayerBar({
  segments,
  speakers,
  topics,
  segStart,
}: {
  segments: Segment[];
  speakers: Speaker[];
  topics: Topic[];
  segStart: Map<string, number>;
}) {
  const p = usePlayer();
  const t = usePlayerTime();
  const idx = useMemo(() => new Map(speakers.map((s) => [s.label, s.index])), [speakers]);
  const active = segmentAt(segments, t);
  const seg = active >= 0 ? segments[active] : null;
  const speaking = seg && t <= seg.end + 0.6 ? seg : null;
  const sIndex = speaking ? idx.get(speaking.label) ?? 0 : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-6">
        {/* transport */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => p.skip(-10)}
            className="hidden size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:grid"
            aria-label="Back 10 seconds"
            title="Back 10 s (Shift+←)"
          >
            <RotateCcw className="size-[18px]" />
          </button>
          <button
            onClick={p.toggle}
            className={clsx(
              "grid size-11 place-items-center rounded-full bg-accent text-accent-fg shadow-md transition-transform hover:scale-105 active:scale-95",
              p.playing && "animate-pulse-ring",
            )}
            aria-label={p.playing ? "Pause" : "Play"}
            title={p.playing ? "Pause (Space)" : "Play (Space)"}
          >
            {p.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </button>
          <button
            onClick={() => p.skip(10)}
            className="hidden size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:grid"
            aria-label="Forward 10 seconds"
            title="Forward 10 s (Shift+→)"
          >
            <RotateCw className="size-[18px]" />
          </button>
        </div>

        {/* now speaking */}
        <div className="hidden w-44 min-w-0 items-center gap-2.5 md:flex">
          {speaking ? (
            <>
              <SpeakerAvatar name={speaking.speaker} index={sIndex} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold" style={{ color: speakerColor(sIndex).text }}>
                  {speaking.speaker}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-subtle">
                  {p.playing ? <EqBars color={speakerColor(sIndex).solid} /> : null}
                  {p.playing ? "speaking" : `paused · ${speaking.id}`}
                </div>
              </div>
            </>
          ) : (
            <div className="text-[13px] text-subtle">{p.error ?? (p.ready ? "Press play or click any line" : "Loading audio…")}</div>
          )}
        </div>

        {/* scrubber */}
        <Scrubber segments={segments} idx={idx} topics={topics} segStart={segStart} />

        {/* time + options */}
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">
            {fmtTime(t)}
            <span className="hidden text-subtle sm:inline"> / {fmtTime(p.duration)}</span>
          </span>
          <button
            onClick={() => p.setRate(RATES[(RATES.indexOf(p.rate) + 1) % RATES.length])}
            className="h-7 min-w-11 rounded-md border border-line px-1.5 font-mono text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
            aria-label={`Playback speed ${p.rate}x`}
            title="Playback speed"
          >
            {p.rate}×
          </button>
          <button
            onClick={() => p.setMuted(!p.muted)}
            className="hidden size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:grid"
            aria-label={p.muted ? "Unmute" : "Mute"}
            title={p.muted ? "Unmute (M)" : "Mute (M)"}
          >
            {p.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function EqBars({ color }: { color: string }) {
  return (
    <span className="inline-flex h-2.5 items-end gap-[2px]" aria-hidden>
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className="eq-bar w-[2px] rounded-full" style={{ height: "100%", background: color, animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}

function Scrubber({
  segments,
  idx,
  topics,
  segStart,
}: {
  segments: Segment[];
  idx: Map<string, number>;
  topics: Topic[];
  segStart: Map<string, number>;
}) {
  const p = usePlayer();
  const t = usePlayerTime();
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const d = p.duration || segments[segments.length - 1]?.end || 1;
  const pct = Math.min(100, (t / d) * 100);

  const ratioAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const hoverSeg = hover != null ? segments[segmentAt(segments, hover * d)] : null;
  const blocks = (opacity: number) =>
    segments.map((s) => (
      <span
        key={s.id}
        className="absolute inset-y-0 rounded-[2px]"
        style={{
          left: `${(s.start / d) * 100}%`,
          width: `max(2px, ${((s.end - s.start) / d) * 100}%)`,
          background: speakerColor(idx.get(s.label) ?? 0).solid,
          opacity,
        }}
      />
    ));

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(t)}
        aria-valuetext={`${fmtTime(t)} of ${fmtTime(d)}`}
        className="group relative h-9 cursor-pointer touch-none rounded-md"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          p.seek(ratioAt(e.clientX) * d, p.playing);
        }}
        onPointerMove={(e) => {
          const r = ratioAt(e.clientX);
          setHover(r);
          if (dragging.current) p.seek(r * d, p.playing);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => !dragging.current && setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") (p.skip(-5), e.preventDefault(), e.stopPropagation());
          if (e.key === "ArrowRight") (p.skip(5), e.preventDefault(), e.stopPropagation());
          if (e.key === "Home") (p.seek(0, p.playing), e.preventDefault());
          if (e.key === "End") (p.seek(d - 1, p.playing), e.preventDefault());
        }}
      >
        {/* topic ticks */}
        {topics.map((tp) => {
          const s = segStart.get(tp.start_segment_id) ?? tp.grounding?.start ?? null;
          if (s == null) return null;
          return (
            <span
              key={tp.title}
              className="pointer-events-none absolute top-0 h-[7px] w-[2px] -translate-x-1/2 rounded-full bg-line-strong"
              style={{ left: `${(s / d) * 100}%` }}
            />
          );
        })}
        {/* speaker strip: dim = upcoming, bright = played */}
        <div className="absolute inset-x-0 top-[13px] h-[10px] overflow-hidden rounded-[3px] bg-surface-3">
          {blocks(0.32)}
          <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
            <div className="absolute inset-y-0 left-0" style={{ width: `${(100 / Math.max(pct, 0.0001)) * 100}%` }}>
              {blocks(1)}
            </div>
          </div>
        </div>
        {/* playhead */}
        <span className="pointer-events-none absolute top-[7px] h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-fg shadow-sm transition-[left] duration-75" style={{ left: `${pct}%` }} />
        {/* hover tooltip */}
        {hover != null && (
          <span
            className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg dark:bg-slate-700"
            style={{ left: `${hover * 100}%` }}
          >
            <span className="font-mono">{fmtTime(hover * d)}</span>
            {hoverSeg && <span className="opacity-80"> · {hoverSeg.speaker}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
