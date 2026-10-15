export const ORNAMENT_NAME_MAX_LENGTH = 24;
export function normalizeOrnamentName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}
export function ornamentNameError(value: string): string | null {
  const name = normalizeOrnamentName(value);
  if (!name) return 'Skriv namnet som ska stå på ornamentet.';
  if (name.length > ORNAMENT_NAME_MAX_LENGTH) return `Namnet får vara högst ${ORNAMENT_NAME_MAX_LENGTH} tecken.`;
  if (!/^\p{L}[\p{L}\p{M}]*(?:[ '\u2019-]\p{L}[\p{L}\p{M}]*)*$/u.test(name)) {
    return 'Använd bokstäver, mellanslag, bindestreck eller apostrof.';
  }
  return null;
}

export function ornamentGreetingError(value: string): string | null {
  const lines = value.split(' / ');
  if (lines.length !== 2 || lines.some(line => !line.trim() || line.trim().length > ORNAMENT_NAME_MAX_LENGTH || !/^[\p{L}\p{M}\p{N} &'’.,!?-]+$/u.test(line))) {
    return 'Skriv två textrader med högst 24 tecken per rad. Använd bokstäver, siffror och vanliga skiljetecken.';
  }
  return null;
}
