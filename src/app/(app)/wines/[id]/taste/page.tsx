import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getWineDetail } from "@/server/catalog/wines";
import { getTasting, tastingToInput } from "@/server/tastings";
import { getPreferences } from "@/server/account";
import { NotFoundError } from "@/server/errors";
import { wineTitle } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { TastingEditor } from "@/components/capture/client";

export const metadata: Metadata = { title: "New tasting" };

export default async function NewTastingPage({ params, searchParams }: PageProps<"/wines/[id]/taste">) {
  const { id } = await params;
  const { from } = await searchParams;
  const user = await requireUser();
  const wine = await getWineDetail(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const prefs = await getPreferences(user.id);
  let repeatFrom;
  if (typeof from === "string") {
    const source = await getTasting(user.id, from).catch(() => null);
    if (source && source.wineId === id) repeatFrom = tastingToInput(source);
  }
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
      <PageHeader
        back={{ href: `/wines/${id}`, label: wineTitle(wine) }}
        compact
        eyebrow={repeatFrom ? "Taste again" : "New tasting"}
        title={wineTitle(wine)}
        lede={repeatFrom ? "Purchase and venue details are carried over from the earlier tasting. Your score and observations start fresh." : "A new occasion with this wine. Earlier tastings stay exactly as they are."}
      />
      <TastingEditor mode="new" wineId={id} wineType={wine.wineType} repeatFrom={repeatFrom} defaultCurrency={prefs.defaultCurrency} />
    </div>
  );
}
