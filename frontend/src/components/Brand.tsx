// Signature mark: a friendly down-trending curve — "learning = loss going down".
export function ThinkerMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#17130E" />
      <path d="M6 9 C 11 9, 12 21, 17 21 S 24 12, 26 12" stroke="#FF6B1A" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="26" cy="12" r="2.4" fill="#FF6B1A" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight text-ink ${className}`}>
      Thinker<span className="text-orange">.</span>
    </span>
  )
}
