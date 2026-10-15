import { useEffect, useId, useRef, useState } from 'react';
import { normalizeOrnamentName } from '../lib/ornamentName';

/** Lightweight illustration: no customer name is sent to a rendering service. */
export function NameOrnamentPreview({ name, secondLine }: { name: string; secondLine?: string }) {
  const text = normalizeOrnamentName(name) || 'Ditt namn';
  const greeting = secondLine !== undefined;
  const lowerText = secondLine === undefined ? '' : normalizeOrnamentName(secondLine);
  const labelId = useId();
  const textRef = useRef<SVGTextElement>(null);
  const secondTextRef = useRef<SVGTextElement>(null);
  const [fontSize, setFontSize] = useState(160);
  const [secondFontSize, setSecondFontSize] = useState(110);
  useEffect(() => {
    let active = true;
    const fit = () => {
      if (!active) return;
      const fitLine = (element: SVGTextElement | null, maxSize: number, maxWidth: number, update: (size: number) => void) => {
        if (!element || typeof element.getComputedTextLength !== 'function') return;
        element.setAttribute('font-size', String(maxSize));
        const width = element.getComputedTextLength();
        const size = width > 0 ? Math.min(maxSize, maxWidth * maxSize / width) : maxSize;
        element.setAttribute('font-size', String(size)); update(size);
      };
      fitLine(textRef.current, greeting ? 115 : 160, 414, setFontSize);
      fitLine(secondTextRef.current, 110, 178, setSecondFontSize);
    };
    fit();
    void document.fonts?.load('italic 700 160px "Ornament Script"', text + lowerText).then(fit).catch(() => undefined);
    return () => { active = false; };
  }, [text, lowerText, greeting]);

  return (
    <figure className="name-ornament-preview">
      <div className="name-ornament-preview__heading"><span className="badge">Ditt personliga ornament</span></div>
      <svg viewBox="0 0 550 600" role="img" aria-labelledby={labelId}>
        <title id={labelId}>{greeting ? `Förhandsvisning av julornament med texten ${text} ${lowerText}` : `Förhandsvisning av namnornament med namnet ${text}`}</title>
        <defs>
          <linearGradient id={`${labelId}-ink`} x1="0" y1="0" x2="0.35" y2="1">
            <stop stopColor="#ded4c0" /><stop offset="0.55" stopColor="#c3b79f" /><stop offset="1" stopColor="#aa9b82" />
          </linearGradient>
          <filter id={`${labelId}-shadow`} x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="0.65" floodColor="#4e3929" floodOpacity="0.4" />
          </filter>
        </defs>
        <image href={greeting ? '/images/personalization/first-christmas-base.webp' : '/images/personalization/name-ornament-base.webp'} width="550" height="600" />
        <text ref={textRef} x="275" y={greeting ? 300 : 346} textAnchor="middle" fontSize={fontSize}
          className="name-ornament-preview__name" fill={`url(#${labelId}-ink)`}
          stroke="#d6c8ae" strokeWidth="0.5" paintOrder="stroke fill"
          filter={`url(#${labelId}-shadow)`}>{text}</text>
        {greeting && <text ref={secondTextRef} x="398" y="390" textAnchor="middle" fontSize={secondFontSize}
          className="name-ornament-preview__name" fill={`url(#${labelId}-ink)`}
          stroke="#d6c8ae" strokeWidth="0.5" paintOrder="stroke fill" filter={`url(#${labelId}-shadow)`}>{lowerText}</text>}
      </svg>
      <figcaption>Förhandsvisning. Textens placering och fästen anpassas inför print.</figcaption>
    </figure>
  );
}
