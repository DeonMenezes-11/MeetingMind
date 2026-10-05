import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  Clock,
  CloudUpload,
  DollarSign,
  FileAudio,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/overlays";
import { Button, Card, ProgressBar } from "../components/ui";
import { fmtBytes, fmtDuration } from "../lib/format";
import { useAsync, useDocumentTitle } from "../lib/hooks";

const ACCEPT = [".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg", ".flac", ".aac", ".mpeg"];
const MAX_BYTES = 200 * 1024 * 1024;

export default function NewMeeting() {
  useDocumentTitle("New meeting");
  const nav = useNavigate();
  const toast = useToast();
  const health = useAsync(() => api.health(), []);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (!ACCEPT.includes(ext)) {
      setFileError(`"${f.name}" isn't an audio file we can read. Use MP3, WAV, M4A, MP4, WEBM or OGG.`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`That file is ${fmtBytes(f.size)} - the limit is 200 MB.`);
      return;
    }
    setFileError(null);
    setFile(f);
    setDuration(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => Number.isFinite(a.duration) && setDuration(a.duration);
    a.src = url;
  };

  const addPerson = (raw: string) => {
    const names = raw.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
    if (!names.length) return;
    setPeople((p) => [...p, ...names.filter((n) => !p.some((x) => x.toLowerCase() === n.toLowerCase()))].slice(0, 12));
    setDraft("");
  };
  const onPeopleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addPerson(draft);
    } else if (e.key === "Backspace" && !draft && people.length) {
      setPeople((p) => p.slice(0, -1));
    }
  };

  const keyOk = health.data?.key.configured ?? true;
  const checks = [
    { ok: !!file, label: "Recording selected" },
    { ok: consent, label: "Everyone agreed to be recorded" },
    { ok: keyOk, label: keyOk ? "AI service available" : "OpenAI key missing - add it to .env" },
  ];
  const ready = checks.every((c) => c.ok);
  const estSeconds = duration ? Math.max(20, duration * 0.8) : null;
  const estCost = duration ? (duration / 60) * 0.0125 + 0.002 : null;

  const submit = async () => {
    if (!file || !ready) return;
    setUploading(0);
    try {
      const res = await uploadWithProgress(file, [...people, ...(draft.trim() ? [draft.trim()] : [])].join(", "), consent, setUploading);
      toast.success("Upload complete", "Processing has started - you can follow it live.");
      nav(`/jobs/${res.job_id}`);
    } catch (e) {
      toast.error("Upload failed", (e as Error).message);
      setUploading(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-subtle hover:text-fg">
        <ArrowLeft className="size-4" /> Meetings
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">New meeting</h1>
      <p className="mt-1.5 text-[15px] text-muted">Upload a recording - MeetingMind does the rest. It takes a few minutes; you can leave the page while it works.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="divide-y divide-line">
          {/* step 1 */}
          <Step n={1} title="Recording" done={!!file}>
            {!file ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => input.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={clsx(
                  "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all",
                  drag ? "scale-[1.01] border-accent bg-accent-soft" : "border-line-strong hover:border-accent hover:bg-surface-2",
                )}
              >
                <span className={clsx("mb-4 grid size-14 place-items-center rounded-2xl transition-colors", drag ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent-text")}>
                  <CloudUpload className="size-7" />
                </span>
                <div className="text-[15px] font-semibold text-fg">{drag ? "Drop to upload" : "Drag a recording here, or click to browse"}</div>
                <div className="mt-1 text-[13px] text-subtle">MP3, WAV, M4A, MP4, WEBM or OGG · up to 200 MB</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <FileAudio className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{file.name}</div>
                    <div className="text-[13px] text-subtle">
                      {fmtBytes(file.size)}
                      {duration ? ` · ${fmtDuration(duration)}` : " · reading length…"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => input.current?.click()} disabled={uploading !== null}>
                    Replace
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => (setFile(null), setDuration(null))} disabled={uploading !== null} aria-label="Remove file" />
                </div>
                {preview && <audio className="mt-3 h-9 w-full" controls src={preview} preload="metadata" />}
              </div>
            )}
            {fileError && <p className="mt-3 text-sm text-danger-text" role="alert">{fileError}</p>}
            <input ref={input} type="file" accept={ACCEPT.join(",") + ",audio/*"} className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
          </Step>

          {/* step 2 */}
          <Step n={2} title="Who was in the meeting?" optional done={people.length > 0}>
            <p className="-mt-1 mb-3 text-[13px] text-subtle">Optional. Names you add here are used to spell speakers correctly (e.g. “Meera”, not “Mira”).</p>
            <div className="field flex min-h-11 flex-wrap items-center gap-1.5 !py-1.5 focus-within:border-accent focus-within:shadow-[var(--ring)]">
              {people.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 py-1 pl-2.5 pr-1 text-[13px] font-medium text-fg">
                  {p}
                  <button className="grid size-5 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg" onClick={() => setPeople((x) => x.filter((y) => y !== p))} aria-label={`Remove ${p}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-subtle focus-visible:shadow-none"
                placeholder={people.length ? "Add another…" : "Type a name and press Enter"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onPeopleKey}
                onBlur={() => addPerson(draft)}
                aria-label="Participant names"
              />
            </div>
          </Step>

          {/* step 3 */}
          <Step n={3} title="Consent" done={consent}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition-colors hover:bg-surface-2/60">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span className="text-sm text-muted">
                <span className="font-medium text-fg">Everyone in this recording agreed to it being recorded and processed.</span> The audio and
                transcript are sent to the OpenAI API for transcription and analysis.
              </span>
            </label>
          </Step>

          {/* submit */}
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <ul className="space-y-1.5" aria-label="Before you can start">
              {checks.map((c) => (
                <li key={c.label} className={clsx("flex items-center gap-2 text-[13px]", c.ok ? "text-success-text" : "text-subtle")}>
                  <span className={clsx("grid size-4 place-items-center rounded-full", c.ok ? "bg-success text-white" : "border border-line-strong")}>
                    {c.ok && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  {c.label}
                </li>
              ))}
            </ul>
            <div className="sm:w-56">
              {uploading !== null ? (
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-subtle">
                    <span>Uploading…</span>
                    <span>{Math.round(uploading * 100)}%</span>
                  </div>
                  <ProgressBar value={uploading} />
                </div>
              ) : (
                <Button variant="primary" size="lg" className="w-full" disabled={!ready} onClick={submit}>
                  Process meeting
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* side panel */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">What to expect</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-subtle"><Clock className="size-4" /></span>
                <div>
                  <dt className="text-xs text-subtle">Processing time</dt>
                  <dd className="font-medium">{estSeconds ? `about ${fmtDuration(Math.round(estSeconds / 10) * 10)}` : "≈ 0.8 × the recording length"}</dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-subtle"><DollarSign className="size-4" /></span>
                <div>
                  <dt className="text-xs text-subtle">Estimated API cost</dt>
                  <dd className="font-medium">{estCost ? `≈ $${estCost.toFixed(2)}` : "≈ $0.013 per minute"}</dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-subtle"><UserPlus className="size-4" /></span>
                <div>
                  <dt className="text-xs text-subtle">Best results</dt>
                  <dd className="font-medium">Ask people to introduce themselves</dd>
                </div>
              </div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-accent-text" /> Privacy</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
              <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-subtle" />Your API key stays on the server - it is never sent to the browser.</li>
              <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-subtle" />Voice clips used to tell speakers apart are deleted right after use.</li>
              <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-subtle" />Emails are drafts only - nothing is sent automatically.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, optional, done, children }: { n: number; title: string; optional?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-[15px] font-semibold">
        <span className={clsx("grid size-6 place-items-center rounded-full text-xs font-semibold transition-colors", done ? "bg-accent text-accent-fg" : "bg-surface-3 text-muted")}>
          {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        {title}
        {optional && <span className="text-xs font-normal text-subtle">optional</span>}
      </h2>
      {children}
    </section>
  );
}

function uploadWithProgress(file: File, participants: string, consent: boolean, onProgress: (p: number) => void) {
  return new Promise<{ job_id: string; run_id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("participants", participants);
    fd.append("consent", consent ? "true" : "false");
    xhr.open("POST", "/api/jobs");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string; job_id?: string; run_id?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.job_id) resolve(body as { job_id: string; run_id: string });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Can't reach the MeetingMind server."));
    xhr.send(fd);
  });
}

