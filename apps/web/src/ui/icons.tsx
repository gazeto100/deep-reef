/** Inline SVG icons: they inherit the button's text colour and need no extra requests. */

export function SpinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.2 10.8A7 7 0 0 1 17.6 7.4" />
        <path d="M18.6 3.6 17.9 7.6 13.9 7" />
        <path d="M18.8 13.2A7 7 0 0 1 6.4 16.6" />
        <path d="M5.4 20.4 6.1 16.4 10.1 17" />
      </g>
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="7.6" r="1.4" fill="currentColor" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
