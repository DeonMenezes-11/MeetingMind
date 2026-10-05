import type { Speaker } from "../types";

export const PALETTE_SIZE = 6;

export interface SpeakerColor {
  solid: string;
  soft: string;
  text: string;
}

export function speakerColor(index: number): SpeakerColor {
  const i = ((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return { solid: `var(--spk-${i})`, soft: `var(--spk-${i}-soft)`, text: `var(--spk-${i}-text)` };
}

/** Lookup by display name or diarization label -> palette index (stable per meeting). */
export function speakerIndexMap(speakers: Speaker[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of speakers) {
    m.set(s.name, s.index);
    m.set(s.label, s.index);
  }
  return m;
}

/** Resolved hex for charts (recharts needs real colours, not CSS vars). */
export function speakerHex(index: number): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--spk-${index % PALETTE_SIZE}`).trim();
  return v || "#6366f1";
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
