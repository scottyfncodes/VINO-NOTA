"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoreBin } from "@/lib/domain/analytics";
import s from "./charts.module.css";

export function RatingChart({ bins }: { bins: ScoreBin[] }) {
  const router = useRouter();
  const data = bins.map((b) => ({ ...b, ids: b.tastingIds.join(",") }));
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className={s.chart} role="img" aria-label="Column chart of how many rated tastings fall in each one-point score band. A table follows.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fill: "var(--text-muted)", fontSize: 11 }} interval={0} />
          <YAxis allowDecimals={false} domain={[0, max]} tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={48} />
          <Tooltip
            cursor={{ fill: "var(--accent-softer)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className={s.tooltip}>
                  <div className={s.tooltipTitle}>Score {payload[0].payload.label}</div>
                  <div className={s.tooltipRow}>
                    {payload[0].payload.count} rated {payload[0].payload.count === 1 ? "tasting" : "tastings"}
                    {payload[0].payload.count > 0 ? " · tap to open" : ""}
                  </div>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="count"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            cursor="pointer"
            onClick={(d) => {
              const ids = (d as unknown as { payload?: { ids: string } }).payload?.ids;
              if (ids) router.push(`/journal?ids=${ids}`);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
