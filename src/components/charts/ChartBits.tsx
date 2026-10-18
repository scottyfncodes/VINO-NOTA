import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import s from "./charts.module.css";

export function Panel({ id, title, sub, children }: { id: string; title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <section className={s.panel} aria-labelledby={`${id}-title`} id={id}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle} id={`${id}-title`}>
          {title}
        </h2>
        <p className={s.panelSub}>{sub}</p>
      </div>
      {children}
    </section>
  );
}

export function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={s.figure}>
      <span className="eyebrow">{label}</span>
      <span className={s.figureValue}>{value}</span>
    </div>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className={s.caveat}>
      <Icon name="info" size={14} style={{ flex: "none", marginTop: 2 }} />
      <span>{children}</span>
    </p>
  );
}

export function NotEnough({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}

export function DataTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <details>
      <summary className="muted" style={{ fontSize: "var(--text-xs)", cursor: "pointer", minHeight: "var(--touch)", display: "flex", alignItems: "center" }}>
        View as a table
      </summary>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <caption className="visually-hidden">{caption}</caption>
          {children}
        </table>
      </div>
    </details>
  );
}

export { s as chartStyles };
