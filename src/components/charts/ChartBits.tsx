import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import s from "./charts.module.css";

export function Panel({ id, title, sub, index, children }: { id: string; title: string; sub: ReactNode; index?: number; children: ReactNode }) {
  return (
    <section className={s.panel} aria-labelledby={`${id}-title`} id={id}>
      <div className={s.panelHead}>
        {index !== undefined && (
          <p className={s.panelIndex} aria-hidden="true">
            Fig. {index}
          </p>
        )}
        <div className={s.panelHeadText}>
          <h2 className={s.panelTitle} id={`${id}-title`}>
            {title}
          </h2>
          <p className={s.panelSub}>{sub}</p>
        </div>
      </div>
      <div className={s.panelBody}>{children}</div>
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
  return (
    <div className={s.empty}>
      <span className={s.emptyMark} aria-hidden="true">
        Not enough data
      </span>
      <div>{children}</div>
    </div>
  );
}

export function DataTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <details className={s.tableDetails}>
      <summary className={s.tableSummary}>
        <Icon name="list" size={16} />
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
