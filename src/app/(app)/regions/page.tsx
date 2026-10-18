import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { regionIndex } from "@/server/analytics";
import { getRequestLocale } from "@/server/locale";
import { countryByCode, countryName } from "@/lib/domain/countries";
import { formatNumber, plural } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { Caveat, Figure } from "@/components/charts/ChartBits";
import { countryShapes, MAP_HEIGHT, MAP_WIDTH } from "@/components/regions/worldMap";
import s from "@/components/regions/regions.module.css";

export const metadata: Metadata = { title: "Regions" };

type Agg = { wines: Set<string>; tastings: number; scoreSum: number; rated: number };
const agg = (): Agg => ({ wines: new Set(), tastings: 0, scoreSum: 0, rated: 0 });
const add = (a: Agg, r: { wineId: string; tastings: number; scoreSum: number; rated: number }) => {
  a.wines.add(r.wineId);
  a.tastings += r.tastings;
  a.scoreSum += r.scoreSum;
  a.rated += r.rated;
};

const SEQ = ["var(--chart-seq-1)", "var(--chart-seq-2)", "var(--chart-seq-3)", "var(--chart-seq-4)"];

export default async function RegionsPage() {
  const user = await requireUser();
  const locale = await getRequestLocale();
  const rows = await regionIndex(user.id);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Wine atlas" title="Regions" />
        <EmptyState title="No origins recorded yet" action={<ButtonLink href="/capture" variant="primary" icon="capture">Record a tasting</ButtonLink>}>
          As you record wines with a country and region, they&rsquo;ll be mapped by country and gathered into an index of the places you&rsquo;ve explored.
        </EmptyState>
      </>
    );
  }

  // country → region → { agg, subregions, appellations }
  const countries = new Map<string, { agg: Agg; regions: Map<string, { name: string; agg: Agg; subs: Map<string, Agg>; appellations: Set<string> }>; unplaced: Agg }>();
  const noCountry = agg();
  for (const r of rows) {
    if (!r.country) {
      add(noCountry, r);
      continue;
    }
    const c = countries.get(r.country) ?? { agg: agg(), regions: new Map(), unplaced: agg() };
    countries.set(r.country, c);
    add(c.agg, r);
    const regionName = r.parentName ?? r.regionName;
    if (!regionName) {
      add(c.unplaced, r);
      continue;
    }
    const reg = c.regions.get(regionName) ?? { name: regionName, agg: agg(), subs: new Map(), appellations: new Set() };
    c.regions.set(regionName, reg);
    add(reg.agg, r);
    if (r.parentName && r.regionName) {
      const sub = reg.subs.get(r.regionName) ?? agg();
      reg.subs.set(r.regionName, sub);
      add(sub, r);
    }
    if (r.appellation) reg.appellations.add(r.appellation);
  }

  const sorted = [...countries.entries()].sort((a, b) => b[1].agg.tastings - a[1].agg.tastings || (countryName(a[0]) ?? "").localeCompare(countryName(b[0]) ?? ""));
  const max = Math.max(1, ...sorted.map(([, c]) => c.agg.tastings));
  const fillFor = (n: number) => SEQ[Math.min(SEQ.length - 1, Math.floor((n / max) * SEQ.length - 1e-9))];
  const byNumeric = new Map(sorted.map(([code, c]) => [countryByCode(code)?.numeric, { code, c }]));
  const shapes = countryShapes();
  const mapped = new Set(shapes.map((sh) => sh.id));
  const unmappable = sorted.filter(([code]) => !mapped.has(countryByCode(code)?.numeric ?? ""));
  const regionCount = sorted.reduce((n, [, c]) => n + c.regions.size, 0);
  const mean = (a: Agg) => (a.rated ? formatNumber(a.scoreSum / a.rated, locale, 1) : null);
  const fig = (a: Agg) => [plural(a.wines.size, "wine"), plural(a.tastings, "tasting"), mean(a) && `avg ${mean(a)}`].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader eyebrow="Wine atlas" title="Regions" lede="Where the wines you've recorded come from, by the origin you entered or confirmed." />
      <div className={s.stats}>
        <Figure label="Countries" value={sorted.length} />
        <Figure label="Regions" value={regionCount} />
        <Figure label="Wines with an origin" value={rows.length - noCountry.wines.size} />
      </div>

      <svg className={s.map} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label={`World map highlighting ${plural(sorted.length, "country", "countries")} you have recorded wines from`}>
        {shapes.map((sh, i) => {
          const hit = byNumeric.get(sh.id);
          if (!hit) return <path key={`${sh.id}-${i}`} d={sh.d} className={s.land} aria-hidden="true" />;
          return (
            <a key={`${sh.id}-${i}`} href={`#country-${hit.code}`} aria-label={`${countryName(hit.code)}: ${fig(hit.c.agg)}`}>
              <path d={sh.d} className={s.recorded} fill={fillFor(hit.c.agg.tastings)}>
                <title>{`${countryName(hit.code)} — ${fig(hit.c.agg)}`}</title>
              </path>
            </a>
          );
        })}
      </svg>
      <div className={s.legend}>
        <span>Tastings recorded:</span>
        {SEQ.map((c, i) => (
          <span key={c}>
            <span className={s.swatch} style={{ background: c }} />
            {i === 0 ? "fewest" : i === SEQ.length - 1 ? `most (${max})` : ""}
          </span>
        ))}
        <span>
          <span className={s.swatch} style={{ background: "var(--surface-paper)" }} />
          none
        </span>
      </div>
      <div style={{ marginTop: "var(--space-3)" }}>
        <Caveat>
          The map shades countries only. Regions and appellations are listed below rather than pinned, because Vino Nota doesn&rsquo;t place points without verified coordinates.
          {unmappable.length > 0 && ` ${unmappable.map(([code]) => countryName(code)).join(", ")} ${unmappable.length === 1 ? "is" : "are"} too small to show at this map scale.`}
        </Caveat>
      </div>

      <div className={s.index}>
        {sorted.map(([code, c]) => (
          <section key={code} id={`country-${code}`} className={s.country} aria-labelledby={`country-${code}-title`}>
            <div className={s.countryHead}>
              <h2 className={s.countryName} id={`country-${code}-title`}>
                {countryName(code)}
              </h2>
              <span className={s.countryMeta}>{fig(c.agg)}</span>
            </div>
            {[...c.regions.values()]
              .sort((a, b) => b.agg.tastings - a.agg.tastings || a.name.localeCompare(b.name))
              .map((reg) => (
                <Link key={reg.name} href={`/journal?country=${code}&region=${encodeURIComponent(reg.name)}`} className={s.regionRow}>
                  <span className={s.regionName}>{reg.name}</span>
                  <span className={s.regionFig}>{fig(reg.agg)}</span>
                  {(reg.subs.size > 0 || reg.appellations.size > 0) && (
                    <span className={s.regionSub}>
                      {[...reg.subs.keys()].sort().join(", ")}
                      {reg.subs.size > 0 && reg.appellations.size > 0 && " · "}
                      {reg.appellations.size > 0 && `Appellations: ${[...reg.appellations].sort().join(", ")}`}
                    </span>
                  )}
                </Link>
              ))}
            {c.unplaced.wines.size > 0 && (
              <Link href={`/journal?country=${code}`} className={s.regionRow}>
                <span className={`${s.regionName} ${s.unplaced}`}>Region not recorded</span>
                <span className={s.regionFig}>{fig(c.unplaced)}</span>
              </Link>
            )}
          </section>
        ))}
        {noCountry.wines.size > 0 && (
          <section aria-labelledby="no-origin-title">
            <div className={s.countryHead}>
              <h2 className={s.countryName} id="no-origin-title">
                Origin not recorded
              </h2>
              <span className={s.countryMeta}>{fig(noCountry)}</span>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", paddingTop: "var(--space-3)" }}>
              Add a country from each wine&rsquo;s page to place {noCountry.wines.size === 1 ? "it" : "them"} on the atlas.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
