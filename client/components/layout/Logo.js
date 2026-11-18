/** AwaVote mark: a ballot box slot with a marigold tick dropping in. */
export function LogoMark({ size = 36, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <rect width="40" height="40" rx="11" fill="var(--brand)" />
      <rect x="9" y="9" width="22" height="4" rx="2" fill="var(--brand-ink)" opacity="0.9" />
      <path className="logo-tick" d="M12.5 23.5l5 5L28 17.5" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ size = 36 }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-[1.35rem] font-extrabold tracking-tight">Awa<span className="text-brand">Vote</span></span>
    </span>
  );
}
