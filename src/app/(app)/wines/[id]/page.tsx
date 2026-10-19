import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { findWineMatches, getWineDetail, relatedWines } from "@/server/catalog/wines";
import { listTastingsForWine } from "@/server/tastings";
import { NotFoundError } from "@/server/errors";
import { getRequestLocale } from "@/server/locale";
import { countryName } from "@/lib/domain/countries";
import { wineTypeLabel, vintageLabel } from "@/lib/domain/wine";
import { formatScore } from "@/lib/domain/score";
import type { FieldProvenance } from "@/server/db/schema";
import { formatDate, formatNumber, plural, wineTitle } from "@/lib/format";
import { shellStyles } from "@/components/shell/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Badge, ButtonLink, Notice } from "@/components/ui/primitives";
import { TastingRecord } from "@/components/wine/TastingRecord";
import { DeleteWineButton, Gallery, MergeDuplicate } from "@/components/wine/WineClient";
import { ScoreMark } from "@/components/wine/display";
import s from "@/components/wine/detail.module.css";

async function load(id: string) {
  const user = await requireUser();
  try {
    return { user, wine: await getWineDetail(user.id, id) };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/wines/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { wine } = await load(id);
  return { title: wineTitle(wine) };
}

function Provenance({ p }: { p?: FieldProvenance }) {
  if (!p || p.source === "user") return null;
  const pct = typeof p.confidence === "number" ? ` · ${Math.round(p.confidence * 100)}%` : "";
  if (p.provider?.startsWith("catalog:")) {
    return (
      <Badge tone="success" title={`Completed from the reference catalog (${p.provider.slice(8)}) and confirmed by you${p.confirmedAt ? ` on ${p.confirmedAt.slice(0, 10)}` : ""}.`}>
        From catalog{pct} · confirmed
      </Badge>
    );
  }
  return (
    <Badge tone="success" title={`Suggested by ${p.provider ?? "a provider"} from the label and confirmed by you${p.confirmedAt ? ` on ${p.confirmedAt.slice(0, 10)}` : ""}.`}>
      From label{pct} · confirmed
    </Badge>
  );
}

function Fact({ label, value, p }: { label: string; value: React.ReactNode; p?: FieldProvenance }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value ?? <span className={s.unknown}>Not recorded</span>} <Provenance p={p} />
      </dd>
    </>
  );
}

export default async function WinePage({ params, searchParams }: PageProps<"/wines/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, wine } = await load(id);
  const locale = await getRequestLocale();
  const [tastings, related, duplicates] = await Promise.all([
    listTastingsForWine(user.id, id),
    relatedWines(user.id, id, wine.producerId),
    findWineMatches(user.id, { producer: wine.producer?.name, name: wine.name, vintage: wine.vintage, isNonVintage: wine.isNonVintage }, id),
  ]);
  const sameWine = duplicates.filter((d) => d.match === "same_wine");
  const rated = tastings.filter((t) => t.personalScore !== null).map((t) => Number(t.personalScore));
  const mean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
  const title = wineTitle(wine);
  const prov = wine.fieldProvenance;
  const vintage = vintageLabel(wine.vintage, wine.isNonVintage);
  const savedId = typeof sp.saved === "string" ? sp.saved : null;

  return (
    <div className={s.page}>
      <div>
        <Link href="/journal" className={shellStyles.back}>
          <Icon name="back" size={18} /> Journal
        </Link>
        {savedId && (
          <div style={{ margin: "var(--space-3) 0 var(--space-5)" }}>
            <Notice tone="success" title="Saved to your journal" />
          </div>
        )}
        {sp.updated && (
          <div style={{ marginBottom: "var(--space-5)" }}>
            <Notice tone="success" title="Wine details updated" />
          </div>
        )}
        <div className={s.hero}>
          <Gallery wineId={wine.id} images={wine.images.map((i) => ({ id: i.id, imageType: i.imageType }))} wineType={wine.wineType} title={title} />
          <div>
            <div className={s.titleBlock}>
              {wine.producer && <p className={s.producer}>{wine.producer.name}</p>}
              <h1 className={s.title}>
                {wine.name}
                {vintage && <span className="num"> {vintage}</span>}
              </h1>
              <p className={s.subtitle}>{[wineTypeLabel(wine.wineType), wine.appellation, wine.regionPath.subregion, wine.regionPath.region, countryName(wine.country)].filter(Boolean).join(" · ")}</p>
            </div>
            <div className={s.summary}>
              <div>
                <span className="eyebrow">Tastings</span>
                <span className={`${s.summaryValue} num`}>{tastings.length}</span>
              </div>
              <div>
                <span className="eyebrow">{rated.length > 1 ? `Mean of ${rated.length}` : "Your score"}</span>
                <span className={s.summaryValue}>{mean === null ? <span className={s.unknown} style={{ fontSize: "var(--text-sm)", fontWeight: 400 }}>Unrated</span> : <ScoreMark score={formatScore(Math.round(mean * 10) / 10)} size="var(--text-lg)" />}</span>
              </div>
              <div>
                <span className="eyebrow">Last tasted</span>
                <span className={s.summaryValue} style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                  {tastings[0] ? formatDate(tastings[0].tastedOn, locale, "medium") : "—"}
                </span>
              </div>
            </div>
            <dl className={s.facts}>
              <Fact label="Producer" value={wine.producer?.name} p={prov.producer} />
              <Fact label="Vintage" value={vintage ?? null} p={prov.vintage} />
              <Fact label="Type" value={wineTypeLabel(wine.wineType)} p={prov.wineType} />
              <Fact
                label="Grapes"
                value={wine.grapes.length ? wine.grapes.map((g) => (g.percentage ? `${g.grape} ${Number(g.percentage)}%` : g.grape)).join(", ") : null}
                p={prov.grapes}
              />
              <Fact label="Appellation" value={wine.appellation} p={prov.appellation} />
              <Fact label="Region" value={[wine.regionPath.region, wine.regionPath.subregion].filter(Boolean).join(" › ") || null} p={prov.region} />
              <Fact label="Country" value={countryName(wine.country)} p={prov.country} />
              <Fact label="Alcohol" value={wine.alcoholPct ? `${formatNumber(Number(wine.alcoholPct), locale, 1)}% vol` : null} p={prov.alcoholPct} />
            </dl>
            <div className={s.actions}>
              <ButtonLink variant="primary" icon="plus" href={`/wines/${wine.id}/taste`}>
                Record another tasting
              </ButtonLink>
              <ButtonLink icon="edit" href={`/wines/${wine.id}/edit`}>
                Edit wine
              </ButtonLink>
              <ButtonLink variant="ghost" icon="download" href={`/api/wines/${wine.id}/export`} prefetch={false}>
                Export
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>

      {sameWine.length > 0 && (
        <section aria-labelledby="dupes-title">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="dupes-title">
              Possible duplicate
            </h2>
          </div>
          <Notice tone="warning" title="Another record has the same producer, name and vintage">
            Review it, and if it&rsquo;s the same wine, merge its tastings into this record.
          </Notice>
          <div className={s.related} style={{ marginTop: "var(--space-3)" }}>
            {sameWine.map((d) => {
              const label = [d.producer, d.name, d.vintage ?? (d.isNonVintage ? "NV" : null)].filter(Boolean).join(" ");
              return (
                <div key={d.id} className={s.relatedRow} style={{ alignItems: "center" }}>
                  <Link href={`/wines/${d.id}`}>
                    {label} · {plural(d.tastings, "tasting")}
                  </Link>
                  <MergeDuplicate targetId={wine.id} source={{ id: d.id, label, tastings: d.tastings }} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="tastings-title">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle} id="tastings-title">
            Tastings
          </h2>
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Each occasion kept separately
          </span>
        </div>
        {tastings.length === 0 ? (
          <p className="muted" style={{ padding: "var(--space-4) 0" }}>
            No tastings recorded for this wine yet.
          </p>
        ) : (
          tastings.map((t, i) => <TastingRecord key={t.id} t={t} wineId={wine.id} locale={locale} highlighted={t.id === savedId} index={i} total={tastings.length} />)
        )}
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-title">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="related-title">
              More from {wine.producer?.name}
            </h2>
          </div>
          <div className={s.related}>
            {related.map((r) => (
              <Link key={r.id} href={`/wines/${r.id}`} className={s.relatedRow}>
                <span>{wineTitle(r)}</span>
                <span className="muted">
                  {plural(r.tastings, "tasting")}
                  {r.bestScore ? ` · best ${formatScore(r.bestScore)}` : ""}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {wine.sources.length > 0 && (
        <section aria-labelledby="sources-title">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="sources-title">
              Provenance
            </h2>
          </div>
          {wine.sources.map((src) => (
            <div key={src.id} className={s.sourceRecord}>
              <p>
                Label read by <strong>{src.provider === "anthropic" ? "Claude vision" : src.provider}</strong> on {formatDate(src.createdAt.toISOString().slice(0, 10), locale)}
                {typeof src.confidence === "number" ? ` · ${Math.round(src.confidence * 100)}% confidence` : ""}. Fields marked &ldquo;from label&rdquo; were confirmed by you before saving.
              </p>
              {src.extractedText && (
                <details>
                  <summary className="muted" style={{ cursor: "pointer", fontSize: "var(--text-xs)" }}>
                    Text read from the label
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-xs)" }}>{src.extractedText}</pre>
                </details>
              )}
            </div>
          ))}
        </section>
      )}

      <section aria-label="Danger zone" style={{ borderTop: "1px solid var(--rule)", paddingTop: "var(--space-5)" }}>
        <DeleteWineButton wineId={wine.id} title={title} tastings={tastings.length} />
      </section>
    </div>
  );
}
