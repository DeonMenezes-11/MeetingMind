import clsx from "clsx";
import { Activity, Clock, Cpu, Fingerprint, Gauge, MessageSquareText, Timer, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { SpeakerAvatar, SpeakerName, TimestampChip } from "../../components/meeting";
import { Badge, Card, SectionTitle, SegmentedControl, Stat } from "../../components/ui";
import { fmtCost, fmtDuration, fmtPct, fmtTime } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { cssVar, speakerColor, speakerHex } from "../../lib/speakers";
import { usePlayer, usePlayerTime } from "../../player/PlayerContext";
import { useRun } from "./RunContext";

const STAGE_LABEL: Record<string, string> = {
  prepare: "Prepare audio",
  transcribe: "Transcribe + diarize",
  speakers: "Name speakers",
  enrol: "Self-enrolment pass",
  minutes: "Draft minutes",
  grounding: "Verify evidence",
  index: "Build Q&A index",
  export: "Write exports",
};

export default function Analytics() {
  const { run } = useRun();
  const { theme } = useTheme();
  const words = run.speakers.reduce((a, s) => a + s.words, 0);
  const meta = run.meta;

  return (
    <div className="space-y-6" data-theme-key={theme}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Duration" value={fmtTime(meta.duration)} icon={<Clock className="size-3.5" />} />
        <Stat label="Speakers" value={run.speakers.length} icon={<Users className="size-3.5" />} />
        <Stat label="Utterances" value={run.segments.length} icon={<MessageSquareText className="size-3.5" />} />
        <Stat label="Words" value={words.toLocaleString()} sub={`${Math.round(words / (meta.duration / 60))} per minute`} icon={<Activity className="size-3.5" />} />
        <Stat label="Processing time" value={fmtDuration(meta.total_latency)} sub={`${(meta.total_latency / meta.duration).toFixed(2)}× real time`} icon={<Timer className="size-3.5" />} />
        <Stat label="API cost" value={fmtCost(meta.cost?.total)} sub={`${fmtCost((meta.cost?.total ?? 0) / (meta.duration / 60))} per minute`} icon={<Wallet className="size-3.5" />} />
      </div>

      <Card className="p-5">
        <SectionTitle icon={<Activity className="size-4" />} title="Who spoke when" hint="Each bar is an utterance - click one to play it" />
        <SpeakerLanes />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={<Users className="size-4" />} title="Share of speaking time" />
          <TalkShare key={theme} />
        </Card>
        <Card className="p-5">
          <TurnsChart key={theme} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <SectionTitle icon={<Gauge className="size-4" />} title="Pipeline latency & cost" hint={`${fmtDuration(meta.total_latency)} total · ${fmtCost(meta.cost?.total)}`} />
          <Pipeline />
        </Card>
        <Card className="p-5">
          <SectionTitle icon={<Fingerprint className="size-4" />} title="How speakers were identified" />
          <SpeakerId />
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle"><Cpu className="size-3.5" /> Models</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-subtle">Speech</dt><dd className="font-mono text-fg">{meta.stt_model_used}</dd>
              <dt className="text-subtle">Language</dt><dd className="font-mono text-fg">{meta.models.chat}</dd>
              <dt className="text-subtle">Embeddings</dt><dd className="font-mono text-fg">{meta.models.embed}</dd>
              <dt className="text-subtle">Second pass</dt><dd className="text-fg">{meta.enrolled ? `yes - ${meta.enrolment_reason}` : `no - ${meta.enrolment_reason || "not needed"}`}</dd>
            </dl>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SpeakerLanes() {
  const { run } = useRun();
  const player = usePlayer();
  const t = usePlayerTime();
  const d = run.meta.duration || run.segments[run.segments.length - 1]?.end || 1;
  const ticks = Array.from({ length: Math.floor(d / 60) + 1 }, (_, i) => i * 60);
  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[560px]">
        {run.speakers.map((s) => (
          <div key={s.label} className="flex items-center gap-3 py-1.5">
            <div className="flex w-28 shrink-0 items-center gap-2">
              <SpeakerAvatar name={s.name} index={s.index} size="xs" />
              <SpeakerName name={s.name} index={s.index} className="truncate text-[13px]" />
            </div>
            <div className="relative h-7 flex-1 rounded-md bg-surface-2">
              {run.segments
                .filter((g) => g.label === s.label)
                .map((g) => (
                  <button
                    key={g.id}
                    onClick={() => player.seek(g.start)}
                    title={`${fmtTime(g.start)} · ${g.text.slice(0, 120)}`}
                    aria-label={`Play ${s.name} at ${fmtTime(g.start)}`}
                    className="absolute inset-y-1 rounded-[4px] transition-all hover:inset-y-0 hover:brightness-110"
                    style={{ left: `${(g.start / d) * 100}%`, width: `max(3px, ${((g.end - g.start) / d) * 100}%)`, background: speakerColor(s.index).solid }}
                  />
                ))}
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs text-subtle">{fmtPct(s.share)}</span>
          </div>
        ))}
        <div className="relative ml-[124px] mr-[60px] h-6">
          {ticks.map((x) => (
            <span key={x} className="absolute top-1 -translate-x-1/2 font-mono text-[10.5px] text-subtle" style={{ left: `${(x / d) * 100}%` }}>
              {fmtTime(x)}
            </span>
          ))}
        </div>
        {/* playhead across all lanes */}
        <div className="pointer-events-none absolute top-0 bottom-6 left-[124px] right-[60px]" aria-hidden>
          {t > 0 && <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-fg/70" style={{ left: `${(t / d) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}

function TalkShare() {
  const { run } = useRun();
  const data = run.speakers.map((s) => ({ name: s.name, value: s.talk_time, share: s.share, fill: speakerHex(s.index) }));
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-48 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
            <RTooltip content={<ChartTip format={(v) => fmtDuration(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xl font-semibold tabular-nums">{fmtTime(run.speakers.reduce((a, s) => a + s.talk_time, 0))}</div>
            <div className="text-[11px] text-subtle">speaking time</div>
          </div>
        </div>
      </div>
      <ul className="w-full flex-1 space-y-2.5">
        {run.speakers.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: speakerColor(s.index).solid }} />
            <span className="flex-1 font-medium">{s.name}</span>
            <span className="font-mono text-xs text-subtle">{fmtDuration(s.talk_time)}</span>
            <span className="w-11 text-right font-mono text-xs font-semibold">{fmtPct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TurnsChart() {
  const { run } = useRun();
  const [metric, setMetric] = useState<"turns" | "wpm" | "words">("turns");
  const data = run.speakers.map((s) => ({ name: s.name, value: s[metric], fill: speakerHex(s.index) }));
  const grid = cssVar("--line");
  const sub = cssVar("--fg-subtle");
  const label = { turns: "Turns taken", wpm: "Speaking pace (words / min)", words: "Words spoken" }[metric];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><MessageSquareText className="size-4 text-accent-text" />{label}</h2>
        <SegmentedControl label="Metric" size="sm" value={metric} onChange={setMetric} options={[{ value: "turns", label: "Turns" }, { value: "wpm", label: "Pace" }, { value: "words", label: "Words" }]} />
      </div>
      <div className="h-52">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: grid }} tick={{ fill: sub, fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: sub, fontSize: 11 }} allowDecimals={false} />
            <RTooltip cursor={{ fill: grid, opacity: 0.5 }} content={<ChartTip format={(v) => (metric === "wpm" ? `${v} wpm` : String(v))} />} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function ChartTip({ active, payload, format }: { active?: boolean; payload?: { name?: string; value?: number; payload?: { name: string } }[]; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-fg">{p.payload?.name ?? p.name}</div>
      <div className="text-muted">{format(Number(p.value ?? 0))}</div>
    </div>
  );
}

function Pipeline() {
  const { run } = useRun();
  const timings = run.meta.timings ?? {};
  const cost = run.meta.cost?.by_stage ?? {};
  const order = ["prepare", "transcribe", "speakers", "enrol", "minutes", "grounding", "index", "export"];
  const rows = useMemo(() => order.filter((k) => k in timings).map((k) => ({ key: k, s: timings[k], c: cost[k] ?? 0 })), [timings, cost]);
  const max = Math.max(...rows.map((r) => r.s), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[132px_minmax(0,1fr)_64px_64px] items-center gap-3 text-[13px]">
          <span className="truncate text-muted">{STAGE_LABEL[r.key] ?? r.key}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-3">
            <span className={clsx("block h-full rounded-full", r.s / max > 0.3 ? "bg-accent" : "bg-accent/60")} style={{ width: `${Math.max(1.5, (r.s / max) * 100)}%` }} />
          </span>
          <span className="text-right font-mono text-xs tabular-nums text-fg">{r.s < 1 ? `${(r.s * 1000).toFixed(0)} ms` : `${r.s.toFixed(1)} s`}</span>
          <span className="text-right font-mono text-xs tabular-nums text-subtle">{r.c ? fmtCost(r.c) : "-"}</span>
        </li>
      ))}
    </ul>
  );
}

function SpeakerId() {
  const { run, segStart } = useRun();
  return (
    <ul className="space-y-2">
      {run.speakers.map((s) => (
        <li key={s.label} className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-2.5">
          <SpeakerAvatar name={s.name} index={s.index} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <SpeakerName name={s.name} index={s.index} />
              {s.renamed && <Badge tone="info">renamed</Badge>}
            </div>
            <div className="truncate text-xs text-subtle">
              voice <span className="font-mono">{s.label}</span> · {s.method === "enrolled-reference" ? "matched to their own introduction clip" : "named from the introductions"}
              {s.confidence != null && ` · ${fmtPct(s.confidence)} confidence`}
            </div>
          </div>
          {s.evidence && <TimestampChip seconds={segStart.get(s.evidence)} label={s.evidence} />}
        </li>
      ))}
    </ul>
  );
}
