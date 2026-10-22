import { ButtonLink } from "@/components/ui/primitives";
import s from "@/components/shell/states.module.css";

export default function NotFound() {
  return (
    <section className={s.message}>
      <p className="eyebrow">Not found</p>
      <h1 className={s.messageTitle}>There&rsquo;s no record here.</h1>
      <p className={s.messageBody}>It may have been deleted or merged into another wine.</p>
      <div className={s.actions}>
        <ButtonLink href="/journal">Open the Journal</ButtonLink>
      </div>
    </section>
  );
}
