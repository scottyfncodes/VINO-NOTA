import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getWineDetail, wineToInput } from "@/server/catalog/wines";
import { NotFoundError } from "@/server/errors";
import { wineTitle } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { WineEditor } from "@/components/capture/Editors";

export const metadata: Metadata = { title: "Edit wine" };

export default async function EditWinePage({ params }: PageProps<"/wines/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const wine = await getWineDetail(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
      <PageHeader back={{ href: `/wines/${id}`, label: wineTitle(wine) }} compact eyebrow="Edit identity" title="Wine details" lede="Changes apply to every tasting of this wine. Any field you change is recorded as entered by you." />
      <WineEditor wineId={id} initial={wineToInput(wine)} />
    </div>
  );
}
