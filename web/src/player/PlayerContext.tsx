import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Segment } from "../types";

interface Controls {
  playing: boolean;
  duration: number;
  rate: number;
  ready: boolean;
  error: string | null;
  muted: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Jump to `t` seconds (and start playing unless play=false). */
  seek: (t: number, play?: boolean) => void;
  skip: (delta: number) => void;
  setRate: (r: number) => void;
  setMuted: (m: boolean) => void;
  getTime: () => number;
}

const ControlsCtx = createContext<Controls | null>(null);
const TimeCtx = createContext<number>(0);

export function PlayerProvider({ src, fallbackDuration, children }: { src: string; fallbackDuration?: number; children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(fallbackDuration ?? 0);
  const [rate, setRateState] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const raf = useRef<number | null>(null);
  const lastPush = useRef(0);

  // create the element once per source
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    el.src = src;
    audio.current = el;
    setReady(false);
    setError(null);
    setTime(0);
    setPlaying(false);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
      setReady(true);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setTime(el.currentTime);
    const onErr = () => setError("The recording could not be loaded.");
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", onTime);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("error", onErr);
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("seeked", onTime);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("error", onErr);
      audio.current = null;
    };
  }, [src]);

  // smooth time updates (~12 fps) while playing
  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const el = audio.current;
      if (el && now - lastPush.current > 80) {
        lastPush.current = now;
        setTime(el.currentTime);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing]);

  const play = useCallback(() => {
    audio.current?.play().catch(() => setError("Playback was blocked by the browser - press play again."));
  }, []);
  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) play();
    else el.pause();
  }, [play]);
  const seek = useCallback(
    (t: number, andPlay = true) => {
      const el = audio.current;
      if (!el) return;
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration || t;
      el.currentTime = Math.max(0, Math.min(t, max - 0.05));
      setTime(el.currentTime);
      if (andPlay) play();
    },
    [play, duration],
  );
  const skip = useCallback((delta: number) => {
    const el = audio.current;
    if (el) seek(el.currentTime + delta, !el.paused);
  }, [seek]);
  const setRate = useCallback((r: number) => {
    if (audio.current) audio.current.playbackRate = r;
    setRateState(r);
  }, []);
  const setMuted = useCallback((m: boolean) => {
    if (audio.current) audio.current.muted = m;
    setMutedState(m);
  }, []);
  const getTime = useCallback(() => audio.current?.currentTime ?? 0, []);

  const controls = useMemo<Controls>(
    () => ({ playing, duration, rate, ready, error, muted, play, pause, toggle, seek, skip, setRate, setMuted, getTime }),
    [playing, duration, rate, ready, error, muted, play, pause, toggle, seek, skip, setRate, setMuted, getTime],
  );

  return (
    <ControlsCtx.Provider value={controls}>
      <TimeCtx.Provider value={time}>{children}</TimeCtx.Provider>
    </ControlsCtx.Provider>
  );
}

export function usePlayer(): Controls {
  const c = useContext(ControlsCtx);
  if (!c) throw new Error("usePlayer outside PlayerProvider");
  return c;
}

/** Current playback position (re-renders the caller while audio plays). */
export function usePlayerTime(): number {
  return useContext(TimeCtx);
}

/** Index of the segment being spoken at `t` (or the last one that started before it). */
export function segmentAt(segments: Segment[], t: number): number {
  let lo = 0, hi = segments.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= t + 0.05) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function useActiveSegment(segments: Segment[]): number {
  const t = usePlayerTime();
  return useMemo(() => segmentAt(segments, t), [segments, t]);
}
