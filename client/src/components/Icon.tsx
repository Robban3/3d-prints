export type IconName =
  | 'bolt'
  | 'shield'
  | 'flag'
  | 'headset'
  | 'search'
  | 'user'
  | 'cart'
  | 'cartPlus'
  | 'chevronDown'
  | 'grid'
  | 'home'
  | 'desk'
  | 'hobby'
  | 'gear'
  | 'sparkle'
  | 'truck'
  | 'clock'
  | 'return'
  | 'card'
  | 'upload'
  | 'file'
  | 'target'
  | 'cube'
  | 'leaf'
  | 'heart'
  | 'users'
  | 'layers'
  | 'arrowRight';

/** Streckade ikoner i ett enhetligt 24-rutnät. Ärver färg och storlek från texten. */
const paths: Record<IconName, JSX.Element> = {
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />,
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </>
  ),
  headset: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <path d="M4 13v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 13v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z" />
      <path d="M18 18v1a2 2 0 0 1-2 2h-3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
    </>
  ),
  cartPlus: (
    <>
      <path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L21 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
      <path d="M13.5 9.5v4M11.5 11.5h4" />
    </>
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  desk: (
    <>
      <rect x="3" y="5" width="18" height="11" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  hobby: (
    <>
      <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9 9.4 9z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
      <path d="M18.5 16.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9h-11zM13.5 10h4l3 3v2.5h-7" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  return: (
    <>
      <path d="M4 9.5a8.5 8.5 0 1 1 .8 6" />
      <path d="M3.5 4.5v5h5" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6 14.5h3.5" />
    </>
  ),
  upload: (
    <>
      <path d="M6.5 15.5a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.5 1.4 3.6 3.6 0 0 1-.4 7.1" />
      <path d="M12 20v-8.5M8.8 14.2 12 11l3.2 3.2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
      <path d="M13 3.5v5h5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4c0 9-5 13-11 13a5 5 0 0 1-5-5C4 6.5 12.5 8 20 4z" />
      <path d="M4.5 20c2.5-5 6-8 11-10" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.3" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.3 3.3 0 0 1 0 6.3M17.5 14.4a6 6 0 0 1 3.5 5.1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m4 12 8 4.3 8-4.3M4 16.3l8 4.3 8-4.3" />
    </>
  ),
  arrowRight: <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
