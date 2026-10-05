import clsx from "clsx";
import { Keyboard, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAsync } from "../lib/hooks";
import { useTheme } from "../lib/theme";
import { Logo } from "./meeting";
import { Modal, Tooltip } from "./overlays";
import { Button, IconButton, Kbd } from "./ui";

export const TEAM = [
  { name: "Deon Menezes", roll: "16014223030" },
  { name: "Aishwarya Gawali", roll: "16014223007" },
];

const NAV = [
  { to: "/", label: "Meetings", end: true },
  { to: "/about", label: "How it works", end: false },
];

export function AppShell() {
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [keys, setKeys] = useState(false);
  const health = useAsync(() => api.health(), []);
  const inWorkspace = loc.pathname.startsWith("/m/");

  useEffect(() => {
    setMenu(false);
  }, [loc.pathname]);
  useEffect(() => {
    const open = () => setKeys(true);
    window.addEventListener("mm:shortcuts", open);
    return () => window.removeEventListener("mm:shortcuts", open);
  }, []);

  const keyOk = health.data?.key.configured;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="rounded-lg" aria-label="MeetingMind home">
            <Logo />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {health.data && (
              <Tooltip
                side="bottom"
                content={keyOk ? `OpenAI key loaded from ${health.data.key.source}. Models: ${health.data.models.stt}, ${health.data.models.chat}.` : "No OpenAI key found - add OPENAI_API_KEY to .env to process new meetings."}
              >
                <span
                  tabIndex={0}
                  className={clsx(
                    "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex",
                    keyOk ? "border-line text-muted" : "border-transparent bg-warning-soft text-warning-text",
                  )}
                >
                  <span className={clsx("size-1.5 rounded-full", keyOk ? "bg-success" : "bg-warning")} />
                  {keyOk ? "AI connected" : "No API key"}
                </span>
              </Tooltip>
            )}
            <IconButton label="Keyboard shortcuts (?)" onClick={() => setKeys(true)} className="hidden sm:inline-flex">
              <Keyboard className="size-[18px]" />
            </IconButton>
            <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
              {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
            <Link to="/new" className="hidden sm:block">
              <Button variant="primary" size="sm" icon={<Plus className="size-4" />}>
                New meeting
              </Button>
            </Link>
            <IconButton label="Menu" className="md:hidden" onClick={() => setMenu((m) => !m)}>
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </IconButton>
          </div>
        </div>
        {menu && (
          <nav className="animate-fade-in border-t border-line px-4 py-3 md:hidden" aria-label="Mobile">
            {[...NAV, { to: "/new", label: "New meeting", end: false }].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx("block rounded-lg px-3 py-2.5 text-[15px] font-medium", isActive ? "bg-surface-2 text-fg" : "text-muted")}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <ErrorBoundary key={loc.pathname.split("/").slice(0, 3).join("/")}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {!inWorkspace && <Footer />}
      <ShortcutsModal open={keys} onClose={() => setKeys(false)} />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-6 text-[13px] text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo compact />
          <span>
            Generative AI Laboratory · Experiment 8 · Mini project · Batch B1
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TEAM.map((m) => (
            <span key={m.roll}>
              <span className="font-medium text-muted">{m.name}</span> · {m.roll}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["Space"], "Play / pause"],
  [["←", "→"], "Seek 5 seconds"],
  [["Shift", "←/→"], "Seek 10 seconds"],
  [["1", "…", "6"], "Switch section (Overview … Analytics)"],
  [["/"], "Search the transcript / focus the question box"],
  [["F"], "Toggle follow-playback in the transcript"],
  [["M"], "Mute / unmute"],
  [["?"], "Show this help"],
  [["Esc"], "Close dialogs and menus"],
];

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" description="Available inside a meeting workspace." size="sm">
      <ul className="divide-y divide-line">
        {SHORTCUTS.map(([keys, what]) => (
          <li key={what} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="text-muted">{what}</span>
            <span className="flex items-center gap-1">
              {keys.map((k) => (k === "…" ? <span key={k} className="text-subtle">…</span> : <Kbd key={k}>{k}</Kbd>))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ------------------------------------------------------------------ error boundary */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger-text">!</div>
        <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-subtle">{this.state.error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => location.reload()}>Reload</Button>
          <Link to="/">
            <Button variant="primary">Back to meetings</Button>
          </Link>
        </div>
      </div>
    );
  }
}

