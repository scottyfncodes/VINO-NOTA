import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getPreferences } from "@/server/account";
import { overviewStats } from "@/server/analytics";
import { recognitionStatus } from "@/server/recognition";
import { getStorage } from "@/server/storage";
import { plural } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink, SectionHead } from "@/components/ui/primitives";
import { emailConfigured } from "@/server/email";
import { CurrencyPreference, DeleteAccount, EmailVerification, SignOutButton } from "./SettingsClient";
import s from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const sp = await searchParams;
  // Set when a confirmation link lands here; Better Auth adds ?error=… for a bad or expired link.
  const linkResult = sp.error ? "invalid" : sp.verify === "done" ? "verified" : null;
  const [prefs, stats] = await Promise.all([getPreferences(user.id), overviewStats(user.id)]);
  const recognition = recognitionStatus();
  const storage = getStorage().kind;
  return (
    <div className={s.page}>
      <PageHeader back={{ href: "/", label: "Atlas" }} eyebrow="Account" title="Settings" />
      <section className={s.section} aria-labelledby="acct">
        <SectionHead id="acct" index="01" title={user.name} />
        <div className={s.body}>
          <p className={s.lede}>
            Signed in as <span className={s.email}>{user.email}</span>. Your journal holds {plural(stats.wines, "wine")} and {plural(stats.tastings, "tasting")}, visible only to you.
          </p>
          <EmailVerification email={user.email} verified={user.emailVerified} canSend={emailConfigured()} linkResult={linkResult} />
          <div>
            <SignOutButton />
          </div>
        </div>
      </section>

      <section className={s.section} aria-labelledby="prefs">
        <SectionHead id="prefs" index="02" title="Preferences" />
        <div className={s.body}>
          <CurrencyPreference initial={prefs.defaultCurrency} />
        </div>
      </section>

      <section className={s.section} aria-labelledby="export">
        <SectionHead id="export" index="03" title="Export your journal" />
        <div className={s.body}>
          <p className={s.text}>
            The JSON export is complete and portable: every wine, tasting, observation, tag and the provenance of each field. The CSV has one row per tasting for spreadsheets.
            Photos are listed by id and can be downloaded individually from each wine.
          </p>
          <div className={s.buttons}>
            <ButtonLink href="/api/export?format=json" icon="download" prefetch={false}>
              Download JSON
            </ButtonLink>
            <ButtonLink href="/api/export?format=csv" icon="download" prefetch={false}>
              Download CSV
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className={s.section} aria-labelledby="services">
        <SectionHead id="services" index="04" title="Services" />
        <dl className={s.services}>
          <dt>Label reading</dt>
          <dd>{recognition.available ? `On — ${recognition.provider}. Label photos are sent to it only when you capture a label.` : "Not configured. Details are entered by hand."}</dd>
          <dt>Photo storage</dt>
          <dd>{storage === "vercel-blob" ? "Private cloud storage" : storage === "local" ? "Local development storage" : "Not configured — photos can't be saved"}</dd>
          <dt>Reference data</dt>
          <dd>
            Missing label details may be suggested from a shared wine reference catalog, marked “From catalog”. It includes data from{" "}
            <a href="https://www.wikidata.org/" rel="noopener noreferrer" target="_blank">
              Wikidata
            </a>{" "}
            (CC0). Your tastings, notes and photos are never added to it.
          </dd>
        </dl>
      </section>

      <section className={`${s.section} ${s.danger}`} aria-labelledby="danger">
        <SectionHead id="danger" index="05" title="Delete account" />
        <div className={s.body}>
          <p className={s.text}>Removes your account and permanently deletes all of your records and photos.</p>
          <div>
            <DeleteAccount email={user.email} />
          </div>
        </div>
      </section>
    </div>
  );
}
