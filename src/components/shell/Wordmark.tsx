import s from "./shell.module.css";

export function Wordmark({ size }: { size?: string }) {
  return (
    <span className={s.wordmark} style={size ? { fontSize: size } : undefined} aria-label="Vino Nota">
      <span className={s.wordmarkVino} aria-hidden="true">
        Vino
      </span>
      <span className={s.wordmarkRule} aria-hidden="true" />
      <span className={s.wordmarkNota} aria-hidden="true">
        Nota
      </span>
    </span>
  );
}
