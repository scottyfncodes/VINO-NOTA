import Link from "next/link";
import type { FingerprintDimension } from "@/lib/domain/analytics";
import { formatScore } from "@/lib/domain/score";
import s from "./charts.module.css";

/** Sequential steps for the mean score at a level (one hue, light → dark). */
const STEPS = [
  { max: 5, color: "var(--chart-seq-0)", label: "below 5" },
  { max: 6.5, color: "var(--chart-seq-1)", label: "5–6.4" },
  { max: 7.5, color: "var(--chart-seq-2)", label: "6.5–7.4" },
  { max: 8.5, color: "var(--chart-seq-3)", label: "7.5–8.4" },
  { max: Infinity, color: "var(--chart-seq-4)", label: "8.5+" },
];
const stepFor = (score: number) => STEPS.find((x) => score < x.max)!;

/**
 * Dot matrix: rows are structural dimensions, columns the five recorded levels.
 * Dot area ∝ how often you recorded that level; fill = your mean score when
 * you did (hollow when none of those tastings were rated).
 */
export function Fingerprint({ dimensions }: { dimensions: FingerprintDimension[] }) {
  const rows = dimensions.filter((d) => d.assessed > 0);
  const maxCount = Math.max(1, ...rows.flatMap((d) => d.levels.map((l) => l.count)));
  const labelW = 112;
  const colW = 40;
  const rowH = 46;
  const width = labelW + colW * 5 + 44;
  const height = 22 + rows.length * rowH;
  const r = (count: number) => (count === 0 ? 0 : Math.max(4, Math.sqrt(count / maxCount) * 17));

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <svg className={s.matrix} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Palate fingerprint dot matrix">
        {[1, 2, 3, 4, 5].map((n) => (
          <text key={n} x={labelW + colW * (n - 0.5)} y={12} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
            {n}
          </text>
        ))}
        <text x={labelW + colW * 5 + 8} y={12} fontSize="10" fill="var(--text-muted)">
          n
        </text>
        {rows.map((d, i) => {
          const cy = 22 + i * rowH + rowH / 2;
          return (
            <g key={d.key}>
              <line x1={labelW} x2={labelW + colW * 5} y1={cy} y2={cy} stroke="var(--chart-grid)" />
              <text x={0} y={cy - 3} fontSize="12" fill="var(--text)">
                {d.label}
              </text>
              <text x={0} y={cy + 11} fontSize="9.5" fill="var(--text-muted)">
                {d.scale[0].toLowerCase()} → {d.scale[4].toLowerCase()}
              </text>
              {d.levels.map((l) =>
                l.count === 0 ? null : (
                  <Link
                    key={l.value}
                    href={`/journal?ids=${l.tastingIds.join(",")}`}
                    aria-label={`${d.label} ${d.scale[l.value - 1]}: ${l.count} ${l.count === 1 ? "tasting" : "tastings"}${l.meanScore !== null ? `, mean score ${formatScore(l.meanScore)} from ${l.ratedCount} rated` : ", none rated"}`}
                  >
                    {/* The whole grid cell is the tap target; small dots alone are too small to hit. */}
                    <rect x={labelW + colW * (l.value - 1)} y={cy - rowH / 2} width={colW} height={rowH} fill="transparent" />
                    <circle
                      cx={labelW + colW * (l.value - 0.5)}
                      cy={cy}
                      r={r(l.count)}
                      fill={l.meanScore === null ? "var(--bg)" : stepFor(l.meanScore).color}
                      stroke={l.meanScore === null ? "var(--chart-1)" : "var(--bg)"}
                      strokeWidth={l.meanScore === null ? 1.5 : 2}
                    >
                      <title>{`${d.label}: ${d.scale[l.value - 1]} — ${l.count} ${l.count === 1 ? "tasting" : "tastings"}${l.meanScore !== null ? `, mean ${formatScore(l.meanScore)} (${l.ratedCount} rated)` : ", none rated"}`}</title>
                    </circle>
                  </Link>
                ),
              )}
              <text x={labelW + colW * 5 + 8} y={cy + 4} fontSize="11" fill="var(--text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {d.assessed}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={s.legend} aria-label="Legend">
        <span>Your mean score at that level:</span>
        {STEPS.map((x) => (
          <span key={x.label} className={s.legendItem}>
            <svg width="12" height="12" aria-hidden="true">
              <circle cx="6" cy="6" r="5.5" fill={x.color} />
            </svg>
            {x.label}
          </span>
        ))}
        <span className={s.legendItem}>
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--chart-1)" strokeWidth="1.5" />
          </svg>
          not rated
        </span>
        <span>· Larger dot = recorded more often</span>
      </div>
    </div>
  );
}
