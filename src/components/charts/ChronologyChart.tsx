"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { Chronology } from "@/lib/domain/analytics";
import { formatScore } from "@/lib/domain/score";
import s from "./charts.module.css";

const DAY = 86_400_000;
const ts = (d: string) => Date.parse(`${d}T12:00:00Z`);
const monthMid = (m: string) => Date.parse(`${m}-15T12:00:00Z`);
const fmtMonth = (t: number) => new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(t));
const fmtDay = (t: number) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(t));

export function ChronologyChart({ data }: { data: Chronology }) {
  const router = useRouter();
  const first = ts(`${data.months[0].month}-01`);
  const lastMonth = data.months[data.months.length - 1].month;
  const [ly, lm] = lastMonth.split("-").map(Number);
  const last = Date.UTC(ly, lm, 1, 12) - DAY;
  const domain: [number, number] = [first - 3 * DAY, last + 3 * DAY];
  const rated = data.points.filter((p) => p.score !== null).map((p) => ({ ...p, t: ts(p.tastedOn) }));
  const meanLine = data.months.filter((m) => m.meanScore !== null).map((m) => ({ t: monthMid(m.month), mean: m.meanScore }));
  const counts = data.months.map((m) => ({ t: monthMid(m.month), count: m.count, rated: m.rated, month: m.month }));
  const tickCount = Math.min(6, data.months.length + 1);

  const xAxis = (
    <XAxis
      type="number"
      dataKey="t"
      domain={domain}
      scale="time"
      tickCount={tickCount}
      tickFormatter={fmtMonth}
      tickLine={false}
      axisLine={{ stroke: "var(--chart-axis)" }}
      tick={{ fill: "var(--text-muted)", fontSize: 11 }}
    />
  );

  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <p className="eyebrow">Score of each rated tasting · line joins monthly means</p>
      <div className={s.chart} role="img" aria-label="Your scores over time. A table follows.">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            {xAxis}
            <YAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={40} />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = payload?.find((x) => x.payload && "tastedOn" in x.payload)?.payload as (typeof rated)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <div className={s.tooltip}>
                    <div className={s.tooltipTitle}>{p.label}</div>
                    <div className={s.tooltipRow}>
                      {fmtDay(p.t)} · {formatScore(p.score)} / 10
                    </div>
                  </div>
                );
              }}
            />
            {meanLine.length > 1 && <Line data={meanLine} dataKey="mean" type="linear" stroke="var(--chart-1)" strokeOpacity={0.45} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />}
            <Scatter
              data={rated}
              dataKey="score"
              fill="var(--chart-1)"
              stroke="var(--bg)"
              strokeWidth={2}
              cursor="pointer"
              onClick={(d) => {
                const p = (d as unknown as { payload?: (typeof rated)[number] }).payload;
                if (p) router.push(`/wines/${p.wineId}#tasting-${p.id}`);
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="eyebrow">Tastings per month, rated or not</p>
      <div className={`${s.chart} ${s.chartShort}`} role="img" aria-label="Number of tastings recorded each month. A table follows.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={counts} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            {xAxis}
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={40} tickCount={3} />
            <Tooltip
              cursor={{ fill: "var(--accent-softer)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className={s.tooltip}>
                    <div className={s.tooltipTitle}>{fmtMonth(payload[0].payload.t)}</div>
                    <div className={s.tooltipRow}>
                      {payload[0].payload.count} tastings · {payload[0].payload.rated} rated
                    </div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="count" fill="var(--chart-1)" fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
