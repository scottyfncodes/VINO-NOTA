import Link from "next/link";
import { formatScore } from "@/lib/domain/score";
import { countryName } from "@/lib/domain/countries";
import { wineTypeLabel, vintageLabel } from "@/lib/domain/wine";
import { formatDate } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import s from "./wine.module.css";

/** Wine-type key colour, shown as a spine on thumbnails and placeholders. */
export function bandClass(wineType: string) {
  return s[`band-${wineType}`] ?? s["band-other"];
}

export function WineThumb({ imageId, wineType, alt, size = "thumb", priority }: { imageId: string | null; wineType: string; alt: string; size?: "thumb" | "display"; priority?: boolean }) {
  return (
    <div className={`${s.thumb} ${bandClass(wineType)} ${size === "display" ? s.thumbDisplay : ""}`}>
      {imageId ? (
        // Private, authenticated image route; next/image optimisation would bypass the owner check.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/images/${imageId}?size=${size}`} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
      ) : (
        <div className={s.placeholder} aria-hidden="true">
          <Icon name="bottle" size={size === "display" ? 40 : 26} />
          {size === "display" && <span className={s.placeholderNote}>No photograph</span>}
        </div>
      )}
    </div>
  );
}

export function ScoreMark({ score, size = "1.625rem", outOf }: { score: string | number | null; size?: string; outOf?: boolean }) {
  if (score === null || score === undefined) return <span className={s.scoreUnrated}>Unrated</span>;
  return (
    <span className={s.scoreWrap}>
      <span className={s.scoreMark} style={{ fontSize: size }} aria-label={`${formatScore(score)} out of 10`}>
        {formatScore(score)}
      </span>
      {outOf && (
        <span className={s.scoreOutOf} aria-hidden="true">
          /10
        </span>
      )}
    </span>
  );
}

export type EntryProps = {
  id: string;
  wineId: string;
  tastedOn: string;
  score: string | null;
  wineName: string;
  vintage: number | null;
  isNonVintage: boolean;
  wineType: string;
  producer: string | null;
  country?: string | null;
  regionName?: string | null;
  parentRegionName?: string | null;
  impression?: string | null;
  imageId: string | null;
  price?: string | null;
  currency?: string | null;
};

export function EntryRow({ e, locale }: { e: EntryProps; locale: string }) {
  const vintage = vintageLabel(e.vintage, e.isNonVintage);
  const origin = [e.parentRegionName ?? e.regionName, countryName(e.country)].filter(Boolean).join(", ");
  return (
    <Link href={`/wines/${e.wineId}#tasting-${e.id}`} className={s.entry}>
      <WineThumb imageId={e.imageId} wineType={e.wineType} alt="" />
      <div className={s.entryBody}>
        {e.producer && <span className={s.entryProducer}>{e.producer}</span>}
        <span className={s.entryTitle}>
          {e.wineName}
          {vintage && <span className="num"> {vintage}</span>}
        </span>
        <span className={s.entryMeta}>
          <span className={s.typeKey}>
            <span className={`${s.typeDot} ${bandClass(e.wineType)}`} aria-hidden="true" />
            {wineTypeLabel(e.wineType)}
          </span>
          {origin && <span>{origin}</span>}
        </span>
        {e.impression && <p className={s.entryImpression}>{e.impression}</p>}
      </div>
      <div className={s.entryAside}>
        <ScoreMark score={e.score} />
        <span className={s.entryDate}>{formatDate(e.tastedOn, locale, "medium")}</span>
      </div>
    </Link>
  );
}

export function WineCard({
  href,
  imageId,
  wineType,
  producer,
  title,
  score,
  caption,
}: {
  href: string;
  imageId: string | null;
  wineType: string;
  producer: string | null;
  title: string;
  score: string | number | null;
  caption: string;
}) {
  return (
    <Link href={href} className={s.card}>
      <WineThumb imageId={imageId} wineType={wineType} alt="" />
      <div className={s.cardBody}>
        {producer && <span className={s.entryProducer}>{producer}</span>}
        <span className={s.cardTitle}>{title}</span>
        <span className={s.cardRow}>
          <span className={s.cardCaption}>{caption}</span>
          <ScoreMark score={score} size="1.375rem" />
        </span>
      </div>
    </Link>
  );
}

export { s as wineStyles };
