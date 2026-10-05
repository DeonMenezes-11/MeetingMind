/** Seconds -> "mm:ss" (or "h:mm:ss"). */
export function fmtTime(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor((seconds ?? 0) + 1e-6));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds -> "5 min 19 s" style. */
export function fmtDuration(seconds: number | null | undefined): string {
  const total = Math.round(seconds ?? 0);
  if (total < 60) return `${total} s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h} h ${m} min`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function fmtCost(usd: number | null | undefined): string {
  const v = usd ?? 0;
  if (v === 0) return "$0";
  if (v < 0.0001) return "<$0.0001";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  return `${((v ?? 0) * 100).toFixed(digits)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Parse "mm:ss" / "h:mm:ss" -> seconds (NaN if invalid). */
export function parseTs(ts: string): number {
  const p = ts.split(":").map(Number);
  if (p.some(Number.isNaN)) return NaN;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

const ACRONYMS = /^(qa|ui|ux|api|cto|ceo|cfo|pm|hr|it|ml|ai|devops)$/i;
/** "qa lead" -> "QA Lead", "back end developer" -> "Back End Developer". */
export function prettyRole(role: string): string {
  return role
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
