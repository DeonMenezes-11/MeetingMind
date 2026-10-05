import { createContext, useContext } from "react";
import type { RunPayload, Segment } from "../../types";

export interface RunCtx {
  run: RunPayload;
  setRun: (r: RunPayload | ((prev: RunPayload) => RunPayload)) => void;
  reload: () => void;
  /** speaker display name or label -> palette index */
  speakerIdx: Map<string, number>;
  segById: Map<string, Segment>;
  segStart: Map<string, number>;
  /** segment id -> what cites it (decision / action / question / risk) */
  citedBy: Map<string, { kind: "decision" | "action" | "question" | "risk"; text: string }[]>;
}

export const RunContext = createContext<RunCtx | null>(null);

export function useRun(): RunCtx {
  const c = useContext(RunContext);
  if (!c) throw new Error("useRun outside RunContext");
  return c;
}

export function buildCitations(run: RunPayload) {
  const m = new Map<string, { kind: "decision" | "action" | "question" | "risk"; text: string }[]>();
  const add = (ids: string[] | undefined, kind: "decision" | "action" | "question" | "risk", text: string) => {
    for (const id of ids ?? []) {
      const arr = m.get(id) ?? [];
      arr.push({ kind, text });
      m.set(id, arr);
    }
  };
  for (const d of run.minutes.decisions ?? []) add(d.grounding?.valid_ids, "decision", d.text);
  for (const a of run.minutes.action_items ?? []) add(a.grounding?.valid_ids, "action", `${a.owner}: ${a.task}`);
  for (const q of run.minutes.open_questions ?? []) add(q.grounding?.valid_ids, "question", q.text);
  for (const r of run.minutes.risks ?? []) add(r.grounding?.valid_ids, "risk", r.text);
  return m;
}
