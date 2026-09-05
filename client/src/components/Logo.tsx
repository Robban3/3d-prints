export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#171c26" stroke="#242b39" />
      <path
        d="M16 5 27 11v10l-11 6-11-6V11z"
        fill="none"
        stroke="#b6f24a"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M5 11l11 6 11-6M16 17v10"
        fill="none"
        stroke="#b6f24a"
        strokeWidth="2.2"
        strokeLinejoin="round"
        opacity=".6"
      />
    </svg>
  );
}
