import s from "@/components/shell/states.module.css";

export default function Loading() {
  return (
    <div className={s.skeleton} aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading…</span>
      <div className={`${s.bar} ${s.eyebrow}`} />
      <div className={`${s.bar} ${s.title}`} />
      <div className={s.rule} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={s.row}>
          <div className={`${s.bar} ${s.thumb}`} />
          <div className={s.lines}>
            <div className={`${s.bar} ${s.short}`} />
            <div className={`${s.bar} ${s.long}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
