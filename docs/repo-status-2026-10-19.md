# Repostatus – 19 oktober 2026

## Slutsats

Butik, admin, orderlagring, uppladdningar och ordermejl finns. Verifierade
onlinebetalningar och artikelnummer återstår före lansering. Genomgången gäller
repot och lokala kontroller, inte ett skarpt testköp eller geometrisk/juridisk
certifiering. Ingen ny betalningsleverantör eller något avtal har valts här.

## Rättat i denna genomgång

- Valideringstester använder nu en egen katalog, så datorns ändrade lokala
  produktfärger inte gör två tester felaktigt röda.
- Resin borttaget ur båda standardkatalogerna. Befintlig R2-katalog påverkas
  inte; där hade resin redan tagits bort via admin.
- Ordermejlet lovar inte längre en betalningslänk när betalningsuppgifter saknas.
- GitHub-kontroller för tester, typkontroll, bygge, Cloudflare och kända
  allvarliga sårbarheter i produktionsberoenden.
- Modell-/exportarkiv med Git LFS. Tillfälliga arbetsfiler, Python-cache och
  automatiska Blender-backuper utesluts. Lokala backuper raderas inte.
- `.lfsconfig` hoppar över automatisk nedladdning av modell-/exportarkivet vid
  nya utcheckningar. Webbbyggen behöver inte dessa filer. Hämta dem vid behov
  med `git lfs pull --include="models/**,exports/**" --exclude=""`.

## Prioriterade nästa steg

Uppföljning: artikelserierna FL-P och FL-K är nu implementerade och orderflödet har integrationstestats. Se [artikel- och produktionskontrollen](articles-production-verification-2026-10-19.md), som ersätter artikelstatusen och kompletterar produktionsstatusen nedan.

1. **Betalningsleverantör.** Koden använder direkt Klarna Payments; Mollie och
   Stripe saknas. Klarna har enligt supportsvaret inget registrerat handlaravtal
   och hänvisar till PSP. Efter godkännande: implementera sessioner, verifierad
   webhook, beständiga idempotensnycklar, betalstatus, capture, återbetalning och
   avstämning efter driftfel. Testa varje godkänt betalsätt. Orderbekräftelse eller
   auktorisering är inte bevis på debitering. Utan nycklar kan order fortfarande
   läggas i markerat testläge; besluta om spärr inför försäljningsstart.
2. **Artikelnummer.** Saknas i datamodell och flöden. Föreslagna serier:
   `FL-P-0001` för sortiment och `FL-K-0001` för kundunika modeller. Inför unika,
   beständiga nummer, variantidentiteter och revisionsregler. Migrera befintlig
   katalog med export före/efter. Bevara artikelnumret på orderraden och visa i
   admin, produktvy, ordermejl och produktionsunderlag. Återköp av samma kundmodell
   kräver en modellidentitet skild från ordernumret. Inga nummer tilldelade här.
   Kontroll av tillämpliga märknings-/spårbarhetsregler återstår.
3. **Återhämtning för order och lager.** Separata R2-objekt och minnesköer ger
   ingen transaktion över order, lager och katalog. Inför varaktig åtgärdsjournal
   för exempelvis avbokning/lageråterföring. Katalogimport kan bli partiell vid
   lagringsfel och behöver avstämning/återställningsplan.
4. **Produktionsunderlag.** Mått, vikt och printtid är delvis uttryckligen
   preliminära. Git-filer är inte automatiskt uppladdade i adminbiblioteket eller
   kopplade till produkter. Verifiera revision, mått, passform och slicerprofil
   för rätt Bambu-skrivare, provprinta och ersätt uppskattningar med verkliga
   värden. CAD-filerna har inte geometriskt validerats i denna genomgång.
5. **Drift.** Resend är konfigurerat och användaren har bekräftat leverans.
   Ordermejl har HTML, textreserv och Reply-To till support. `notify()` saknar
   beständig kö/återförsök och loggar bara fel. Adminsessioner ligger i minnet
   och avslutas vid omstart. Testa återställning av R2-backup i separat miljö,
   följ upp personuppgiftsrutiner i `security-gdpr-review.md` och genomför hela
   orderflödet inklusive avbokning/återbetalning före betalningsklar lansering.

## Verifiering

- 189 servertester och 80 klienttester godkända.
- Produktionsbygge för server/klient godkänt.
- Typkontroll för server, klient och Cloudflare godkänd.
- `npm audit --omit=dev`: noll kända sårbarheter vid kontrolltillfället.
- Nya mindre textfiler kontrollerade mot privata nyckel-/sessionmönster utan
  träff. Ingen fullständig historisk eller binär hemlighetsskanning.

Integrationstester kördes med åtkomst till sina lokala servrar; första
sandboxkörningen blockerade loopback. Inga riktiga köp/betalningar genomfördes.
