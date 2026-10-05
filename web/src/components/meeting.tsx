import clsx from "clsx";
import { AlertTriangle, BadgeCheck, Play, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { fmtTime, initials } from "../lib/format";
import { speakerColor } from "../lib/speakers";
import { usePlayer } from "../player/PlayerContext";
import { Tooltip } from "./overlays";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-teal-400 to-teal-700 shadow-sm ring-1 ring-black/5">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="white" aria-hidden>
          <rect x="3" y="9" width="2.4" height="6" rx="1.2" />
          <rect x="7.2" y="5.5" width="2.4" height="13" rx="1.2" />
          <rect x="11.4" y="7.5" width="2.4" height="9" rx="1.2" />
          <rect x="15.6" y="4" width="2.4" height="16" rx="1.2" />
          <rect x="19.8" y="9.5" width="2.4" height="5" rx="1.2" opacity=".75" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight text-fg">
          Meeting<span className="text-accent-text">Mind</span>
        </span>
      )}
    </span>
  );
}

export function SpeakerAvatar({ name, index, size = "md", ring }: { name: string; index: number; size?: "xs" | "sm" | "md" | "lg"; ring?: boolean }) {
  const c = speakerColor(index);
  const dims = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm" }[size];
  return (
    <span
      className={clsx("grid shrink-0 place-items-center rounded-full font-semibold", dims, ring && "ring-2 ring-surface")}
      style={{ background: c.soft, color: c.text, boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${c.solid} 45%, transparent)` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function SpeakerName({ name, index, className }: { name: string; index: number; className?: string }) {
  return (
    <span className={clsx("font-semibold", className)} style={{ color: speakerColor(index).text }}>
      {name}
    </span>
  );
}

/** Clickable "▶ 02:14" chip that jumps the shared player. */
export function TimestampChip({ seconds, label, className, play = true }: { seconds: number | null | undefined; label?: string; className?: string; play?: boolean }) {
  const player = usePlayer();
  if (seconds == null || Number.isNaN(seconds)) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        player.seek(seconds, play);
      }}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-accent-text transition-colors hover:bg-accent hover:text-accent-fg",
        className,
      )}
      title={`Play from ${fmtTime(seconds)}`}
      aria-label={`Play from ${fmtTime(seconds)}`}
    >
      <Play className="size-3 fill-current" aria-hidden />
      {label ?? fmtTime(seconds)}
    </button>
  );
}

/** Verified / needs-review badge with the evidence quote on hover. */
export function EvidenceBadge({ grounded, quote, manual, compact }: { grounded: boolean; quote?: string; manual?: boolean; compact?: boolean }) {
  if (manual) {
    return (
      <Tooltip content="Added by a reviewer - not extracted from the recording.">
        <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info-text">
          <UserPlus className="size-3.5" />
          {!compact && "Manual"}
        </span>
      </Tooltip>
    );
  }
  const tip: ReactNode = grounded ? (
    <>
      <span className="font-semibold">Verified in transcript</span>
      {quote && <span className="mt-1 block italic opacity-90">“{quote}”</span>}
    </>
  ) : (
    <>
      <span className="font-semibold">Needs review</span>
      <span className="mt-1 block opacity-90">The cited evidence could not be matched to the transcript.</span>
    </>
  );
  return (
    <Tooltip content={tip}>
      <span
        tabIndex={0}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          grounded ? "bg-success-soft text-success-text" : "bg-warning-soft text-warning-text",
        )}
      >
        {grounded ? <BadgeCheck className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
        {!compact && (grounded ? "Verified" : "Review")}
      </span>
    </Tooltip>
  );
}

export function PriorityPill({ priority }: { priority: string }) {
  const p = priority.toLowerCase();
  const cls =
    p === "high" ? "bg-danger-soft text-danger-text" : p === "low" ? "bg-surface-2 text-muted" : "bg-warning-soft text-warning-text";
  const dot = p === "high" ? "bg-danger" : p === "low" ? "bg-subtle" : "bg-warning";
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize", cls)}>
      <span className={clsx("size-1.5 rounded-full", dot)} />
      {p}
    </span>
  );
}

/** Overlapping avatar stack for the meeting library. */
export function AvatarStack({ names, max = 5 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="flex -space-x-2">
      {shown.map((n, i) => (
        <span key={n + i} title={n}>
          <SpeakerAvatar name={n} index={i} size="sm" ring />
        </span>
      ))}
      {names.length > max && (
        <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{names.length - max}
        </span>
      )}
    </span>
  );
}
