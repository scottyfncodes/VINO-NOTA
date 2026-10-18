import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { favouriteTastings, loadAnalyticsRows, overviewStats, recentTastings } from "@/server/analytics";
import { getRequestLocale } from "@/server/locale";
import { personalInsight, sampleStrength } from "@/lib/domain/analytics";
import { countryName } from "@/lib/domain/countries";
import { wineTypeLabel } from "@/lib/domain/wine";
import { formatDate, formatNumber, plural, wineTitle } from "@/lib/format";
import { Wordmark } from "@/components/shell/Wordmark";
import { ButtonLink } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ScoreMark, WineCard, WineThumb, wineStyles } from "@/components/wine/display";
import s from "@/components/atlas/atlas.module.css";

export const metadata: Metadata = { title: "Atlas" };

function Masthead({ name, locale }: { name: string; locale: string }) {
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return (
    <>
      <div className={s.masthead}>
        <Wordmark size="1.5rem" />
        <div className={s.mastheadMeta}>
          <ButtonLink href="/settings" variant="ghost" iconOnly icon="user" aria-label="Account and settings" />
        </div>
      </div>
      <p className={s.dateline}>
        <span>The private journal of {name}</span>
        <span suppressHydrationWarning>{today}</span>
      </p>
    </>
  );
}

function Welcome() {
  return (
    <section className={s.welcome} aria-labelledby="welcome-title">
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <p className="eyebrow">Atlas</p>
        <h1 className={s.welcomeTitle} id="welcome-title">
          Your journal begins with a single bottle.
        </h1>
        <p className="muted" style={{ maxWidth: "36rem" }}>
          Nothing has been recorded yet, so there&rsquo;s nothing to chart. Everything you see here will be drawn from your own entries.
        </p>
        <div>
          <ButtonLink href="/capture" variant="primary" icon="capture">
            Record your first tasting
          </ButtonLink>
        </div>
      </div>
      <ol className={s.welcomeSteps} role="list">
        <li className={s.welcomeStep}>
          <span className={s.welcomeStepTitle}>Photograph the label</span>
          <span className={s.welcomeStepBody}>Or skip the photo and type the details yourself.</span>
        </li>
        <li className={s.welcomeStep}>
          <span className={s.welcomeStepTitle}>Confirm what&rsquo;s in the glass</span>
          <span className={s.welcomeStepBody}>Producer, wine, vintage and origin — corrected by you.</span>
        </li>
        <li className={s.welcomeStep}>
          <span className={s.welcomeStepTitle}>Note what you noticed</span>
          <span className={s.welcomeStepBody}>A score out of ten and as much or as little detail as you like.</span>
        </li>
      </ol>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <p className="eyebrow">What your entries unlock</p>
        <ul className={s.unlocks}>
          <li>
            <strong>First tasting</strong> A searchable archive and a page for every bottle.
          </li>
          <li>
            <strong>A few ratings</strong> Your rating distribution and tasting chronology.
          </li>
          <li>
            <strong>Prices paid</strong> Where enjoyment and price part ways.
          </li>
          <li>
            <strong>Eight or more</strong> Comparisons between styles and countries, shown with their sample sizes.
          </li>
        </ul>
      </div>
    </section>
  );
}

export default async function AtlasPage() {
  const user = await requireUser();
  const locale = await getRequestLocale();
  const stats = await overviewStats(user.id);
  if (stats.tastings === 0) {
    return (
      <>
        <Masthead name={user.name} locale={locale} />
        <Welcome />
      </>
    );
  }
  const [recent, favourites, rows] = await Promise.all([recentTastings(user.id, 4), favouriteTastings(user.id, 5), loadAnalyticsRows(user.id)]);
  const insight = personalInsight(rows, { wineType: wineTypeLabel, country: (c) => countryName(c) ?? c });
  const recentIds = new Set(recent.map((r) => r.wineId));
  const discoveries = favourites.filter((f) => !recentIds.has(f.wineId)).slice(0, 4);
  const favList = discoveries.length ? discoveries : favourites.slice(0, 4);

  return (
    <>
      <Masthead name={user.name} locale={locale} />
      <section className={s.lead}>
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <p className="eyebrow">Atlas</p>
          <h1 className={s.leadTitle}>
            {plural(stats.tastings, "tasting")} across {plural(stats.wines, "wine")}
            {stats.countries > 0 ? ` from ${plural(stats.countries, "country", "countries")}.` : "."}
          </h1>
        </div>
        <div>
          <ButtonLink href="/capture" variant="primary" icon="capture" block>
            Record a tasting
          </ButtonLink>
        </div>
      </section>

      <section aria-label="Journal figures" className={s.stats}>
        <div className={s.stat}>
          <span className="eyebrow">Wines recorded</span>
          <span className={s.statValue}>{stats.wines}</span>
        </div>
        <div className={s.stat}>
          <span className="eyebrow">Tasting records</span>
          <span className={s.statValue}>{stats.tastings}</span>
        </div>
        <div className={s.stat}>
          <span className="eyebrow">Regions explored</span>
          <span className={s.statValue}>{stats.regions}</span>
          <span className={s.statNote}>
            {plural(stats.countries, "country", "countries")}
          </span>
        </div>
        <div className={s.stat}>
          <span className="eyebrow">Average rating</span>
          <span className={`${s.statValue} ${s.statValueAccent}`}>{stats.meanScore === null ? "—" : formatNumber(stats.meanScore, locale, 1)}</span>
          <span className={s.statNote}>
            {stats.rated === 0 ? "No rated tastings yet" : `Mean of ${plural(stats.rated, "rated tasting")}`}
            {stats.tastings > stats.rated && stats.rated > 0 ? ` · ${stats.tastings - stats.rated} unrated excluded` : ""}
          </span>
        </div>
      </section>

      {insight && (
        <section className={s.section} aria-labelledby="insight-title">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="insight-title">
              From your records
            </h2>
            <Link href="/compendium" className={s.sectionLink}>
              Compendium
            </Link>
          </div>
          <div className={s.insight}>
            <p className={s.insightStatement}>{insight.statement}</p>
            <table className={s.evidence}>
              <caption className="visually-hidden">Evidence behind this observation</caption>
              <thead>
                <tr>
                  <th scope="col">{insight.kind === "wineType" ? "Style" : "Country"}</th>
                  <th scope="col">Rated</th>
                  <th scope="col">Mean score</th>
                </tr>
              </thead>
              <tbody>
                {insight.groups.map((g) => (
                  <tr key={g.key}>
                    <td>{g.label}</td>
                    <td className="num">{g.n}</td>
                    <td className="num">{formatNumber(g.mean, locale, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={s.caveat}>
              Calculated from {plural(insight.totalRated, "rated tasting")}; groups with fewer than three are left out.{" "}
              {sampleStrength(insight.groups[insight.groups.length - 1].n) !== "established" && "These are small samples — a pattern to watch, not a conclusion."}
            </p>
          </div>
        </section>
      )}

      <div className={s.twoCol}>
        <section className={s.section} aria-labelledby="recent-title">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="recent-title">
              Recently tasted
            </h2>
            <Link href="/journal" className={s.sectionLink}>
              All entries
            </Link>
          </div>
          <div className={wineStyles.grid}>
            {recent.map((r) => (
              <WineCard
                key={r.id}
                href={`/wines/${r.wineId}#tasting-${r.id}`}
                imageId={r.imageId}
                wineType={r.wineType}
                producer={r.producer}
                title={wineTitle(r)}
                score={r.score}
                caption={formatDate(r.tastedOn, locale, "short")}
              />
            ))}
          </div>
        </section>

        <section className={s.section} aria-labelledby="fav-title">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="fav-title">
              {discoveries.length ? "Highly rated" : "Favourites"}
            </h2>
            <span className={s.sectionLink}>8.0 and above</span>
          </div>
          {favList.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              Nothing rated 8.0 or higher yet. Your standouts will collect here.
            </p>
          ) : (
            <div className={s.favourites}>
              {favList.map((f) => (
                <Link key={f.id} href={`/wines/${f.wineId}#tasting-${f.id}`} className={s.fav}>
                  <WineThumb imageId={f.imageId} wineType={f.wineType} alt="" />
                  <span>
                    {f.producer && <span className={s.favMeta}>{f.producer}</span>}
                    <span className={s.favTitle} style={{ display: "block" }}>
                      {wineTitle(f)}
                    </span>
                    <span className={s.favMeta}>{formatDate(f.tastedOn, locale, "medium")}</span>
                  </span>
                  <ScoreMark score={f.score} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-7)", display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <Icon name="info" size={14} /> Every figure on this page is calculated from your saved records.
      </p>
    </>
  );
}
