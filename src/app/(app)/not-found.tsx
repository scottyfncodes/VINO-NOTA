import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <section style={{ display: "grid", gap: "var(--space-4)", padding: "var(--space-7) 0", maxWidth: "32rem" }}>
      <p className="eyebrow">Not found</p>
      <h1 style={{ fontSize: "var(--text-xl)" }}>There&rsquo;s no record here.</h1>
      <p className="muted">It may have been deleted or merged into another wine.</p>
      <div>
        <ButtonLink href="/journal">Open the Journal</ButtonLink>
      </div>
    </section>
  );
}
