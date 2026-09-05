export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9" fill="#12151b" stroke="#2b323d" />
      <path
        d="M18 7.5 28 13v10l-10 5.5L8 23V13z"
        fill="none"
        stroke="#2b7fff"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M8 13l10 5.5L28 13M18 18.5V28.5"
        fill="none"
        stroke="#2b7fff"
        strokeWidth="2.1"
        strokeLinejoin="round"
        opacity=".55"
      />
    </svg>
  );
}
