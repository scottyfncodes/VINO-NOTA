import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import s from "./shell.module.css";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className={s.pageHeader}>
      {back && (
        <Link href={back.href} className={s.back}>
          <Icon name="back" size={18} /> {back.label}
        </Link>
      )}
      <div className={s.pageHeaderTop}>
        <div style={{ display: "grid", gap: "var(--space-1)", minWidth: 0 }}>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={s.pageTitle}>{title}</h1>
        </div>
        {actions && <div style={{ display: "flex", gap: "var(--space-2)", flex: "none" }}>{actions}</div>}
      </div>
      {lede && <p className={s.pageLede}>{lede}</p>}
    </header>
  );
}

export { s as shellStyles };
