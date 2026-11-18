"use client";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef } from "react";
import Icon from "./Icon";

export { Icon };

const BTN = {
  primary: "bg-brand text-brand-ink hover:bg-brand-strong border-2 border-brand",
  secondary: "bg-surface text-ink border-2 border-line hover:border-brand",
  danger: "bg-danger text-white border-2 border-danger",
  ghost: "bg-transparent text-ink border-2 border-transparent hover:bg-surface-2",
};

export const Button = forwardRef(function Button({ variant = "primary", icon, children, className = "", size = "lg", ...props }, ref) {
  const sz = size === "lg" ? "min-h-14 px-5 text-lg" : "min-h-12 px-4 text-base";
  return (
    <button ref={ref} type="button" className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${BTN[variant]} ${className}`} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", icon, children, className = "" }) {
  return (
    <Link href={href} className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-5 text-lg font-semibold ${BTN[variant]} ${className}`}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

export function Card({ children, className = "", as: As = "section", ...p }) {
  return <As className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`} {...p}>{children}</As>;
}

const TONE = {
  info: ["bg-info-soft text-ink border-info", "info", "text-info"],
  warn: ["bg-warn-soft text-ink border-warn", "alert", "text-warn"],
  danger: ["bg-danger-soft text-ink border-danger", "alert", "text-danger"],
  ok: ["bg-ok-soft text-ink border-ok", "checkCircle", "text-ok"],
};

export function Notice({ tone = "info", title, children, className = "", role }) {
  const [cls, icon, iconCls] = TONE[tone];
  return (
    <div role={role || (tone === "danger" ? "alert" : undefined)} className={`flex gap-3 rounded-xl border-l-4 p-3 ${cls} ${className}`}>
      <span className={`mt-0.5 shrink-0 ${iconCls}`}><Icon name={icon} /></span>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-base">{children}</div>
      </div>
    </div>
  );
}

const PILL = {
  ok: "bg-ok-soft text-ok border-ok",
  warn: "bg-warn-soft text-warn border-warn",
  danger: "bg-danger-soft text-danger border-danger",
  info: "bg-info-soft text-info border-info",
  muted: "bg-surface-2 text-muted border-line",
};

export function Pill({ tone = "muted", children, icon }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${PILL[tone]}`}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}

export function Field({ label, hint, error, children, id }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="font-semibold">{label}</label>
      {hint && <p id={`${fid}-hint`} className="text-sm text-muted">{hint}</p>}
      {children(fid, hint ? `${fid}-hint` : undefined)}
      {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
}

const INPUT = "min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg text-ink placeholder:text-muted focus:border-brand";

export function TextInput({ label, hint, error, value, onChange, ...p }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => <input id={id} aria-describedby={d} className={INPUT} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />}
    </Field>
  );
}

export function NumberInput({ label, hint, value, onChange, highlight, ...p }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <input id={id} aria-describedby={d} inputMode="numeric" pattern="[0-9]*" type="text"
          className={`${INPUT} ${highlight ? "border-warn bg-warn-soft" : ""}`}
          value={value ?? ""} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} {...p} />
      )}
    </Field>
  );
}

export function TextArea({ label, hint, value, onChange, ...p }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => <textarea id={id} aria-describedby={d} rows={4} className={`${INPUT} py-2`} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />}
    </Field>
  );
}

export function Select({ label, hint, value, onChange, options }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className={`${INPUT} min-w-0 truncate`} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, hint, checked, onChange }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold">{label}</label>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-9 w-16 shrink-0 rounded-full border-2 transition-colors ${checked ? "border-brand bg-brand" : "border-line bg-surface-2"}`}>
        <span className={`absolute top-0.5 h-7 w-7 rounded-full bg-surface shadow transition-all ${checked ? "left-7" : "left-0.5"}`} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/** Accessible confirmation dialog (native <dialog>, focus-trapped by the browser). */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="confirm-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-5 text-ink">
      <h2 id="confirm-title" className="text-xl font-bold">{title}</h2>
      <div className="mt-2 text-lg">{children}</div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
        <Button onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
      </div>
    </dialog>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}
