"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import s from "./ui.module.css";

/**
 * Modal sheet built on the native <dialog> element (focus trapping, Escape and
 * inert background come from the platform). Bottom sheet on phones, centred on wider screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = labelledBy ?? "sheet-title";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className={s.sheetHeader}>
            <h2 className={s.sheetTitle} id={titleId}>
              {title}
            </h2>
            <button type="button" className={`${s.button} ${s.ghost} ${s.iconOnly}`} onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className={s.sheetBody}>{children}</div>
          {footer && <div className={s.sheetFooter}>{footer}</div>}
        </>
      )}
    </dialog>
  );
}
