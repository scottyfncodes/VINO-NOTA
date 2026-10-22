import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/auth/session";
import { journalFacets, listWines, parseJournalQuery, searchJournal } from "@/server/journal";
import { overviewStats } from "@/server/analytics";
import { getRequestLocale } from "@/server/locale";
import { formatScore } from "@/lib/domain/score";
import { formatDate, plural, wineTitle } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink, EmptyState, Notice } from "@/components/ui/primitives";
import { JournalControls } from "@/components/journal/JournalControls";
import { EntryRow, WineCard, wineStyles } from "@/components/wine/display";
import s from "@/components/journal/journal.module.css";

export const metadata: Metadata = { title: "Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const user = await requireUser();
  const sp = await searchParams;
  const query = parseJournalQuery(sp);
  const byWine = sp.by === "wine";
  const grid = sp.view === "grid";
  const locale = await getRequestLocale();
  const [stats, facets] = await Promise.all([overviewStats(user.id), journalFacets(user.id)]);

  const tabHref = (wine: boolean) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    if (wine) next.set("by", "wine");
    else next.delete("by");
    const str = next.toString();
    return str ? `/journal?${str}` : "/journal";
  };

  const header = (
    <PageHeader
      eyebrow="The archive"
      title="Journal"
      lede={stats.tastings > 0 ? "Every occasion you have recorded, searchable by wine, place, grape and your own words." : undefined}
      actions={stats.tastings > 0 ? <ButtonLink href="/capture" variant="primary" icon="plus" size="small">Record</ButtonLink> : undefined}
    />
  );

  if (stats.tastings === 0) {
    return (
      <>
        {header}
        {sp.deleted && <Notice tone="success" title="Wine deleted" />}
        <EmptyState mark="The archive is empty" title="No entries yet" action={<ButtonLink href="/capture" variant="primary" icon="capture">Record your first tasting</ButtonLink>}>
          Each tasting you record appears here, searchable by wine, producer, vintage, grape, region and anything you wrote in your notes.
        </EmptyState>
      </>
    );
  }

  const filtered = Boolean(query.q || query.type || query.country || query.region || query.grape || query.scoreMin !== undefined || query.scoreMax !== undefined || query.from || query.to || query.ids);
  const tastingResults = byWine ? null : await searchJournal(user.id, query);
  const wineResults = byWine ? await listWines(user.id, query) : null;
  const count = byWine ? wineResults!.wines.length : tastingResults!.entries.length;
  const truncated = byWine ? wineResults!.truncated : tastingResults!.truncated;

  return (
    <>
      {header}
      {sp.deleted && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Notice tone="success" title="Wine deleted" />
        </div>
      )}
      <nav className={s.tabs} aria-label="Journal views">
        <Link href={tabHref(false)} className={s.tab} aria-current={!byWine ? "page" : undefined} replace>
          Tastings <span className={s.tabCount}>· {stats.tastings}</span>
        </Link>
        <Link href={tabHref(true)} className={s.tab} aria-current={byWine ? "page" : undefined} replace>
          Wines <span className={s.tabCount}>· {stats.wines}</span>
        </Link>
      </nav>
      <Suspense>
        <JournalControls facets={facets} />
      </Suspense>
      {query.ids && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <Notice tone="info" title={`Showing ${plural(query.ids.length, "tasting")} selected from a chart`}>
            <Link href="/journal">Show all entries</Link>
          </Notice>
        </div>
      )}
      <p className={s.count} aria-live="polite">
        {filtered ? `${plural(count, byWine ? "wine" : "entry", byWine ? "wines" : "entries")} match` : byWine ? plural(count, "wine") : plural(count, "entry", "entries")}
        {truncated && " · showing the first 200; refine your search to see more"}
      </p>
      {count === 0 ? (
        <EmptyState mark="No matching entries" title="Nothing matches" action={<ButtonLink href={byWine ? "/journal?by=wine" : "/journal"}>Clear search and filters</ButtonLink>}>
          Try fewer filters or a different word. Search covers wine and producer names, vintages, grapes, regions, descriptors, tags and your notes.
        </EmptyState>
      ) : byWine ? (
        grid ? (
          <div className={`${wineStyles.grid} ${s.results}`}>
            {wineResults!.wines.map((w) => (
              <WineCard
                key={w.wineId}
                href={`/wines/${w.wineId}`}
                imageId={w.imageId}
                wineType={w.wineType}
                producer={w.producer}
                title={wineTitle(w)}
                score={w.meanScore === null ? null : formatScore(Math.round(w.meanScore * 10) / 10)}
                caption={plural(w.tastingCount, "tasting")}
              />
            ))}
          </div>
        ) : (
          <div className={s.list}>
            {wineResults!.wines.map((w) => (
              <EntryRow
                key={w.wineId}
                locale={locale}
                e={{
                  ...w,
                  id: w.id,
                  tastedOn: w.lastTasted,
                  score: w.meanScore === null ? null : formatScore(Math.round(w.meanScore * 10) / 10),
                  impression: `${plural(w.tastingCount, "tasting")}${w.ratedCount > 1 ? ` · mean of ${w.ratedCount} scores` : ""} · last ${formatDate(w.lastTasted, locale)}`,
                }}
              />
            ))}
          </div>
        )
      ) : grid ? (
        <div className={`${wineStyles.grid} ${s.results}`}>
          {tastingResults!.entries.map((e) => (
            <WineCard
              key={e.id}
              href={`/wines/${e.wineId}#tasting-${e.id}`}
              imageId={e.imageId}
              wineType={e.wineType}
              producer={e.producer}
              title={wineTitle({ name: e.wineName, vintage: e.vintage, isNonVintage: e.isNonVintage })}
              score={e.score}
              caption={formatDate(e.tastedOn, locale, "medium")}
            />
          ))}
        </div>
      ) : (
        <div className={s.list}>
          {tastingResults!.entries.map((e) => (
            <EntryRow key={e.id} e={e} locale={locale} />
          ))}
        </div>
      )}
    </>
  );
}
