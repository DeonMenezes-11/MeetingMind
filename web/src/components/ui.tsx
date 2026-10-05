import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

/* ------------------------------------------------------------------ Button */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-strong shadow-sm hover:shadow-md disabled:bg-surface-3 disabled:text-subtle disabled:shadow-none",
  secondary:
    "bg-surface text-fg border border-line-strong hover:bg-surface-2 hover:border-subtle/40 shadow-sm disabled:text-subtle",
  ghost: "text-muted hover:text-fg hover:bg-surface-2 disabled:text-subtle",
  danger: "bg-danger-soft text-danger-text hover:bg-danger hover:text-white",
  soft: "bg-accent-soft text-accent-text hover:bg-accent hover:text-accent-fg",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, iconRight, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.98] disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md"; active?: boolean }>(
  function IconButton({ label, size = "md", active, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={clsx(
          "inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40",
          size === "sm" ? "size-8" : "size-9",
          active && "bg-accent-soft text-accent-text",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/* ------------------------------------------------------------------ Badge */
type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent-soft text-accent-text border-transparent",
  success: "bg-success-soft text-success-text border-transparent",
  warning: "bg-warning-soft text-warning-text border-transparent",
  danger: "bg-danger-soft text-danger-text border-transparent",
  info: "bg-info-soft text-info-text border-transparent",
};

export function Badge({ tone = "neutral", icon, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Card */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon, title, hint, action, className }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-fg">
          {icon && <span className="text-accent-text">{icon}</span>}
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-subtle">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ misc */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.4rem] items-center justify-center rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted shadow-[0_1px_0_var(--line-strong)]">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin", className ?? "size-4")} aria-hidden />;
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-subtle">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-subtle">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-[10px] font-medium transition-all",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent" : "bg-surface-3",
      )}
    >
      <span
        className={clsx(
          "inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function ProgressBar({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "success" | "danger" }) {
  const color = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <div className={clsx("h-2 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx("h-full rounded-full transition-[width] duration-500 ease-out", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "accent" | "success" | "warning" | "danger" }) {
  const toneCls = tone === "success" ? "text-success-text" : tone === "warning" ? "text-warning-text" : tone === "danger" ? "text-danger-text" : "text-fg";
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-subtle">
        {icon}
        {label}
      </div>
      <div className={clsx("text-2xl font-semibold tracking-tight tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="text-xs text-subtle">{sub}</div>}
    </div>
  );
}
