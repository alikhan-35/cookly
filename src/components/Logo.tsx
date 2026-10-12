export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className={`logo ${compact ? 'logo-small' : ''}`}>
    <svg viewBox="0 0 48 49" aria-hidden="true"><path d="M11 28C0 24 3 10 13 11c2-12 21-12 24 1 12-1 15 15 3 19v12H11Z" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinejoin="round"/><path d="M12 36h27M21 22v8m10-8v8" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round"/></svg>
    <span>Cookly<span className="logo-dot">.</span></span>
  </span>;
}
