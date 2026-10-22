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
  compact,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** For long titles, such as a wine's name on its editing screens. */
  compact?: boolean;
}) {
  return (
    <header className={s.pageHeader}>
      {back && (
        <Link href={back.href} className={s.back}>
          <Icon name="back" size={16} /> <span>{back.label}</span>
        </Link>
      )}
      <div className={s.pageHeaderTop}>
        <div className={s.pageHeaderText}>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={compact ? `${s.pageTitle} ${s.pageTitleCompact}` : s.pageTitle}>{title}</h1>
        </div>
        {actions && <div className={s.pageHeaderActions}>{actions}</div>}
      </div>
      {lede && <p className={s.pageLede}>{lede}</p>}
    </header>
  );
}

export { s as shellStyles };
