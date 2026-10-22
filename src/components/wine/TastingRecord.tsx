import { formatPrice, priceBasisLabel } from "@/lib/domain/currency";
import { CATEGORICAL_DIMENSIONS, OBSERVATION_STATUS_LABEL, STRUCTURAL_DIMENSIONS, type CategoricalKey } from "@/lib/domain/sensory";
import { formatDate } from "@/lib/format";
import type { listTastingsForWine } from "@/server/tastings";
import { ButtonLink } from "@/components/ui/primitives";
import { ScoreMark } from "./display";
import { DeleteTastingButton } from "./WineClient";
import s from "./detail.module.css";

type Tasting = Awaited<ReturnType<typeof listTastingsForWine>>[number];

const BLIND_LABEL = { not_blind: null, blind_unrevealed: "Tasted blind", blind_revealed: "Tasted blind, then revealed" } as const;

export function TastingRecord({ t, wineId, locale, highlighted, index, total }: { t: Tasting; wineId: string; locale: string; highlighted: boolean; index: number; total: number }) {
  const structural = STRUCTURAL_DIMENSIONS.map((d) => ({ d, o: t.observations.find((o) => o.dimension === d.key) })).filter((x) => x.o);
  const aromas = t.observations.filter((o) => o.dimension === "aroma" && o.descriptor);
  const flavors = t.observations.filter((o) => o.dimension === "flavor" && o.descriptor);
  const categorical = t.observations.filter((o) => o.dimension in CATEGORICAL_DIMENSIONS && o.descriptor);
  const price = formatPrice(t.purchasePrice, t.currency, locale);
  const context: [string, string][] = [];
  if (price) context.push(["Price", `${price}${t.priceBasis ? ` · ${priceBasisLabel(t.priceBasis)?.toLowerCase()}` : ""}`]);
  if (t.venue) context.push(["Where", t.venue]);
  if (t.occasion) context.push(["Occasion", t.occasion]);
  if (t.foodPairing) context.push(["With", t.foodPairing]);
  if (t.wouldBuyAgain !== null) context.push(["Buy again", t.wouldBuyAgain ? "Yes" : "No"]);
  const blind = BLIND_LABEL[t.blindStatus];
  if (blind) context.push(["Blind", `${blind}${t.blindGuess ? ` — guessed “${t.blindGuess}”` : ""}`]);
  if (t.servingTempC) context.push(["Served at", `${Number(t.servingTempC)} °C`]);
  if (t.decantMinutes !== null) context.push(["Decanted", `${t.decantMinutes} min`]);
  if (t.bottleProvenance) context.push(["Bottle from", t.bottleProvenance]);
  if (t.storageNotes) context.push(["Storage", t.storageNotes]);
  for (const c of categorical) context.push([CATEGORICAL_DIMENSIONS[c.dimension as CategoricalKey].label, c.descriptor!]);
  const label = formatDate(t.tastedOn, locale, "long");

  return (
    <article id={`tasting-${t.id}`} className={`${s.tasting} ${highlighted ? s.tastingSaved : ""}`} aria-labelledby={`tasting-${t.id}-title`}>
      <header className={s.tastingHead}>
        <div className={s.tastingHeadText}>
          <p className="eyebrow">
            Tasting {total - index} of {total}
          </p>
          <h3 className={s.tastingDate} id={`tasting-${t.id}-title`}>
            {label}
          </h3>
          {t.tags.length > 0 && (
            <p className={s.tags}>
              {t.tags.map((g) => (
                <span key={g}>#{g}</span>
              ))}
            </p>
          )}
        </div>
        <div className={s.tastingScore}>
          <ScoreMark score={t.personalScore} size="var(--text-4xl)" outOf />
        </div>
      </header>
      <div className={s.tastingBody}>
        {t.impression && <p className={s.impression}>{t.impression}</p>}
        {structural.length > 0 && (
          <div className={s.structure} aria-label="Structure">
            {structural.map(({ d, o }) => (
              <div key={d.key} className={s.structureRow}>
                <span className={s.structureName}>{d.label}</span>
                {o!.status === "assessed" && o!.value ? (
                  <>
                    <span className={s.structureTrack} aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`${s.structureCell} ${n <= o!.value! ? s.structureCellOn : ""}`} />
                      ))}
                    </span>
                    <span className={s.structureReading}>{d.scale[o!.value - 1]}</span>
                  </>
                ) : (
                  <span className={s.statusText}>{OBSERVATION_STATUS_LABEL[o!.status]}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {(aromas.length > 0 || flavors.length > 0) && (
          <div className={s.descriptorGroups}>
            {aromas.length > 0 && (
              <div className={s.descriptors}>
                <span className={`eyebrow ${s.descriptorLabel}`}>Nose</span>
                {aromas.map((o) => (
                  <span key={o.id} className={s.descriptor}>
                    {o.descriptor}
                  </span>
                ))}
              </div>
            )}
            {flavors.length > 0 && (
              <div className={s.descriptors}>
                <span className={`eyebrow ${s.descriptorLabel}`}>Palate</span>
                {flavors.map((o) => (
                  <span key={o.id} className={s.descriptor}>
                    {o.descriptor}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {t.notes && <p className={s.notes}>{t.notes}</p>}
        {context.length > 0 && (
          <dl className={s.contextList}>
            {context.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className={s.tastingActions}>
          <ButtonLink size="small" variant="ghost" icon="edit" href={`/tastings/${t.id}/edit`}>
            Edit
          </ButtonLink>
          <ButtonLink size="small" variant="ghost" icon="copy" href={`/wines/${wineId}/taste?from=${t.id}`}>
            Taste again
          </ButtonLink>
          <DeleteTastingButton tastingId={t.id} label={label} />
        </div>
      </div>
    </article>
  );
}
