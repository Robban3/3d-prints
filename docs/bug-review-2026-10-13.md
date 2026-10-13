# Buggranskning 13 oktober 2026

Granskningen omfattar inventering och kodkontroller av webbshoppen, servern, Cloudflare-konfigurationen och hjälpskripten. Kassans priser, betalsessioner, orderstatus, filkopplingar, varukorg och asynkrona klientfunktioner har kontrollerats närmare. Typkontroll och automatiserade tester omfattar applikationskoden. Genererade filer, externa paket och CAD-/printgeometri är inte manuellt granskade rad för rad eller geometriskt validerade.

## Rättade fel

- Samtidiga avbrott av samma order kunde båda läsa den tidigare statusen och återföra lager två gånger. Statusändringar serialiseras nu i den enda serverinstansen. Test: två samtidiga avbrott ger 200/409 och återför lagret en gång.
- Sparad varukorg kunde visa ett gammalt pris medan servern använde det nya. Kassans summering kommer nu från servern, inklusive variantpris och frakt. Ändrat pris före orderläggning ger 409 och uppdaterar summeringen.
- Kunden kunde skicka beställning medan betalsessionen uppdaterades eller använda en session för tidigare varukorg. Knappen och submit-funktionen kontrollerar nu laddning, session och vilken varukorg sessionen gäller.
- Okänd storlek byttes tyst till första storleken. Angiven okänd storlek avvisas nu. Saknat val använder fortfarande produktens standardstorlek.
- Decimalt antal avrundades och strängar som `2st` accepterades som tal. Order- och offertantal måste nu vara heltal, och talsträngar måste vara fullständiga.
- Trasiga sparade varukorgsrader kunde orsaka krasch eller NaN. De filtreras bort. När en befintlig variant läggs till igen uppdateras dess pris och namn.
- Klarna-skriptet lämnades kvar efter laddningsfel, så ett nytt försök kunde hänga. Det felaktiga skriptet tas bort och kan laddas om. Widgetens initieringsflagga kunde också blockera React StrictMode; den flaggan är borttagen och nya sessioner återställer felmeddelandet.
- Produktkortets och produktsidans timers fortsatte efter avmontering. Effekter rensar nu timers. Produktsidan använder standardstorlekens mått redan vid första renderingen.
- Ordernummer hade bara sex slumpade hextecken. Nya nummer har tolv och dubbla nummer avvisas vid skrivning. Befintliga ordernummer påverkas inte.
- Om orderlagringen misslyckades före extern betalning kunde lager och filkoppling bli kvar. De återställs nu. Testet simulerar fel i lagringen och verifierar saldo och filägarskap.
- Orderstatuskontrollen accepterade ärvda objektnycklar. Endast egna, definierade statusnamn accepteras nu.
- Kassan lovade automatiskt en betalningslänk utan att funktionen var aktiverad. Texten beskriver nu vad som faktiskt sker.

## Kvarvarande risker och begränsningar

- Klarna är ännu inte aktiverat för skarpa betalningar. Capture/refund, idempotens och återhämtning efter lyckad extern auktorisering kräver fortsatt betalningsarbete. Inga riktiga betalningar genomfördes under granskningen.
- Orderstatus, lager och katalog ligger i separata R2-objekt. Serieköer skyddar samtidighet i en instans men är ingen transaktion över flera objekt. Ett driftfel mellan två skrivningar kan kräva avstämning, exempelvis om status har sparats som avbruten men lageråterföringen misslyckas. Detta bör lösas med en varaktig transaktions-/åtgärdsjournal före högre ordervolym.
- Katalogimport validerar rader före skrivning men kan bli delvis genomförd om lagringen misslyckas under själva importen. Exporten innehåller kategorier/material/kvaliteter, medan importen endast tillämpar produkter mot redan befintliga val.
- E-post är ännu inte aktiverad hos backend. Återställningsmejl sparas i privat utkorg tills SMTP är konfigurerat.
- En kodgranskning och godkända tester är inte bevis för att alla buggar är borta. Leverantörernas interna system, verkliga betalningsflöden, historiska loggar och alla CAD-modellers printbarhet ingår inte i verifieringen.

## Verifiering

Produktionsbygget godkänt. 179 servertester och 53 klienttester godkända. Cloudflare-koden typkontrollerad, samtliga JavaScript-hjälpskript syntaxkontrollerade och 105 Python-filer AST/syntaxkontrollerade utan att köra modellskripten. `npm audit --omit=dev` rapporterade noll kända sårbarheter. Python-kontrollen verifierar syntax, inte att CAD-skripten ger korrekta modeller.
