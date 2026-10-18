"use client";

import { Button, ButtonLink } from "@/components/ui/primitives";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-4)", padding: "var(--space-7) 0", maxWidth: "32rem" }} role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1 style={{ fontSize: "var(--text-xl)" }}>This page couldn&rsquo;t be loaded.</h1>
      <p className="muted">Your records are safe. This is usually a temporary connection problem — try again in a moment.</p>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/">Go to Atlas</ButtonLink>
      </div>
    </section>
  );
}
