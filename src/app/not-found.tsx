import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" style={{ display: "grid", gap: "var(--space-4)", padding: "var(--space-8) var(--gutter)", maxWidth: "36rem", margin: "0 auto" }}>
      <p className="eyebrow">Not found</p>
      <h1 style={{ fontSize: "var(--text-xl)" }}>This page doesn&rsquo;t exist.</h1>
      <p>
        <Link href="/">Return to Vino Nota</Link>
      </p>
    </main>
  );
}
