import { Wordmark } from "@/components/shell/Wordmark";
import s from "./auth.module.css";

export function Intro() {
  return (
    <section className={s.intro}>
      <div className={s.nameplate}>
        <Wordmark size="2rem" />
        <span className={s.nameplateNote}>Tasting archive</span>
      </div>
      <h1 className={s.title}>A private field journal for the wines you drink.</h1>
      <p className={s.lede}>
        Photograph a label, confirm what&rsquo;s in the glass, and record what you noticed. Over time your entries become a searchable
        archive and an honest picture of your own palate.
      </p>
      <ol className={s.contents} aria-label="What Vino Nota does">
        <li className={s.contentsRow}>
          <span className={s.contentsIndex} aria-hidden="true">
            I.
          </span>
          <span className={s.contentsTitle}>Record</span>
          <span>Label, identity and a tasting in under a minute.</span>
        </li>
        <li className={s.contentsRow}>
          <span className={s.contentsIndex} aria-hidden="true">
            II.
          </span>
          <span className={s.contentsTitle}>Return</span>
          <span>Every bottle and every occasion, kept separately.</span>
        </li>
        <li className={s.contentsRow}>
          <span className={s.contentsIndex} aria-hidden="true">
            III.
          </span>
          <span className={s.contentsTitle}>Reflect</span>
          <span>Charts drawn only from what you&rsquo;ve recorded.</span>
        </li>
      </ol>
    </section>
  );
}
