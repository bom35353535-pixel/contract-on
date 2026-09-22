"use client";

import { useId, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function AppDialog({ open, title, children, confirmLabel = "확인", cancelLabel = "취소", busy = false, danger = false, onConfirm, onCancel }: Props) {
  const titleId = useId();
  if (!open) return null;
  return <div className="action-confirm-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target && onCancel && !busy) onCancel();
  }}>
    <section className="action-confirm-dialog" role={onCancel ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
      <h2 id={titleId}>{title}</h2>
      {children && <div className="app-dialog-content">{children}</div>}
      <div className="action-confirm-actions">
        {onCancel && <button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}
        <button className={danger ? "danger" : "primary"} type="button" autoFocus disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
