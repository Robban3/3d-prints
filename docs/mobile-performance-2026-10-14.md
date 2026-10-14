# Mobil och laddning

## Ändringar

- Samtliga 289 offentliga bildadresser har innehållshashade WebP-versioner i 320, 640, 960 och upp till 1536 pixlar. Identiska original återanvänder samma filer.
- Alla 118 bildadresser i den offentliga produktkatalogen, inklusive varianter, finns i bildmanifestet. Nya uppladdningar utan manifest använder sin ordinarie adress.
- Hero och produktens huvudbild prioriteras; bilder längre ner laddas vid behov. Bildmått reserverar layoututrymme.
- Admin och övriga sidtyper laddas som separata koddelar.
- Cloudflare Static Assets levererar offentliga HTML-, bild-, CSS- och JS-filer. `/api` och `/api/*` går fortfarande till servern och dess behörighetskontroller.
- Hashade statiska filer får lång cachetid. Kund- och admin-API:er har inte fått offentlig cache.
- Samma CSP, referrer- och inramningsskydd följer med statiskt levererade sidor via `_headers`.
- Mobilfilter, formulär, tryckytor, varukorg och produktkort är anpassade för små skärmar. Specifikationer visas efter köpval på mobil.

## Mätningar

640 px-versioner jämförda med tidigare original (filstorlek, inte uppmätt nätverkstid):

| Bild | Tidigare | Mobil | Minskning |
| --- | ---: | ---: | ---: |
| Nordisk jul | 2 040 930 B | 36 110 B | 98,2 % |
| Halloween | 163 694 B | 30 182 B | 81,6 % |
| Skog och form | 252 186 B | 39 466 B | 84,4 % |
| Ljus kust | 194 384 B | 31 546 B | 83,8 % |

## Kontroll

- Offentliga sidtyper granskade lokalt vid 320 px och viktiga flöden vid 390 px. Ingen horisontell sidscrollning på kontrollerade sidor.
- Produktkort, variantval, lokal varukorg och kassans formulär kontrollerade mot en skrivskyddad kopia av offentlig katalog. Inga riktiga beställningar eller betalningar skapades.
- Klienttesterna omfattar även att okända/skyddade bildadresser inte får offentliga bildvarianter.
- Serverbygge och Cloudflare-typkontroll. Produktionens publicering och statiska svar måste verifieras efter automatiskt bygge.
- Ingen uppmätt Lighthouse-poäng eller garanti om laddningstid på alla telefoner/nätverk. Admininnehåll kontrollerat i kod och komponenttester; ingen åtkomst till privata adminuppgifter via webbläsaren.

## Nya bilder

Kör `scripts/optimize-web-images.py` med Python och Pillow efter nya offentliga kampanj-/produktbilder. Verktyget läser enbart `client/public/images`, behåller original och uppdaterar `client/src/lib/responsive-images.json`. Lägg både manifest och genererade bilder i samma commit. Privata printfiler ska aldrig placeras i `client/public`.
