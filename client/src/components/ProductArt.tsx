import { useId } from 'react';
import type { ArtShape, ArtTone } from '../types';

interface Props {
  shape: ArtShape;
  tone: ArtTone;
  className?: string;
  title?: string;
}

/**
 * Produkterna ritas som SVG i stället för att fotograferas. Varje modell har en
 * egen silhuett och en av fyra ytor, så att sortimentet hänger ihop visuellt på
 * samma sätt som en fotograferad serie mot samma bakgrund.
 */
const tones: Record<ArtTone, { light: string; mid: string; dark: string; line: string }> = {
  grafit: { light: '#848d99', mid: '#5b6370', dark: '#383f49', line: '#22262d' },
  benvit: { light: '#f2f3f5', mid: '#d3d6dc', dark: '#a8adb6', line: '#8d939d' },
  stal: { light: '#aeb6c1', mid: '#828b98', dark: '#59616c', line: '#41474f' },
  bla: { light: '#5b9dff', mid: '#2f7bf6', dark: '#1a58c4', line: '#124092' },
};

/** Bygger konturen på ett kugghjul med raka, jämnt fördelade tänder. */
function gearPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const points: string[] = [];
  const full = (Math.PI * 2) / teeth;
  const half = full / 2;
  for (let i = 0; i < teeth; i += 1) {
    const center = i * full - Math.PI / 2;
    const corners: Array<[number, number]> = [
      [inner, center - half * 0.62],
      [outer, center - half * 0.4],
      [outer, center + half * 0.4],
      [inner, center + half * 0.62],
    ];
    for (const [radius, angle] of corners) {
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      points.push(`${points.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }
  return `${points.join('')}Z`;
}

/** Formerna ritas i ett 200×200-rutnät med golvet på y=170. */
const shapes: Record<ArtShape, JSX.Element> = {
  planter: (
    <>
      <path d="M64 96h72l-9 62a10 10 0 0 1-10 9H83a10 10 0 0 1-10-9z" className="shell" />
      <path d="M64 96h72l-6 14H70z" className="top" />
      <path d="M84 96l6 71M100 96v71M116 96l-6 71" className="cut" />
      <path
        d="M100 92c0-12 8-20 19-22-2 12-9 20-19 22zM100 92c0-10-7-17-16-19 1 11 7 17 16 19z"
        className="part"
      />
      <path d="M100 92v-6" className="cut" />
    </>
  ),
  headphoneStand: (
    <>
      <rect x="56" y="156" width="88" height="13" rx="6" className="base" />
      <path d="M92 156v-44h16v44z" className="shell" />
      <path d="M74 112a26 26 0 0 1 52 0v8h-14v-8a12 12 0 0 0-24 0v8H74z" className="shell" />
      <path d="M62 96a38 38 0 0 1 76 0v8h-12v-8a26 26 0 0 0-52 0v8H62z" className="part" />
      <rect x="54" y="98" width="20" height="34" rx="9" className="part" />
      <rect x="126" y="98" width="20" height="34" rx="9" className="part" />
      <path d="M96 120v36" className="cut" />
    </>
  ),
  organizer: (
    <>
      <rect x="46" y="112" width="46" height="52" rx="5" className="shell" />
      <rect x="96" y="96" width="34" height="68" rx="5" className="shell" />
      <rect x="134" y="126" width="26" height="38" rx="5" className="shell" />
      <rect x="42" y="164" width="122" height="8" rx="4" className="base" />
      <path d="M54 112v52M68 112v52M82 112v52" className="cut" />
      <path d="M104 96V72M114 96V66M124 96V76" className="wire" />
    </>
  ),
  dragon: (
    <>
      <path
        d="M28 152c16 0 20-16 38-16s24 14 42 14 22-14 38-14v20c-12 0-18 16-36 16s-26-14-44-14-18 16-38 16z"
        className="shell"
      />
      <path d="M60 138l9-16 9 16zM104 134l9-16 9 16zM138 138l8-15 8 15z" className="part" />
      <ellipse cx="164" cy="124" rx="20" ry="15" className="shell" />
      <path d="M180 116l16 9-16 9z" className="shell" />
      <path d="M156 111l5-15 6 15z" className="part" />
      <circle cx="172" cy="119" r="3.2" className="eye" />
      <path d="M148 130c8 5 18 6 28 3" className="cut" />
      <path d="M28 152c8-2 14-6 18-11" className="cut" />
    </>
  ),
  moonLamp: (
    <>
      <circle cx="100" cy="92" r="52" className="shell" />
      <circle cx="80" cy="74" r="11" className="cut" />
      <circle cx="112" cy="106" r="8" className="cut" />
      <circle cx="118" cy="70" r="5" className="cut" />
      <circle cx="88" cy="112" r="6" className="cut" />
      <path d="M78 152h44l6 14H72z" className="base" />
      <rect x="66" y="166" width="68" height="7" rx="3.5" className="base" />
    </>
  ),
  penHolder: (
    <>
      <path d="M62 104h76l-7 60a8 8 0 0 1-8 7H77a8 8 0 0 1-8-7z" className="shell" />
      <path d="M62 104h76l-4 12H66z" className="top" />
      <path d="M74 116l4 55M90 116l2 55M110 116l-2 55M126 116l-4 55" className="cut" />
      <path d="M84 104V64M96 104V72M112 104V60" className="wire" />
      <circle cx="84" cy="61" r="3.5" className="part" />
      <circle cx="112" cy="57" r="3.5" className="part" />
    </>
  ),
  wallHook: (
    <>
      <rect x="40" y="44" width="21" height="96" rx="6" className="shell" />
      <circle cx="50" cy="62" r="4.5" className="cut" />
      <circle cx="50" cy="122" r="4.5" className="cut" />
      <path d="M61 74h26a26 26 0 0 1 26 26v16a19 19 0 0 0 38 0v-18" className="tube" />
    </>
  ),
  coffeeDripper: (
    <>
      <path d="M60 78h80l-30 44H90z" className="part" />
      <path d="M70 88h60M76 100h48" className="cut" />
      <path d="M66 122h68v8H66z" className="shell" />
      <path d="M74 130l6 22h40l6-22z" className="shell" />
      <rect x="62" y="160" width="76" height="10" rx="5" className="base" />
      <path d="M100 152v8" className="cut" />
    </>
  ),
  diceTower: (
    <>
      <path d="M74 40h52l14 104H60z" className="shell" />
      <path d="M74 40h52l3 20H71z" className="top" />
      <path d="M82 68h36l3 26H79zM77 104h46l3 26H74z" className="cut" />
      <rect x="52" y="144" width="96" height="26" rx="5" className="shell" />
      <circle cx="80" cy="157" r="4" className="part" />
      <circle cx="100" cy="157" r="4" className="part" />
      <circle cx="120" cy="157" r="4" className="part" />
    </>
  ),
  phoneStand: (
    <>
      <path d="M56 158l52-92 20 11-52 92z" className="shell" />
      <path d="M84 158h62v14H78z" className="shell" />
      <rect
        x="92"
        y="60"
        width="42"
        height="72"
        rx="6"
        transform="rotate(28 113 96)"
        className="part"
      />
      <path d="M104 78l22 12" className="cut" />
      <path d="M62 148l12 7" className="cut" />
    </>
  ),
  cableClip: (
    <>
      {[58, 100, 142].map((cx) => (
        <path
          key={cx}
          d={`M${cx - 21} 96v18a21 21 0 0 0 42 0V96h-10v18a11 11 0 0 1-22 0V96z`}
          className="shell"
        />
      ))}
      <path d="M22 96c26 0 26 -12 52 -12s26 12 52 12 26-12 52-12" className="wire" />
      <rect x="30" y="140" width="140" height="11" rx="5" className="base" />
      {[58, 100, 142].map((cx) => (
        <circle key={cx} cx={cx} cy="128" r="4" className="cut" />
      ))}
    </>
  ),
  spiralVase: (
    <>
      <path
        d="M78 42h44l-6 24c12 14 18 32 18 50 0 30-16 50-34 50s-34-20-34-50c0-18 6-36 18-50z"
        className="shell"
      />
      <path
        d="M68 84c14 10 50 10 64 0M66 104c16 10 52 10 68 0M68 124c14 10 50 10 64 0M74 142c12 8 40 8 52 0"
        className="cut"
      />
      <path d="M84 44h32l-3 18H87z" className="top" />
    </>
  ),
  gearFidget: (
    <>
      <path d={gearPath(100, 100, 64, 52, 10)} className="shell" />
      <circle cx="100" cy="100" r="40" className="top" />
      <circle cx="100" cy="100" r="15" className="part" />
      <circle cx="100" cy="100" r="40" className="cut" />
      <circle cx="100" cy="70" r="11" className="cut" />
      <circle cx="126" cy="115" r="11" className="cut" />
      <circle cx="74" cy="115" r="11" className="cut" />
      <circle cx="100" cy="100" r="26" className="cut" />
    </>
  ),
  spiceShelf: (
    <>
      <path d="M28 164h144v10H28z" className="base" />
      <path d="M28 132h50v32H28zM75 112h50v52H75zM122 92h50v72h-50z" className="shell" />
      <rect x="38" y="112" width="18" height="22" rx="3" className="part" />
      <rect x="86" y="92" width="18" height="22" rx="3" className="part" />
      <rect x="133" y="72" width="18" height="22" rx="3" className="part" />
      <path d="M38 108h18M86 88h18M133 68h18" className="cut" />
    </>
  ),
};

export function ProductArt({ shape, tone, className, title }: Props) {
  const id = useId().replace(/:/g, '');
  const palette = tones[tone];
  const bodyId = `body-${id}`;
  const linesId = `lines-${id}`;
  const glowId = `glow-${id}`;
  const clipId = `clip-${id}`;

  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title ?? 'Produktillustration'}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={bodyId} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="55%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
        <radialGradient id={glowId} cx="0.5" cy="0.42" r="0.55">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <pattern id={linesId} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="1" fill="#000" opacity="0.16" />
        </pattern>
        <clipPath id={clipId}>{shapes[shape]}</clipPath>
      </defs>

      <rect width="200" height="200" fill={`url(#${glowId})`} />
      <ellipse cx="100" cy="176" rx="62" ry="7" fill="#000" opacity="0.45" />

      <g
        className="art-body"
        style={
          {
            '--body': `url(#${bodyId})`,
            '--edge': palette.light,
            '--line': palette.line,
          } as React.CSSProperties
        }
      >
        {shapes[shape]}
      </g>
      <g clipPath={`url(#${clipId})`}>
        <rect width="200" height="200" fill={`url(#${linesId})`} />
      </g>
    </svg>
  );
}
