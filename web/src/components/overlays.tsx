import clsx from "clsx";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../lib/hooks";
import { IconButton } from "./ui";

/* ------------------------------------------------------------------ Modal */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("input, textarea, button:not([data-close]), [tabindex]:not([tabindex='-1'])");
      (first ?? panel.current)?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const els = Array.from(panel.current.querySelectorAll<HTMLElement>("a, button, input, textarea, select, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx(
          "relative flex max-h-[92vh] w-full animate-rise flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-lg sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-subtle">{description}</p>}
          </div>
          <IconButton label="Close" size="sm" data-close onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Popover */
export function Popover({
  trigger,
  children,
  align = "start",
  className,
  open: controlled,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = useCallback((o: boolean) => (onOpenChange ? onOpenChange(o) : setInner(o)), [onOpenChange]);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, [btn, panel]);

  return (
    <div className="relative inline-block">
      {trigger({ open, toggle: () => setOpen(!open), ref: btn })}
      {open && (
        <div
          ref={panel}
          className={clsx(
            "absolute top-full z-40 mt-2 min-w-56 animate-rise rounded-xl border border-line bg-surface p-1.5 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, hint, onClick, href, download }: { icon?: ReactNode; children: ReactNode; hint?: ReactNode; onClick?: () => void; href?: string; download?: boolean }) {
  const cls = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-2";
  const inner = (
    <>
      {icon && <span className="text-subtle">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </>
  );
  return href ? (
    <a className={cls} href={href} download={download} onClick={onClick}>
      {inner}
    </a>
  ) : (
    <button className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ Toasts */
type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}
interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}
const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, kind, title, body }]);
    setTimeout(() => remove(id), kind === "error" ? 7000 : 3800);
  }, []);
  const apiRef = useRef<ToastApi>({
    success: (t, b) => push("success", t, b),
    error: (t, b) => push("error", t, b),
    info: (t, b) => push("info", t, b),
  });

  return (
    <ToastCtx.Provider value={apiRef.current}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-24 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="pointer-events-auto flex animate-rise items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-lg">
              {t.kind === "success" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              ) : t.kind === "error" ? (
                <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />
              ) : (
                <Info className="mt-0.5 size-5 shrink-0 text-info" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{t.title}</div>
                {t.body && <div className="mt-0.5 text-[13px] text-muted">{t.body}</div>}
              </div>
              <button className="text-subtle hover:text-fg" aria-label="Dismiss" onClick={() => remove(t.id)}>
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}

/* ------------------------------------------------------------------ Tooltip (hover/focus) */
export function Tooltip({ content, children, side = "top", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  return (
    <span className={clsx("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-[min(18rem,80vw)] -translate-x-1/2 animate-fade-in rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs leading-snug text-slate-100 shadow-lg group-hover/tt:block group-focus-within/tt:block dark:bg-slate-700",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {content}
      </span>
    </span>
  );
}
