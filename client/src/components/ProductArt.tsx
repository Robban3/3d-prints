import { useId } from "react";
import type { ArtShape } from "../types";

interface Props {
  shape: ArtShape;
  accent: string;
  /** Extra klass för att styra storleken från förälderns CSS. */
  className?: string;
  title?: string;
}

/**
 * Produktbilderna ritas som SVG i stället för att laddas som foton. Varje form
 * får ett lagermönster som efterliknar de synliga skikten på en printad detalj,
 * vilket ger butiken ett enhetligt uttryck utan externa bildfiler.
 */
const shapes: Record<ArtShape, () => JSX.Element> = {
  vase: () => (
    <>
      <path d="M78 46h44l-6 26c14 12 22 30 22 50 0 34-20 56-38 56s-38-22-38-56c0-20 8-38 22-50z" />
      <path d="M84 52h32l-5 22h-22z" opacity="0.55" />
    </>
  ),
  arch: () => (
    <>
      <path d="M62 172c0-64 12-104 38-104s38 40 38 104h-16c0-56-8-88-22-88s-22 32-22 88z" />
      <ellipse cx="100" cy="176" rx="46" ry="12" />
    </>
  ),
  grid: () => (
    <>
      <rect x="46" y="96" width="48" height="64" rx="6" />
      <rect x="102" y="76" width="48" height="84" rx="6" opacity="0.75" />
      <rect x="46" y="166" width="104" height="12" rx="4" opacity="0.5" />
    </>
  ),
  tower: () => (
    <>
      <path d="M72 40h56l14 108H58z" />
      <rect x="52" y="152" width="96" height="26" rx="6" opacity="0.7" />
      <path d="M82 66h36l4 30H78z" opacity="0.35" />
    </>
  ),
  hook: () => (
    <>
      <path d="M58 48h22v70c0 18 14 30 32 30h22v22h-22c-30 0-54-22-54-52z" />
      <rect x="46" y="40" width="46" height="16" rx="6" opacity="0.6" />
    </>
  ),
  creature: () => (
    <>
      <path d="M40 148c22 0 26-18 44-18s22 16 40 16 22-18 40-18v22c-14 0-22 18-40 18s-24-16-40-16-20 18-44 18z" />
      <path
        d="M148 92c16 0 26 10 26 24 0 10-6 18-16 22l-8-14c4-2 6-4 6-8 0-6-4-8-10-8z"
        opacity="0.8"
      />
      <circle cx="158" cy="104" r="4" opacity="0.45" />
      <path d="M56 118l10 14-10 14-10-14z" opacity="0.55" />
    </>
  ),
  sphere: () => (
    <>
      <circle cx="100" cy="102" r="56" />
      <circle cx="82" cy="86" r="11" opacity="0.35" />
      <circle cx="118" cy="118" r="8" opacity="0.35" />
      <circle cx="112" cy="74" r="5" opacity="0.35" />
      <rect x="74" y="166" width="52" height="12" rx="5" opacity="0.7" />
    </>
  ),
  stand: () => (
    <>
      <path d="M50 166l64-108 20 12-64 108z" />
      <path d="M96 166h62v14H90z" opacity="0.75" />
      <path d="M112 92l18 10-8 14-18-10z" opacity="0.4" />
    </>
  ),
};

export function ProductArt({ shape, accent, className, title }: Props) {
  const id = useId().replace(/:/g, "");
  const gradientId = `bg-${id}`;
  const linesId = `lines-${id}`;
  const clipId = `clip-${id}`;

  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title ?? "Produktillustration"}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.04" />
        </linearGradient>
        <pattern
          id={linesId}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <rect width="6" height="6" fill={accent} />
          <rect width="6" height="1.4" fill="#000" opacity="0.16" />
        </pattern>
        <clipPath id={clipId}>{shapes[shape]()}</clipPath>
      </defs>
      <rect width="200" height="200" rx="18" fill={`url(#${gradientId})`} />
      <circle cx="100" cy="96" r="72" fill={accent} opacity="0.08" />
      <g clipPath={`url(#${clipId})`}>
        <rect width="200" height="200" fill={`url(#${linesId})`} />
      </g>
      <g fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="1.5">
        <g>{shapes[shape]()}</g>
      </g>
      <path
        d="M28 182h144"
        stroke={accent}
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
