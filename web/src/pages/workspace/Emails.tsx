import clsx from "clsx";
import { AlertTriangle, Copy, Download, FileText, Mail, Send, Sparkles, Users, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { SpeakerAvatar } from "../../components/meeting";
import { useToast } from "../../components/overlays";
import { Button, Card, EmptyState, SegmentedControl, Skeleton } from "../../components/ui";
import { fmtCost, prettyRole } from "../../lib/format";
import { copyText, downloadText, useLocalStorage } from "../../lib/hooks";
import type { EmailsResult } from "../../types";
import { Banner } from "./Workspace";
import { useRun } from "./RunContext";

type Tone = "formal" | "friendly";
type Mode = "template" | "ai";

export default function Emails() {
  const { run, speakerIdx } = useRun();
  const toast = useToast();
  const organiser = run.speakers.find((s) => /manager|lead|organi[sz]er|chair/i.test(s.role)) ?? run.speakers[0];
  const [tone, setTone] = useLocalStorage<Tone>("mm-email-tone", "formal");
  const [mode, setMode] = useState<Mode>("template");
  const [sender, setSender] = useState(organiser ? `${organiser.name}${organiser.role ? ` (${prettyRole(organiser.role)})` : ""}` : "Meeting organiser");
  const [data, setData] = useState<EmailsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [aiStale, setAiStale] = useState(true);

  const load = useCallback(
    async (m: Mode) => {
      setLoading(true);
      try {
        const res = await api.emails(run.run_id, { tone, mode: m, sender });
        setData(res);
        if (m === "ai") setAiStale(false);
        setSelected((i) => Math.min(i, res.emails.length - 1));
      } catch (e) {
        toast.error("Couldn't draft the emails", (e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [run.run_id, tone, sender, toast],
  );

  // template drafts are instant and free - refresh them on every change
  useEffect(() => {
    if (mode !== "template") return;
    const t = setTimeout(() => load("template"), 200);
    return () => clearTimeout(t);
  }, [mode, tone, sender, run.actions, load]);

  useEffect(() => {
    if (mode === "ai") setAiStale(true);
  }, [tone, sender, run.actions, mode]);

  const emails = useMemo(() => {
    const list = data?.emails ?? [];
    return [...list.filter((e) => e.kind === "recap"), ...list.filter((e) => e.kind !== "recap")];
  }, [data]);
  const email = emails[Math.min(selected, emails.length - 1)];
  const all = emails.map((e) => `To: ${e.to}\nSubject: ${e.subject}\n\n${e.body}`).join("\n\n" + "-".repeat(60) + "\n\n");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Follow-up emails</h2>
        <p className="mt-0.5 text-[13.5px] text-subtle">
          One email per owner plus a team recap, built from your reviewed action items. Nothing is sent automatically.
        </p>
      </div>

      {/* controls */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-subtle">Tone</div>
          <SegmentedControl label="Tone" value={tone} onChange={setTone} options={[{ value: "formal", label: "Formal" }, { value: "friendly", label: "Friendly" }]} />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-subtle">Written by</div>
          <SegmentedControl
            label="Drafting mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (m === "template") setAiStale(true);
            }}
            options={[
              { value: "template", label: "Template", icon: <FileText className="size-3.5" /> },
              { value: "ai", label: "AI", icon: <Sparkles className="size-3.5" /> },
            ]}
          />
        </div>
        <label className="min-w-52 flex-1">
          <span className="mb-1.5 block text-xs font-medium text-subtle">Sign as</span>
          <input className="field !py-1.5" value={sender} maxLength={60} onChange={(e) => setSender(e.target.value)} />
        </label>
        {mode === "ai" && (
          <Button variant="primary" icon={<Wand2 className="size-4" />} loading={loading} onClick={() => load("ai")}>
            {aiStale ? "Draft with AI" : "Redraft"}
          </Button>
        )}
      </Card>

      {data && data.excluded.length > 0 && (
        <Banner tone="warning" icon={<AlertTriangle className="size-4" />} action={<Link to={`/m/${run.run_id}/actions`}><Button size="sm">Review items</Button></Link>}>
          {data.excluded.length === 1 ? "1 action item is" : `${data.excluded.length} action items are`} left out (switched off or not verified):{" "}
          {data.excluded.map((r) => `${r.owner}: ${r.task}`).join("; ")}
        </Banner>
      )}

      {mode === "ai" && aiStale && !loading ? (
        <Card>
          <EmptyState
            icon={<Sparkles className="size-6" />}
            title="Let the AI write the emails"
            action={<Button variant="primary" icon={<Wand2 className="size-4" />} onClick={() => load("ai")}>Draft with AI</Button>}
          >
            One structured call writes every email in your chosen tone, using only the reviewed tasks, owners and dates. Costs well under a cent.
          </EmptyState>
        </Card>
      ) : !data || (loading && !emails.length) ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : emails.length === 0 ? (
        <Card>
          <EmptyState icon={<Mail className="size-6" />} title="No emails to draft">Switch on at least one action item.</EmptyState>
        </Card>
      ) : (
        <div className={clsx("grid grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]", loading && "opacity-60 transition-opacity")}>
          {/* list */}
          <Card className="h-fit p-1.5">
            <ul role="listbox" aria-label="Emails">
              {emails.map((e, i) => (
                <li key={e.to + i}>
                  <button
                    role="option"
                    aria-selected={i === selected}
                    onClick={() => setSelected(i)}
                    className={clsx("flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors", i === selected ? "bg-accent-soft" : "hover:bg-surface-2")}
                  >
                    {e.kind === "recap" ? (
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted"><Users className="size-4" /></span>
                    ) : (
                      <SpeakerAvatar name={e.to} index={speakerIdx.get(e.to) ?? 5} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-fg">{e.kind === "recap" ? "Whole team" : e.to}</span>
                        {e.kind === "recap" && <span className="rounded bg-surface-3 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">recap</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">{e.subject}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex gap-1 border-t border-line p-1.5 pt-2.5">
              <Button size="sm" variant="ghost" className="flex-1" icon={<Copy className="size-3.5" />} onClick={async () => (await copyText(all)) && toast.success(`Copied ${emails.length} emails`)}>
                Copy all
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" icon={<Download className="size-3.5" />} onClick={() => downloadText(`${run.run_id}_emails.txt`, all)}>
                Download
              </Button>
            </div>
          </Card>

          {/* preview */}
          {email && (
            <Card className="overflow-hidden">
              <div className="border-b border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5 text-sm">
                    <div className="flex gap-2"><span className="w-14 shrink-0 text-subtle">To</span><span className="font-medium text-fg">{email.kind === "recap" ? "Everyone who attended" : email.to}</span></div>
                    <div className="flex gap-2"><span className="w-14 shrink-0 text-subtle">From</span><span className="text-muted">{sender}</span></div>
                    <div className="flex gap-2"><span className="w-14 shrink-0 text-subtle">Subject</span><span className="font-semibold text-fg">{email.subject}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" icon={<Copy className="size-3.5" />} onClick={async () => (await copyText(`Subject: ${email.subject}\n\n${email.body}`)) && toast.success("Email copied")}>
                      Copy
                    </Button>
                    <a href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>
                      <Button size="sm" variant="primary" icon={<Send className="size-3.5" />}>Open in mail app</Button>
                    </a>
                  </div>
                </div>
              </div>
              <div className="bg-surface-2/40 p-5 sm:p-7">
                <div className="mx-auto max-w-2xl whitespace-pre-wrap rounded-xl border border-line bg-surface p-5 text-[14.5px] leading-[1.7] text-fg shadow-sm sm:p-7">
                  {email.body}
                </div>
                <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between text-xs text-subtle">
                  <span>{data.mode === "ai" ? <><Sparkles className="mr-1 inline size-3.5" />Drafted by AI · {fmtCost(data.cost)}</> : <><FileText className="mr-1 inline size-3.5" />Template draft · free</>}</span>
                  <span>{email.body.split(/\s+/).filter(Boolean).length} words</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

