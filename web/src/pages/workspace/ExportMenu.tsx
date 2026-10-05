import { ChevronDown, Copy, Download, Eye, FileJson, FileSpreadsheet, FileText, Link2, Subtitles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../../api";
import { MenuItem, Modal, Popover, useToast } from "../../components/overlays";
import { Button, Skeleton } from "../../components/ui";
import { copyText } from "../../lib/hooks";
import { useRun } from "./RunContext";

export function ExportMenu() {
  const { run } = useRun();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  const [md, setMd] = useState<string | null>(null);

  const openPreview = async () => {
    setPreview(true);
    try {
      setMd(await api.exportText(run.run_id, "md"));
    } catch (e) {
      toast.error("Couldn't load the minutes", (e as Error).message);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={openPreview}>
        Preview minutes
      </Button>
      <Popover
        align="end"
        trigger={({ toggle, ref, open }) => (
          <Button ref={ref} size="sm" onClick={toggle} aria-expanded={open} aria-haspopup="menu" icon={<Download className="size-4" />} iconRight={<ChevronDown className="size-3.5 text-subtle" />}>
            Export
          </Button>
        )}
      >
        {(close) => (
          <div role="menu" className="w-64">
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Download</div>
            <MenuItem icon={<FileText className="size-4" />} hint=".md" href={api.exportUrl(run.run_id, "md")} download onClick={close}>Minutes</MenuItem>
            <MenuItem icon={<FileJson className="size-4" />} hint=".json" href={api.exportUrl(run.run_id, "json")} download onClick={close}>Minutes (structured)</MenuItem>
            <MenuItem icon={<FileSpreadsheet className="size-4" />} hint=".csv" href={api.exportUrl(run.run_id, "csv")} download onClick={close}>Action items</MenuItem>
            <MenuItem icon={<Subtitles className="size-4" />} hint=".srt" href={api.exportUrl(run.run_id, "srt")} download onClick={close}>Transcript subtitles</MenuItem>
            <div className="my-1.5 h-px bg-line" />
            <MenuItem
              icon={<Link2 className="size-4" />}
              onClick={async () => {
                close();
                if (await copyText(window.location.href)) toast.success("Link copied", "Anyone with access to this server can open it.");
              }}
            >
              Copy link to this view
            </MenuItem>
          </div>
        )}
      </Popover>

      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Minutes preview"
        description="This is exactly what the Markdown export contains."
        size="lg"
        footer={
          <>
            <Button variant="ghost" icon={<Copy className="size-4" />} onClick={async () => md && (await copyText(md)) && toast.success("Minutes copied as Markdown")}>
              Copy Markdown
            </Button>
            <a href={api.exportUrl(run.run_id, "md")} download>
              <Button variant="primary" icon={<Download className="size-4" />}>Download .md</Button>
            </a>
          </>
        }
      >
        {md ? <Markdown text={md} /> : <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-32 w-full" /></div>}
      </Modal>
    </div>
  );
}

/** Small renderer for the minutes Markdown (headings, lists, tables, bold/italic). */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("# ")) out.push(<h1 key={i} className="mb-3 text-xl font-semibold tracking-tight">{inline(l.slice(2))}</h1>);
    else if (l.startsWith("## ")) out.push(<h2 key={i} className="mb-2 mt-6 border-b border-line pb-1.5 text-[15px] font-semibold">{inline(l.slice(3))}</h2>);
    else if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2"><tr>{rows[0]?.map((c, k) => <th key={k} className="px-3 py-2 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, k) => <tr key={k} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    } else if (l.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(<ul key={`u${i}`} className="my-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg marker:text-subtle">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
      continue;
    } else if (l.trim()) out.push(<p key={i} className="my-1.5 text-[14px] leading-relaxed text-muted">{inline(l)}</p>);
    i++;
  }
  return <article>{out}</article>;
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((p, k) =>
    p.startsWith("**") ? <strong key={k} className="font-semibold text-fg">{p.slice(2, -2)}</strong> : p.startsWith("_") && p.endsWith("_") ? <em key={k} className="text-subtle">{p.slice(1, -1)}</em> : p,
  );
}
