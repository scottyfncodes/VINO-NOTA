import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { CaptureFlow } from "@/components/capture/client";
import { requireUser } from "@/server/auth/session";
import { getPreferences } from "@/server/account";
import { recognitionStatus } from "@/server/recognition";

export const metadata: Metadata = { title: "Record a tasting" };

export default async function CapturePage() {
  const user = await requireUser();
  const [prefs, recognition] = [await getPreferences(user.id), recognitionStatus()];
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
      <PageHeader eyebrow="New field record" title="Record a tasting" />
      <CaptureFlow recognitionAvailable={recognition.available} providerName={recognition.provider} defaultCurrency={prefs.defaultCurrency} />
    </div>
  );
}
