"use client";

import { useRouter } from "next/navigation";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { ValuePoint } from "@/lib/domain/analytics";
import { formatPrice, PRICE_BASES } from "@/lib/domain/currency";
import { formatScore } from "@/lib/domain/score";
import s from "./charts.module.css";

const SERIES = [
  { basis: "retail_bottle", color: "var(--chart-1)", shape: "circle" as const },
  { basis: "restaurant_bottle", color: "var(--chart-2)", shape: "square" as const },
  { basis: "glass", color: "var(--chart-3)", shape: "triangle" as const },
];

export function ValueChart({ points, currency, medianPrice, medianScore }: { points: ValuePoint[]; currency: string; medianPrice: number | null; medianScore: number | null }) {
  const router = useRouter();
  const maxPrice = Math.max(10, ...points.map((p) => p.price));
  const present = SERIES.filter((x) => points.some((p) => (p.basis ?? "retail_bottle") === x.basis));
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {present.length > 1 && (
        <div className={s.legend} aria-label="Legend">
          {present.map((x) => (
            <span key={x.basis} className={s.legendItem}>
              <svg width="12" height="12" aria-hidden="true">
                {x.shape === "circle" && <circle cx="6" cy="6" r="5" fill={x.color} />}
                {x.shape === "square" && <rect x="1" y="1" width="10" height="10" fill={x.color} />}
                {x.shape === "triangle" && <path d="M6 1 11 11H1z" fill={x.color} />}
              </svg>
              {PRICE_BASES.find((b) => b.value === x.basis)?.label}
            </span>
          ))}
        </div>
      )}
      <div className={`${s.chart} ${s.chartTall}`} role="img" aria-label={`Scatter plot of your score against the price you paid in ${currency}. A table follows.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis
              type="number"
              dataKey="price"
              name="Price"
              domain={[0, Math.ceil(maxPrice * 1.08)]}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickFormatter={(v: number) => formatPrice(v, currency) ?? String(v)}
            />
            <YAxis type="number" dataKey="score" name="Score" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={40} />
            {medianPrice !== null && points.length >= 3 && <ReferenceLine x={medianPrice} stroke="var(--chart-axis)" strokeDasharray="0" label={{ value: "median price", position: "insideTopRight", fill: "var(--text-muted)", fontSize: 10 }} />}
            {medianScore !== null && points.length >= 3 && <ReferenceLine y={medianScore} stroke="var(--chart-axis)" label={{ value: "median score", position: "insideBottomRight", fill: "var(--text-muted)", fontSize: 10 }} />}
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as ValuePoint;
                return (
                  <div className={s.tooltip}>
                    <div className={s.tooltipTitle}>{p.label}</div>
                    <div className={s.tooltipRow}>
                      {formatScore(p.score)} / 10 · {formatPrice(p.price, currency)} · {PRICE_BASES.find((b) => b.value === p.basis)?.label.toLowerCase() ?? "bottle"}
                    </div>
                  </div>
                );
              }}
            />
            {SERIES.map((x) => (
              <Scatter
                key={x.basis}
                data={points.filter((p) => (p.basis ?? "retail_bottle") === x.basis)}
                fill={x.color}
                shape={x.shape}
                stroke="var(--bg)"
                strokeWidth={2}
                cursor="pointer"
                onClick={(d) => {
                  const p = (d as unknown as { payload?: ValuePoint }).payload;
                  if (p) router.push(`/wines/${p.wineId}#tasting-${p.id}`);
                }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
