import { Wordmark } from "@/components/shell/Wordmark";
import s from "./auth.module.css";

export function Intro() {
  return (
    <section className={s.intro}>
      <Wordmark size="1.75rem" />
      <h1 className={s.title}>A private field journal for the wines you drink.</h1>
      <p className={s.lede}>
        Photograph a label, confirm what&rsquo;s in the glass, and record what you noticed. Over time your entries become a searchable
        archive and an honest picture of your own palate.
      </p>
      <div className={s.plates} aria-label="What Vino Nota does">
        <div className={s.plate}>
          <span className={s.plateTitle}>Record</span>
          Label, identity and a tasting in under a minute.
        </div>
        <div className={s.plate}>
          <span className={s.plateTitle}>Return</span>
          Every bottle and every occasion, kept separately.
        </div>
        <div className={s.plate}>
          <span className={s.plateTitle}>Reflect</span>
          Charts drawn only from what you&rsquo;ve recorded.
        </div>
      </div>
    </section>
  );
}
