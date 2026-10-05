import type {
  ActionRow,
  AskResult,
  EmailsResult,
  Health,
  JobSnapshot,
  RunCard,
  RunPayload,
  ScorecardRow,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("Can't reach the MeetingMind server. Is `python3 server.py` running?", 0);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = String(body.error);
    } catch {
      /* not JSON */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/api/health"),
  runs: () => request<{ runs: RunCard[]; active_jobs: JobSnapshot[] }>("/api/runs"),
  run: (id: string) => request<RunPayload>(`/api/runs/${encodeURIComponent(id)}`),
  renameSpeakers: (id: string, overrides: Record<string, string>) =>
    request<RunPayload>(`/api/runs/${id}/speakers`, json("PUT", { overrides })),
  regenerate: (id: string) => request<{ job_id: string; run_id: string }>(`/api/runs/${id}/regenerate`, json("POST")),
  saveActions: (id: string, rows: Partial<ActionRow>[]) =>
    request<{ actions: ActionRow[]; actions_edited: boolean }>(`/api/runs/${id}/actions`, json("PUT", { rows })),
  resetActions: (id: string) =>
    request<{ actions: ActionRow[]; actions_edited: boolean }>(`/api/runs/${id}/actions`, json("DELETE")),
  ask: (id: string, question: string) => request<AskResult>(`/api/runs/${id}/ask`, json("POST", { question })),
  emails: (id: string, body: { tone: string; mode: string; sender: string }) =>
    request<EmailsResult>(`/api/runs/${id}/emails`, json("POST", body)),
  exportUrl: (id: string, kind: "md" | "json" | "csv" | "srt") => `/api/runs/${id}/export/${kind}`,
  exportText: async (id: string, kind: "md" | "json" | "csv" | "srt") => {
    const res = await fetch(`/api/runs/${id}/export/${kind}`);
    if (!res.ok) throw new ApiError("Export failed", res.status);
    return res.text();
  },
  sample: () => request<{ job_id: string | null; run_id: string }>("/api/jobs/sample", json("POST")),
  upload: (file: File, participants: string, consent: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("participants", participants);
    fd.append("consent", consent ? "true" : "false");
    return request<{ job_id: string; run_id: string }>("/api/jobs", { method: "POST", body: fd });
  },
  job: (id: string) => request<JobSnapshot>(`/api/jobs/${id}`),
  jobEventsUrl: (id: string) => `/api/jobs/${id}/events`,
  scorecard: () => request<ScorecardRow[]>("/api/scorecard"),
};
