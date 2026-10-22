import Link from "next/link";
import { Wordmark } from "@/components/shell/Wordmark";
import s from "@/components/shell/states.module.css";

export default function NotFound() {
  return (
    <main id="main" className={s.standalone}>
      <div className={s.message}>
        <Wordmark />
        <p className="eyebrow">Not found</p>
        <h1 className={s.messageTitle}>This page doesn&rsquo;t exist.</h1>
        <p className={s.messageBody}>
          <Link href="/">Return to Vino Nota</Link>
        </p>
      </div>
    </main>
  );
}
