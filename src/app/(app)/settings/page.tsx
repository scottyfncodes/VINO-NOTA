import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getPreferences } from "@/server/account";
import { overviewStats } from "@/server/analytics";
import { recognitionStatus } from "@/server/recognition";
import { getStorage } from "@/server/storage";
import { plural } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink } from "@/components/ui/primitives";
import { CurrencyPreference, DeleteAccount, SignOutButton } from "./SettingsClient";
import s from "@/components/atlas/atlas.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, stats] = await Promise.all([getPreferences(user.id), overviewStats(user.id)]);
  const recognition = recognitionStatus();
  const storage = getStorage().kind;
  return (
    <div style={{ maxWidth: "var(--content-max)" }}>
      <PageHeader back={{ href: "/", label: "Atlas" }} eyebrow="Account" title="Settings" />
      <section className={s.section} style={{ paddingTop: 0 }} aria-labelledby="acct">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle} id="acct">
            {user.name}
          </h2>
        </div>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
          Signed in as {user.email}. Your journal holds {plural(stats.wines, "wine")} and {plural(stats.tastings, "tasting")}, visible only to you.
        </p>
        <SignOutButton />
      </section>

      <section className={s.section} aria-labelledby="prefs">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle} id="prefs">
            Preferences
          </h2>
        </div>
        <CurrencyPreference initial={prefs.defaultCurrency} />
      </section>

      <section className={s.section} aria-labelledby="export">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle} id="export">
            Export your journal
          </h2>
        </div>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
          The JSON export is complete and portable: every wine, tasting, observation, tag and the provenance of each field. The CSV has one row per tasting for spreadsheets.
          Photos are listed by id and can be downloaded individually from each wine.
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <ButtonLink href="/api/export?format=json" icon="download" prefetch={false}>
            Download JSON
          </ButtonLink>
          <ButtonLink href="/api/export?format=csv" icon="download" prefetch={false}>
            Download CSV
          </ButtonLink>
        </div>
      </section>

      <section className={s.section} aria-labelledby="services">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle} id="services">
            Services
          </h2>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--space-2) var(--space-5)", fontSize: "var(--text-sm)" }}>
          <dt className="muted">Label reading</dt>
          <dd>{recognition.available ? `On — ${recognition.provider}. Label photos are sent to it only when you capture a label.` : "Not configured. Details are entered by hand."}</dd>
          <dt className="muted">Photo storage</dt>
          <dd>{storage === "vercel-blob" ? "Private cloud storage" : storage === "local" ? "Local development storage" : "Not configured — photos can't be saved"}</dd>
          <dt className="muted">Reference data</dt>
          <dd>
            Missing label details may be suggested from a shared wine reference catalog, marked “From catalog”. It includes data from{" "}
            <a href="https://www.wikidata.org/" rel="noopener noreferrer" target="_blank">
              Wikidata
            </a>{" "}
            (CC0). Your tastings, notes and photos are never added to it.
          </dd>
        </dl>
      </section>

      <section className={s.section} aria-labelledby="danger">
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle} id="danger">
            Delete account
          </h2>
        </div>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
          Removes your account and permanently deletes all of your records and photos.
        </p>
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
