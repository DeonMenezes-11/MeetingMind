import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  CloudOff,
  Download,
  LayoutList,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { EvidenceBadge, PriorityPill, SpeakerAvatar, TimestampChip } from "../../components/meeting";
import { Modal, Tooltip, useToast } from "../../components/overlays";
import { Badge, Button, Card, EmptyState, SegmentedControl, Switch } from "../../components/ui";
import type { ActionRow, Priority } from "../../types";
import { Banner } from "./Workspace";
import { useRun } from "./RunContext";

type SaveState = "idle" | "saving" | "saved" | "error";
const newId = () => "m" + Math.random().toString(36).slice(2, 10);

export default function Actions() {
  const { run, setRun, speakerIdx } = useRun();
  const toast = useToast();
  const [rows, setRows] = useState<ActionRow[]>(run.actions);
  const [save, setSave] = useState<SaveState>("idle");
  const [owner, setOwner] = useState<string>("all");
  const [view, setView] = useState<"list" | "people">("list");
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef(rows);
  latest.current = rows;

  const persist = useCallback(async () => {
    timer.current = null;
    setSave("saving");
    try {
      const res = await api.saveActions(
        run.run_id,
        latest.current.map(({ id, owner, task, due, priority, include }) => ({ id, owner, task, due, priority, include })),
      );
      setRun((prev) => ({ ...prev, actions: res.actions, actions_edited: true }));
      setSave("saved");
    } catch (e) {
      setSave("error");
      toast.error("Changes not saved", (e as Error).message);
    }
  }, [run.run_id, setRun, toast]);

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setSave("saving");
    timer.current = window.setTimeout(persist, 650);
  }, [persist]);

  useEffect(() => () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      void persist();
    }
  }, [persist]);

  const update = (id: string, patch: Partial<ActionRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    schedule();
  };
  const remove = (id: string) => {
    const gone = rows.find((r) => r.id === id);
    setRows((rs) => rs.filter((r) => r.id !== id));
    schedule();
    if (gone) toast.info("Action item removed", gone.task.slice(0, 80));
  };
  const add = () => {
    const id = newId();
    const row: ActionRow = {
      id, owner: owner !== "all" ? owner : run.speakers[0]?.name ?? "Unassigned", task: "", due: "Not specified", priority: "medium",
      grounded: false, include: true, evidence: "added by reviewer", start: null, score: 0, source: "manual", quote: "", segment_ids: [], timestamp: "",
    };
    setRows((rs) => [row, ...rs]);
    setFocusId(id);
  };
  const reset = async () => {
    setConfirmReset(false);
    try {
      const res = await api.resetActions(run.run_id);
      setRows(res.actions);
      setRun((prev) => ({ ...prev, actions: res.actions, actions_edited: false }));
      setSave("idle");
      toast.success("Restored the AI-extracted action items");
    } catch (e) {
      toast.error("Couldn't reset", (e as Error).message);
    }
  };

  const owners = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.owner, (m.get(r.owner) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const ownerOptions = useMemo(() => Array.from(new Set([...run.speakers.map((s) => s.name), ...rows.map((r) => r.owner), "Unassigned"])), [run.speakers, rows]);
  const shown = owner === "all" ? rows : rows.filter((r) => r.owner === owner);
  const review = rows.filter((r) => r.source === "ai" && !r.grounded).length;
  const included = rows.filter((r) => r.include && r.task.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Action items</h2>
          <p className="mt-0.5 text-[13.5px] text-subtle">
            Review what was agreed. Edits save automatically and flow into the follow-up emails and the CSV export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveIndicator state={save} edited={run.actions_edited} />
          {run.actions_edited && (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmReset(true)}>
              Reset
            </Button>
          )}
          <a href={api.exportUrl(run.run_id, "csv")} download>
            <Button size="sm" icon={<Download className="size-3.5" />}>CSV</Button>
          </a>
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={add}>
            Add item
          </Button>
        </div>
      </div>

      {review > 0 && (
        <Banner tone="warning" icon={<AlertTriangle className="size-4" />}>
          {review === 1 ? "1 item needs" : `${review} items need`} review - the cited evidence couldn't be matched to the transcript, so
          {review === 1 ? " it is" : " they are"} left out of emails unless you switch “Email” on.
        </Banner>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by owner">
          <FilterChip active={owner === "all"} onClick={() => setOwner("all")}>All <span className="opacity-60">{rows.length}</span></FilterChip>
          {owners.map(([name, n]) => (
            <FilterChip key={name} active={owner === name} onClick={() => setOwner(name)}>
              <SpeakerAvatar name={name} index={speakerIdx.get(name) ?? 5} size="xs" />
              {name} <span className="opacity-60">{n}</span>
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-subtle sm:inline">
            <Mail className="mr-1 inline size-3.5" />{included} of {rows.length} go into emails
          </span>
          <SegmentedControl
            label="Layout"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "List", icon: <LayoutList className="size-3.5" /> },
              { value: "people", label: "By person", icon: <Users className="size-3.5" /> },
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={<LayoutList className="size-6" />} title="No action items" action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={add}>Add one</Button>}>
            Nothing was assigned{owner !== "all" ? ` to ${owner}` : ""} in this meeting.
          </EmptyState>
        </Card>
      ) : view === "list" ? (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[64px_minmax(0,1fr)_150px_130px_112px_40px] gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-subtle md:grid">
            <Tooltip content="Include this item in the follow-up emails"><span>Email</span></Tooltip>
            <span>Task &amp; evidence</span>
            <span>Owner</span>
            <span>Due</span>
            <span>Priority</span>
            <span className="sr-only">Delete</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <RowEditor key={r.id} row={r} owners={ownerOptions} onChange={(p) => update(r.id, p)} onDelete={() => remove(r.id)} autoFocus={focusId === r.id} />
            ))}
          </ul>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {owners
            .filter(([name]) => owner === "all" || name === owner)
            .map(([name]) => (
              <Card key={name} className="p-4">
                <div className="mb-3 flex items-center gap-2.5">
                  <SpeakerAvatar name={name} index={speakerIdx.get(name) ?? 5} />
                  <div>
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-subtle">{rows.filter((r) => r.owner === name).length} tasks</div>
                  </div>
                </div>
                <ul className="space-y-2">
                  {rows.filter((r) => r.owner === name).map((r) => (
                    <li key={r.id} className={clsx("flex items-start gap-3 rounded-xl border border-line p-3", !r.include && "opacity-60")}>
                      <Switch checked={r.include} onChange={(v) => update(r.id, { include: v })} label="Include in emails" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-fg">{r.task || <span className="text-subtle">Untitled task</span>}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
                          <PriorityPill priority={r.priority} />
                          <span>due {r.due}</span>
                          <EvidenceBadge grounded={r.grounded} quote={r.quote} manual={r.source === "manual"} compact />
                          <TimestampChip seconds={r.start} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      )}

      <p className="text-center text-xs text-subtle">
        Ready to send?{" "}
        <Link to={`/m/${run.run_id}/emails`} className="font-medium text-accent-text hover:underline">Draft the follow-up emails →</Link>
      </p>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset action items?"
        description="Your edits, added items and deletions will be discarded and the AI-extracted list restored."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Keep my edits</Button>
            <Button variant="danger" onClick={reset}>Reset</Button>
          </>
        }
      >
        <p className="text-sm text-muted">This can't be undone.</p>
      </Modal>
    </div>
  );
}

function RowEditor({ row, owners, onChange, onDelete, autoFocus }: { row: ActionRow; owners: string[]; onChange: (p: Partial<ActionRow>) => void; onDelete: () => void; autoFocus: boolean }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ta.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const el = ta.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }
  }, [row.task]);
  const listId = `owners-${row.id}`;

  return (
    <li className={clsx("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 px-4 py-3.5 transition-colors md:grid-cols-[64px_minmax(0,1fr)_150px_130px_112px_40px] md:items-start", !row.include && "bg-surface-2/40")}>
      <div className="pt-1.5 md:row-auto">
        <Switch checked={row.include} onChange={(v) => onChange({ include: v })} label={row.include ? "Included in emails" : "Excluded from emails"} />
      </div>
      <div className="min-w-0">
        <label className="sr-only" htmlFor={`task-${row.id}`}>Task</label>
        <textarea
          id={`task-${row.id}`}
          ref={ta}
          rows={1}
          value={row.task}
          placeholder="Describe the task…"
          onChange={(e) => onChange({ task: e.target.value })}
          className={clsx("w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 text-[14.5px] font-medium leading-snug text-fg transition-colors hover:border-line focus:border-accent focus:bg-surface focus:shadow-[var(--ring)] focus:outline-none", !row.include && "text-muted")}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
          <EvidenceBadge grounded={row.grounded} quote={row.quote} manual={row.source === "manual"} />
          <TimestampChip seconds={row.start} />
          {row.segment_ids?.length ? <span className="font-mono text-[11px] text-subtle">{row.segment_ids.join(", ")}</span> : null}
          {row.edited && <Badge tone="neutral">edited</Badge>}
        </div>
      </div>
      <div className="col-span-2 grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] md:contents">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-subtle md:sr-only" htmlFor={`owner-${row.id}`}>Owner</label>
          <input id={`owner-${row.id}`} list={listId} className="field !py-1.5 text-sm" value={row.owner} onChange={(e) => onChange({ owner: e.target.value })} />
          <datalist id={listId}>{owners.map((o) => <option key={o} value={o} />)}</datalist>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-subtle md:sr-only" htmlFor={`due-${row.id}`}>Due</label>
          <input id={`due-${row.id}`} className="field !py-1.5 text-sm" value={row.due} onChange={(e) => onChange({ due: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-subtle md:sr-only" htmlFor={`prio-${row.id}`}>Priority</label>
          <select
            id={`prio-${row.id}`}
            className={clsx("field !py-1.5 text-sm font-medium capitalize", row.priority === "high" ? "text-danger-text" : row.priority === "low" ? "text-muted" : "text-warning-text")}
            value={row.priority}
            onChange={(e) => onChange({ priority: e.target.value as Priority })}
          >
            <option value="high">● High</option>
            <option value="medium">● Medium</option>
            <option value="low">● Low</option>
          </select>
        </div>
        <div className="flex items-end md:items-start md:pt-0.5">
          <button onClick={onDelete} className="grid size-9 place-items-center rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger-text" aria-label="Delete action item" title="Delete">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-transparent bg-fg text-bg" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function SaveIndicator({ state, edited }: { state: SaveState; edited: boolean }) {
  if (state === "saving")
    return <span className="inline-flex items-center gap-1.5 text-xs text-subtle"><Loader2 className="size-3.5 animate-spin" /> Saving…</span>;
  if (state === "error")
    return <span className="inline-flex items-center gap-1.5 text-xs text-danger-text"><CloudOff className="size-3.5" /> Not saved</span>;
  if (state === "saved" || edited)
    return <span className="inline-flex items-center gap-1.5 text-xs text-success-text"><Check className="size-3.5" /> All changes saved</span>;
  return <span className="text-xs text-subtle">AI-extracted · not edited</span>;
}
