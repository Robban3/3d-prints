import type { ThemeId } from '../types';

export const themes = [
  { id: 'nordic', name: 'Nordisk jul', description: 'Luftig, elegant och presentvänlig. Krämvitt, grangrönt och vinrött.', headline: ['En liten gåva.', 'En stor känsla.'], eyebrow: 'Lokalt printat. Längre liv.', text: '3D-printade inredningsdetaljer, julklappar och personliga skatter – designade och tillverkade lokalt i Sverige.', cta: 'Upptäck julens favoriter', collection: 'Utvalt för att ge bort', imageAlt: 'Krämvit spiralvas, gröna granar och vinröd stjärna i en varm julmiljö', colors: ['#f8f5ee', '#243e2d', '#792d2e'] },
  { id: 'studio', name: 'Färgglad formstudio', description: 'Glad, lekfull och grafisk. Smörgult, koboltblått, korall och lavendel.', headline: ['Bra form.', 'Gladare vardag.'], eyebrow: 'Små detaljer. Stor personlighet.', text: 'Oväntade former, smarta detaljer och färger att bli glad av. Upptäck våra 3D-printade produkter och hitta din nästa favorit.', cta: 'Hitta din favorit', collection: 'Populära just nu', imageAlt: 'Koboltblå vas, korallfärgad organisering och lila julkula mot färgstarka bakgrunder', colors: ['#fff7c2', '#0829ac', '#ee776a'] },
  { id: 'gallery', name: 'Mörk designbutik', description: 'Skulptural och exklusiv. Kolsvart, benvitt och varm koppar.', headline: ['Form som', 'känns.'], eyebrow: 'Form. Funktion. Formlabb.', text: '3D-printade objekt med karaktär. Upptäck vårt sortiment eller skapa något eget tillsammans med vår verkstad i Göteborg.', cta: 'Utforska kollektionen', collection: 'Gåvor med karaktär', imageAlt: 'Kopparfärgad vas, benvit julkula och grafitgrå organisering i varmt ljus på mörk sten', colors: ['#141310', '#f7efe3', '#d5a17d'] },
  { id: 'workshop', name: 'Personlig julverkstad', description: 'Varm och mänsklig. Vinrött, terrakotta, salvia och papperstoner.', headline: ['Din idé.', 'Någons favoritklapp.'], eyebrow: 'Från vår verkstad till ditt hem', text: 'En gåva blir extra fin när den känns personlig. Utforska färdiga produkter eller låt oss printa din egen 3D-modell.', cta: 'Hitta en julklapp', collection: 'Utvalda favoriter', imageAlt: 'Händer knyter ett linneband på ett vinrött julhänge i en varm verkstad', colors: ['#faf1e6', '#742d27', '#7a8365'] },
] as const;

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

export function themeFor(id: ThemeId) {
  return themes.find((theme) => theme.id === id) ?? themes[0];
}
