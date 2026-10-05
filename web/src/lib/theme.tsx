import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
const KEY = "mm-theme";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function initial(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial);
  const [explicit, setExplicit] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a0f1c" : "#0d9488");
  }, [theme]);

  // follow the OS setting until the user picks a theme explicitly
  useEffect(() => {
    if (explicit) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const on = () => setThemeState(mq.matches ? "dark" : "light");
    mq?.addEventListener("change", on);
    return () => mq?.removeEventListener("change", on);
  }, [explicit]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    setExplicit(true);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode */
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside ThemeProvider");
  return c;
}
