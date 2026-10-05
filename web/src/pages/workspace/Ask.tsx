import clsx from "clsx";
import { ArrowUp, ChevronDown, Library, MessagesSquare, RotateCcw, SearchX, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { Logo, SpeakerName, TimestampChip } from "../../components/meeting";
import { useToast } from "../../components/overlays";
import { Button, Card } from "../../components/ui";
import { fmtCost, parseTs } from "../../lib/format";
import { useLocalStorage } from "../../lib/hooks";
import type { AskResult, Hit } from "../../types";
import { useRun } from "./RunContext";

interface Turn {
  id: string;
  question: string;
  result?: AskResult;
  error?: string;
}

export default function Ask() {
  const { run } = useRun();
  const toast = useToast();
  const [turns, setTurns] = useLocalStorage<Turn[]>(`mm-chat-${run.run_id}`, []);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener("mm:focus-search", focus);
    return () => window.removeEventListener("mm:focus-search", focus);
  }, []);

  useEffect(() => {
    if (!turns.length) return;
    const t = setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }), 30);
    return () => clearTimeout(t);
  }, [turns.length, pending]);

  useEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [draft]);

  const suggestions = useMemo(() => {
    const owner = run.actions[0]?.owner;
    const s = [
      "What were the main decisions?",
      owner ? `What is ${owner} responsible for, and by when?` : "Who is responsible for what?",
      "What risks were raised?",
      "What questions are still open?",
    ];
    return s;
  }, [run.actions]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    const id = Math.random().toString(36).slice(2);
    setTurns((t) => [...t, { id, question }]);
    setDraft("");
    setPending(true);
    try {
      const result = await api.ask(run.run_id, question);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, result } : x)));
    } catch (e) {
      const msg = (e as Error).message;
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: msg } : x)));
      toast.error("Couldn't answer that", msg);
    } finally {
      setPending(false);
      input.current?.focus();
    }
  };

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Ask the meeting</h2>
          <p className="mt-0.5 text-[13.5px] text-subtle">
            Answers come only from this meeting's transcript and cite timestamps you can play. Off-topic questions are refused.
          </p>
        </div>
        {!empty && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setTurns([])}>
            Clear
          </Button>
        )}
      </div>

      {!run.has_index ? (
        <Card className="p-6 text-sm text-muted">This meeting has no Q&amp;A index yet - regenerate the minutes to build one.</Card>
      ) : (
        <>
          {empty ? (
            <Card className="relative overflow-hidden p-8 text-center">
              <div className="hero-bg absolute inset-0" aria-hidden />
              <div className="relative">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                  <MessagesSquare className="size-7" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">What would you like to know?</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-subtle">
                  Ask about decisions, deadlines, who said what, or why something was decided.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-fg shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:text-accent-text"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => ask("What is the capital of Australia?")}
                    className="rounded-full border border-dashed border-line-strong px-3.5 py-2 text-[13px] text-subtle transition-colors hover:border-warning hover:text-warning-text"
                    title="Shows how off-topic questions are refused"
                  >
                    Try an off-topic question
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {turns.map((t) => (
                <div key={t.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] text-accent-fg shadow-sm">{t.question}</div>
                  </div>
                  <div className="flex gap-3">
                    <span className="mt-0.5 shrink-0"><Logo compact /></span>
                    <div className="min-w-0 flex-1">
                      {t.result ? <Answer r={t.result} /> : t.error ? <div className="rounded-2xl rounded-tl-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-text">{t.error}</div> : <Thinking />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={bottom} />

          {/* composer */}
          <div className="sticky bottom-[68px] z-10 -mx-2 mt-4 bg-gradient-to-t from-bg via-bg/95 to-transparent px-2 pb-4 pt-6">
            <form
              onSubmit={(e) => (e.preventDefault(), ask(draft))}
              className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-lg focus-within:border-accent focus-within:shadow-[var(--ring)]"
            >
              <label className="sr-only" htmlFor="ask-input">Ask a question about this meeting</label>
              <textarea
                id="ask-input"
                ref={input}
                rows={1}
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), ask(draft));
                }}
                placeholder="Ask anything about this meeting…"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-fg outline-none placeholder:text-subtle focus:shadow-none focus-visible:shadow-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || pending}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition-all hover:bg-accent-strong disabled:bg-surface-3 disabled:text-subtle"
                aria-label="Send question"
              >
                <ArrowUp className="size-5" />
              </button>
            </form>
            <p className="mt-1.5 text-center text-[11px] text-subtle">Enter to send · Shift+Enter for a new line · answers can be wrong - check the cited moments</p>
          </div>
        </>
      )}
    </div>
  );
}

function Thinking() {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-sm text-subtle">
      <span className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      Searching the transcript…
    </div>
  );
}

function Answer({ r }: { r: AskResult }) {
  const [open, setOpen] = useState(false);
  if (!r.found) {
    return (
      <div className="rounded-2xl rounded-tl-md border border-dashed border-line-strong bg-surface-2/60 px-4 py-3.5">
        <div className="flex items-center gap-2 text-sm font-medium text-fg">
          <SearchX className="size-4 text-warning" /> Not discussed in this meeting
        </div>
        <p className="mt-1 text-[13px] text-subtle">I only answer from the transcript, and nothing in it covers that question.</p>
        {r.hits.length > 0 && <Sources hits={r.hits} open={open} setOpen={setOpen} label="Closest passages" />}
      </div>
    );
  }
  return (
    <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3.5 shadow-sm">
      <p className="text-[15px] leading-relaxed text-fg">{withCitations(r.answer)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
        <Sparkles className="size-3.5" />
        Grounded in {r.hits.length} passages
        {r.cost > 0 && <span>· {fmtCost(r.cost)}</span>}
      </div>
      <Sources hits={r.hits} open={open} setOpen={setOpen} label="Sources" />
    </div>
  );
}

function withCitations(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<TimestampChip key={k++} seconds={parseTs(m[1])} className="mx-0.5 align-[1px]" />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Sources({ hits, open, setOpen, label }: { hits: Hit[]; open: boolean; setOpen: (o: boolean) => void; label: string }) {
  const { speakerIdx } = useRun();
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg" aria-expanded={open}>
        <Library className="size-3.5" /> {label} ({hits.length})
        <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-2.5 space-y-2">
          {hits.map((h) => (
            <li key={h.window} className="rounded-xl bg-surface-2/70 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <TimestampChip seconds={h.start} />
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, Math.min(100, h.score * 100))}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-subtle">similarity {h.score.toFixed(2)}</span>
                </div>
              </div>
              <div className="space-y-1">
                {h.text.split("\n").map((line, i) => {
                  const m = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?) ([^\]]+)\] (.*)$/);
                  if (!m) return <p key={i} className="text-[13px] text-muted">{line}</p>;
                  return (
                    <p key={i} className="text-[13px] leading-snug text-muted">
                      <SpeakerName name={m[2]} index={speakerIdx.get(m[2]) ?? 0} className="text-[12.5px]" />{" "}
                      <span className="font-mono text-[11px] text-subtle">{m[1]}</span> {m[3]}
                    </p>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
