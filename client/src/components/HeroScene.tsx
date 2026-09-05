/**
 * Hero-bilden: en printer med färdiga detaljer uppställda på samma bänk.
 * Ritad som SVG av samma skäl som produktbilderna – ett enhetligt uttryck
 * utan externa bildfiler.
 */
export function HeroScene() {
  return (
    <svg
      className="hero-scene"
      viewBox="0 0 620 420"
      role="img"
      aria-label="En 3D-printer med printade produkter uppställda framför sig"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="hs-bg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#1b2029" />
          <stop offset="100%" stopColor="#07090c" />
        </linearGradient>
        <radialGradient id="hs-glow" cx="0.62" cy="0.42" r="0.5">
          <stop offset="0%" stopColor="#2b7fff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2b7fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b424e" />
          <stop offset="55%" stopColor="#232932" />
          <stop offset="100%" stopColor="#14181e" />
        </linearGradient>
        <linearGradient id="hs-white" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#f4f5f7" />
          <stop offset="60%" stopColor="#d5d8de" />
          <stop offset="100%" stopColor="#a9aeb7" />
        </linearGradient>
        <linearGradient id="hs-blue" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#5b9dff" />
          <stop offset="55%" stopColor="#2f7bf6" />
          <stop offset="100%" stopColor="#1852b8" />
        </linearGradient>
        <linearGradient id="hs-dark" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#7b8492" />
          <stop offset="55%" stopColor="#4d5563" />
          <stop offset="100%" stopColor="#2a3038" />
        </linearGradient>
        <pattern id="hs-lines" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#000" opacity="0.15" />
        </pattern>
      </defs>

      <rect width="620" height="420" fill="url(#hs-bg)" />
      <rect width="620" height="420" fill="url(#hs-glow)" />

      {/* Printern */}
      <g>
        <rect x="344" y="66" width="238" height="238" rx="12" fill="url(#hs-metal)" />
        <rect x="358" y="82" width="210" height="176" rx="6" fill="#0a0d11" opacity="0.9" />
        <rect x="358" y="82" width="210" height="176" rx="6" fill="none" stroke="#39414d" />
        <rect x="374" y="236" width="178" height="12" rx="3" fill="#454e5c" />
        <rect x="382" y="112" width="162" height="9" rx="4" fill="#39414d" />
        <rect x="440" y="121" width="46" height="34" rx="4" fill="#5b6470" />
        <path d="M457 155h12v14h-12z" fill="#2b7fff" opacity="0.9" />
        <circle cx="463" cy="176" r="4" fill="#2b7fff" />
        {/* Påbörjad detalj på byggplattan */}
        <path d="M443 236c0-16 6-26 20-26s20 10 20 26z" fill="url(#hs-blue)" />
        <path d="M443 236c0-16 6-26 20-26s20 10 20 26z" fill="url(#hs-lines)" />
        <rect x="358" y="264" width="210" height="30" rx="5" fill="#191e26" />
        <rect x="374" y="274" width="52" height="11" rx="3" fill="#2b7fff" opacity="0.75" />
        <rect x="436" y="274" width="30" height="11" rx="3" fill="#39414d" />
      </g>

      {/* Bänken */}
      <rect x="26" y="300" width="568" height="16" rx="5" fill="#20252d" />
      <rect x="26" y="300" width="568" height="5" rx="2" fill="#333b46" />
      <ellipse cx="300" cy="326" rx="246" ry="12" fill="#000" opacity="0.5" />

      {/* Spiralvas */}
      <g>
        <path
          d="M104 152h44l-6 26c12 14 18 30 18 48 0 42-20 74-34 74s-34-32-34-74c0-18 6-34 18-48z"
          fill="url(#hs-blue)"
        />
        <path
          d="M104 152h44l-6 26c12 14 18 30 18 48 0 42-20 74-34 74s-34-32-34-74c0-18 6-34 18-48z"
          fill="url(#hs-lines)"
        />
        <path
          d="M94 190c14 10 52 10 66 0M92 214c16 10 54 10 70 0M92 240c16 10 54 10 70 0M96 268c14 8 46 8 60 0"
          fill="none"
          stroke="#12428f"
          strokeWidth="2"
          opacity="0.55"
        />
      </g>

      {/* Rutmönstrad vas */}
      <g>
        <path
          d="M188 128h40l-5 24c14 16 21 36 21 58 0 50-18 90-36 90s-36-40-36-90c0-22 7-42 21-58z"
          fill="url(#hs-dark)"
        />
        <path
          d="M188 128h40l-5 24c14 16 21 36 21 58 0 50-18 90-36 90s-36-40-36-90c0-22 7-42 21-58z"
          fill="url(#hs-lines)"
        />
        <path
          d="M180 172l28 28-28 28M236 172l-28 28 28 28M180 228l28 28 28-28"
          fill="none"
          stroke="#0e1116"
          strokeWidth="2"
          opacity="0.6"
        />
      </g>

      {/* Kugghjulsdetalj */}
      <g>
        <path
          d="M282 232h44a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8h-44a8 8 0 0 1-8-8v-52a8 8 0 0 1 8-8z"
          fill="url(#hs-white)"
        />
        <path
          d="M282 232h44a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8h-44a8 8 0 0 1-8-8v-52a8 8 0 0 1 8-8z"
          fill="url(#hs-lines)"
        />
        <circle cx="292" cy="252" r="7" fill="#0d1015" opacity="0.55" />
        <circle cx="316" cy="252" r="7" fill="#0d1015" opacity="0.55" />
        <circle cx="304" cy="280" r="10" fill="#0d1015" opacity="0.55" />
      </g>

      {/* Fasetterad kruka med planta */}
      <g>
        <path
          d="M330 226c0-14 10-24 24-26-2 14-11 24-24 26zM330 226c0-12-8-20-20-22 1 13 8 20 20 22z"
          fill="#3f8f5a"
        />
        <path d="M306 244h56l-8 50a10 10 0 0 1-10 8h-20a10 10 0 0 1-10-8z" fill="url(#hs-white)" />
        <path d="M306 244h56l-8 50a10 10 0 0 1-10 8h-20a10 10 0 0 1-10-8z" fill="url(#hs-lines)" />
        <path
          d="M320 244l5 58M334 244v58M348 244l-5 58"
          fill="none"
          stroke="#8d939d"
          strokeWidth="1.6"
          opacity="0.5"
        />
      </g>

      {/* Blått kugghjul längst fram till höger */}
      <g transform="translate(556 286)">
        <path
          d="M0-40 11.2-36.5 20.5-43.4 27.4-34.1 38.9-33.6 36.5-22.4 44.7-14.4 35.3-7.7 34.6 3.8 23.4 4.9 16.3 13.9 6.1 8.6-4.6 12.9-9.9 2.7-20.9-.9-18.4-12 -25.3-21.2-16.2-28.1-14.6-39.5-3.2-38.2Z"
          fill="url(#hs-blue)"
          opacity="0.95"
        />
        <circle r="13" fill="#0a0d11" />
      </g>
    </svg>
  );
}
