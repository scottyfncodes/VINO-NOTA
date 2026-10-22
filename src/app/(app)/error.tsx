"use client";

import { Button, ButtonLink } from "@/components/ui/primitives";
import s from "@/components/shell/states.module.css";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className={s.message} role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1 className={s.messageTitle}>This page couldn&rsquo;t be loaded.</h1>
      <p className={s.messageBody}>Your records are safe. This is usually a temporary connection problem — try again in a moment.</p>
      <div className={s.actions}>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/">Go to Atlas</ButtonLink>
      </div>
    </section>
  );
}
