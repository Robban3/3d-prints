import type { ThemeId } from '../types';

export const themes = [
  { id: 'nordic', name: 'Nordisk jul', description: 'Luftig, elegant och presentvänlig. Krämvitt, grangrönt och vinrött.', headline: ['En liten gåva.', 'En stor känsla.'], eyebrow: 'Lokalt printat. Längre liv.', text: '3D-printade inredningsdetaljer, julklappar och personliga skatter – designade och tillverkade lokalt i Sverige.', cta: 'Upptäck julens favoriter', collection: 'Utvalt för att ge bort', imageAlt: 'Krämvit spiralvas, gröna granar och vinröd stjärna i en varm julmiljö', colors: ['#f8f5ee', '#243e2d', '#792d2e'] },
  { id: 'studio', name: 'Färgglad formstudio', description: 'Glad, lekfull och grafisk. Smörgult, koboltblått, korall och lavendel.', headline: ['Bra form.', 'Gladare vardag.'], eyebrow: 'Små detaljer. Stor personlighet.', text: 'Oväntade former, smarta detaljer och färger att bli glad av. Upptäck våra 3D-printade produkter och hitta din nästa favorit.', cta: 'Hitta din favorit', collection: 'Populära just nu', imageAlt: 'Koboltblå vas, korallfärgad organisering och lila julkula mot färgstarka bakgrunder', colors: ['#fff7c2', '#0829ac', '#ee776a'] },
  { id: 'gallery', name: 'Mörk designbutik', description: 'Skulptural och exklusiv. Kolsvart, benvitt och varm koppar.', headline: ['Form som', 'känns.'], eyebrow: 'Form. Funktion. Formlabb.', text: '3D-printade objekt med karaktär. Upptäck vårt sortiment eller skapa något eget tillsammans med vår verkstad i Göteborg.', cta: 'Utforska kollektionen', collection: 'Gåvor med karaktär', imageAlt: 'Kopparfärgad vas, benvit julkula och grafitgrå organisering i varmt ljus på mörk sten', colors: ['#141310', '#f7efe3', '#d5a17d'] },
  { id: 'workshop', name: 'Personlig julverkstad', description: 'Varm och mänsklig. Vinrött, terrakotta, salvia och papperstoner.', headline: ['Din idé.', 'Någons favoritklapp.'], eyebrow: 'Från vår verkstad till ditt hem', text: 'En gåva blir extra fin när den känns personlig. Utforska färdiga produkter eller låt oss printa din egen 3D-modell.', cta: 'Hitta en julklapp', collection: 'Utvalda favoriter', imageAlt: 'Händer knyter ett linneband på ett vinrött julhänge i en varm verkstad', colors: ['#faf1e6', '#742d27', '#7a8365'] },
  { id: 'halloween', name: 'Halloween', description: 'Pumpaorange, midnattslila och mörka skulpturala detaljer.', headline: ['Lite mörker.', 'Massor av karaktär.'], eyebrow: 'Halloween hos Formlabb', text: 'Pumpor, spöken och kusliga detaljer. Upptäck Halloween-kollektionen, designad och printad i Göteborg.', cta: 'Upptäck Halloween', collection: 'Favoriter för mörka kvällar', imageAlt: '3D-printad ribbad pumpa ur Formlabbs Halloween-kollektion', colors: ['#201827', '#ffae66', '#bfa4e3'] },
  { id: 'forest', name: 'Skog och form', description: 'Lugn, naturlig och tidlös. Salvia, mörkgrönt och varm sand.', headline: ['Naturlig känsla.', 'Genomtänkt form.'], eyebrow: 'Små former för ditt hem', text: 'Vaser, inredning och smarta detaljer med personlighet. Tillverkade lokalt, för en vardag att trivas i.', cta: 'Utforska sortimentet', collection: 'Former för ditt hem', imageAlt: 'Formlabbs spiralvas', colors: ['#f1f2e9', '#294636', '#b8c4a8'] },
  { id: 'coastal', name: 'Ljus kust', description: 'Frisk och avskalad. Havsblått, vitt och mjuka sandtoner.', headline: ['Ljusare rum.', 'Nya favoriter.'], eyebrow: 'Form som får plats i vardagen', text: 'Upptäck lokalt tillverkade produkter för hemmet eller låt vår verkstad förverkliga din egen idé.', cta: 'Hitta din favorit', collection: 'Utvalda former', imageAlt: 'Formlabbs Nexo-vas', colors: ['#f5f9fa', '#164c65', '#e7dccb'] },
] as const;

export function themeImage(id: ThemeId) {
  if (id === 'halloween') return '/images/halloween/ribbad-pumpa.webp';
  if (id === 'forest') return '/images/products/spiral-vas.webp';
  if (id === 'coastal') return '/images/products/vas-nexo.webp';
  return `/images/themes/${id}.webp`;
}

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

export function themeFor(id: ThemeId) {
  return themes.find((theme) => theme.id === id) ?? themes[0];
}
