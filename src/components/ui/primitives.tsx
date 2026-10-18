import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";
type ButtonStyleProps = { variant?: Variant; size?: "default" | "small"; block?: boolean; icon?: IconName; iconOnly?: boolean };

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function buttonClass({ variant = "secondary", size = "default", block, iconOnly }: ButtonStyleProps, extra?: string) {
  return cls(s.button, s[variant], size === "small" && s.small, block && s.block, iconOnly && s.iconOnly, extra);
}

export function Button({ variant, size, block, icon, iconOnly, className, children, type = "button", ...rest }: ButtonStyleProps & ComponentProps<"button">) {
  return (
    <button type={type} className={buttonClass({ variant, size, block, iconOnly }, className)} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, icon, iconOnly, className, children, ...rest }: ButtonStyleProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, block, iconOnly }, className)} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  id,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cls(s.field, className)}>
      <label className={s.label} htmlFor={id}>
        {label}
        {optional && <span className={s.optional}> · optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p className={s.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className={s.error} id={`${id}-error`} role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input className={cls(s.input, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({ className, invalid, ...rest }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea className={cls(s.textarea, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select className={cls(s.select, className)} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  legend,
  hideLegend,
}: {
  name: string;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  legend: string;
  hideLegend?: boolean;
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend className={hideLegend ? "visually-hidden" : s.label} style={{ marginBottom: "var(--space-1)", padding: 0 }}>
        {legend}
      </legend>
      <div className={s.segmented}>
        {options.map((o) => (
          <label key={o.value} className={s.segment}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Badge({ tone = "neutral", children, title }: { tone?: "neutral" | "success" | "warning" | "accent"; children: ReactNode; title?: string }) {
  const toneClass = { neutral: s.badgeNeutral, success: s.badgeSuccess, warning: s.badgeWarning, accent: s.badgeAccent }[tone];
  return (
    <span className={cls(s.badge, toneClass)} title={title}>
      {children}
    </span>
  );
}

export function Notice({ tone = "info", title, children, role }: { tone?: "info" | "warning" | "error" | "success"; title?: ReactNode; children?: ReactNode; role?: "status" | "alert" }) {
  const icon: IconName = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  const toneClass = { info: s.noticeInfo, warning: s.noticeWarning, error: s.noticeError, success: s.noticeSuccess }[tone];
  return (
    <div className={cls(s.notice, toneClass)} role={role ?? (tone === "error" ? "alert" : "status")}>
      <Icon name={icon} size={18} />
      <div>
        {title && <p className={s.noticeTitle}>{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className={s.empty}>
      <h2 className={s.emptyTitle}>{title}</h2>
      {children && <div className={s.emptyBody}>{children}</div>}
      {action}
    </section>
  );
}

export function Disclosure({ title, meta, children, defaultOpen }: { title: ReactNode; meta?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className={s.disclosure} open={defaultOpen}>
      <summary className={s.disclosureSummary}>
        <span className={s.disclosureTitle}>{title}</span>
        {meta && <span className={s.disclosureMeta}>{meta}</span>}
        <Icon name="down" size={18} />
      </summary>
      <div className={s.disclosureBody}>{children}</div>
    </details>
  );
}

export { cls, s as uiStyles };
