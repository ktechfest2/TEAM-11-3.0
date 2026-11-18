"use client";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef } from "react";
import Icon from "./Icon";

export { Icon };

const BTN = {
  primary: "bg-brand text-brand-ink hover:bg-brand-strong shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_6px_16px_-8px_var(--brand)]",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line hover:ring-brand hover:bg-brand-soft/40",
  accent: "bg-accent text-accent-ink hover:brightness-95",
  danger: "bg-danger text-white hover:brightness-95",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
};
const PRESS = "transition duration-150 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100";

export const Button = forwardRef(function Button({ variant = "primary", icon, children, className = "", size = "lg", ...props }, ref) {
  const sz = size === "lg" ? "min-h-14 px-5 text-[1.05rem]" : "min-h-12 px-4 text-base";
  return (
    <button ref={ref} type="button" className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold ${PRESS} ${sz} ${BTN[variant]} ${className}`} {...props}>
      {icon && <Icon name={icon} size={22} />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", icon, children, className = "" }) {
  return (
    <Link href={href} className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-[1.05rem] font-semibold ${PRESS} ${BTN[variant]} ${className}`}>
      {icon && <Icon name={icon} size={22} />}
      {children}
    </Link>
  );
}

export function Card({ children, className = "", as: As = "section", ...p }) {
  return <As className={`rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5 ${className}`} {...p}>{children}</As>;
}

/** Small uppercase label above a group of content. */
export function Eyebrow({ children, className = "" }) {
  return <p className={`text-xs font-bold uppercase tracking-[0.12em] text-muted ${className}`}>{children}</p>;
}

const TONE = {
  info: ["bg-info-soft", "info", "text-info"],
  warn: ["bg-warn-soft", "alert", "text-warn"],
  danger: ["bg-danger-soft", "alert", "text-danger"],
  ok: ["bg-ok-soft", "checkCircle", "text-ok"],
};

export function Notice({ tone = "info", title, children, className = "", role }) {
  const [cls, icon, iconCls] = TONE[tone];
  return (
    <div role={role || (tone === "danger" ? "alert" : undefined)} className={`flex gap-3 rounded-2xl p-3.5 text-ink ${cls} ${className}`}>
      <span className={`mt-0.5 shrink-0 ${iconCls}`}><Icon name={icon} size={22} /></span>
      <div className="min-w-0 leading-snug">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-[0.95rem]">{children}</div>
      </div>
    </div>
  );
}

const PILL = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-ink",
  muted: "bg-surface-2 text-muted",
};

export function Pill({ tone = "muted", children, icon }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold leading-none ${PILL[tone]}`}>
      {icon && <Icon name={icon} size={15} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export function Field({ label, hint, error, children, id }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fid} className="text-[0.95rem] font-semibold">{label}</label>
      {hint && <p id={`${fid}-hint`} className="-mt-0.5 text-sm text-muted">{hint}</p>}
      {children(fid, hint ? `${fid}-hint` : undefined)}
      {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}
    </div>
  );
}

const INPUT = "min-h-13 w-full rounded-2xl border-0 bg-surface-2/70 px-4 text-[1.05rem] text-ink ring-1 ring-inset ring-line placeholder:text-muted transition focus:bg-surface focus:ring-2 focus:ring-brand focus:outline-none";

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
          className={`${INPUT} font-semibold tabular-nums ${highlight ? "bg-accent-soft ring-2 ring-accent" : ""}`}
          value={value ?? ""} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} {...p} />
      )}
    </Field>
  );
}

export function TextArea({ label, hint, value, onChange, ...p }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => <textarea id={id} aria-describedby={d} rows={4} className={`${INPUT} py-3 leading-relaxed`} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...p} />}
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
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold">{label}</label>
        {hint && <p className="text-sm leading-snug text-muted">{hint}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-line"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-7" : "left-1"}`} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/** Accessible confirmation dialog (native <dialog>, focus-trapped by the browser). Bottom sheet on phones. */
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
      className="mx-auto mb-0 mt-auto w-full max-w-lg rounded-t-[2rem] bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink shadow-2xl sm:mb-auto sm:rounded-[2rem]">
      <div aria-hidden="true" className="mx-auto -mt-2 mb-4 h-1.5 w-12 rounded-full bg-line sm:hidden" />
      <h2 id="confirm-title" className="text-2xl font-bold">{title}</h2>
      <div className="mt-2 text-[1.05rem] leading-relaxed">{children}</div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
        <Button onClick={onConfirm} autoFocus className="sm:flex-1">{confirmLabel}</Button>
        <Button variant="secondary" onClick={onCancel} className="sm:flex-1">{cancelLabel}</Button>
      </div>
    </dialog>
  );
}

export function Stat({ label, value, sub, tone = "default" }) {
  return (
    <div className={`rounded-2xl p-3.5 ring-1 ring-line ${tone === "brand" ? "bg-brand-soft" : "bg-surface"}`}>
      <p className="text-sm leading-tight text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}
