import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getWineDetail } from "@/server/catalog/wines";
import { getTasting, tastingToInput } from "@/server/tastings";
import { getPreferences } from "@/server/account";
import { NotFoundError } from "@/server/errors";
import { formatDate, wineTitle } from "@/lib/format";
import { getRequestLocale } from "@/server/locale";
import { PageHeader } from "@/components/shell/PageHeader";
import { TastingEditor } from "@/components/capture/client";

export const metadata: Metadata = { title: "Edit tasting" };

export default async function EditTastingPage({ params }: PageProps<"/tastings/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const tasting = await getTasting(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [wine, prefs, locale] = await Promise.all([getWineDetail(user.id, tasting.wineId), getPreferences(user.id), getRequestLocale()]);
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
      <PageHeader back={{ href: `/wines/${wine.id}#tasting-${id}`, label: wineTitle(wine) }} eyebrow="Edit tasting" title={formatDate(tasting.tastedOn, locale, "long")} lede="Only this tasting changes. Other tastings of the wine are untouched." />
      <TastingEditor mode="edit" wineId={wine.id} tastingId={id} wineType={wine.wineType} initial={tastingToInput(tasting)} defaultCurrency={prefs.defaultCurrency} />
    </div>
  );
}
