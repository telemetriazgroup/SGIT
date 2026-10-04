export function Logo({ palabra = true }: { palabra?: boolean }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1f4d3a" />
        <path
          d="M8 18.5c2.2-4.4 4.2-6.6 6.2-6.6 2.4 0 3.2 3.2 5.2 3.2 1.6 0 2.8-1.6 4.6-4.6"
          fill="none"
          stroke="#f4efe4"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="23.5" r="1.4" fill="#f4efe4" />
      </svg>
      {palabra ? <span>SGIT</span> : null}
    </span>
  );
}
