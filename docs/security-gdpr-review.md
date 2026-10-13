# Säkerhets- och GDPR-granskning – 13 oktober 2026

Personuppgiftsansvarig: P.C Service & Säkerhet AB, 559512-7381, Ebbe Lieberathsgatan 25, 412 83 Göteborg. Kontakt: support@formlabb.se. Formlabb är butikens varumärke.

## Rättade brister

- Hög: `/api/orders/:id` lämnade ut hela ordern med namn, kontaktuppgifter, adress och filreferenser till den som kände till ett ordernummer med 24 slumpade bitar. Det krävs nu en separat HMAC-SHA256-nyckel per order. Nyckeln skickas i Authorization-headern; privata länkar använder URL-fragment så att nyckeln inte hamnar i URL-loggar. Fel eller saknad nyckel ger 404. Kunduppgifter sparas inte längre i React Routers navigeringshistorik.
- Hög: produktbildsuppladdning saknade adminskydd. Nu krävs adminbehörighet. Publika bild-ID:n kan inte längre användas för att radera katalogbilder eller koppla dem som kundmodeller.
- Medel: bootstrapnyckeln gav permanent adminåtkomst även efter lösenordsaktivering. Den fungerar nu bara innan ett adminkonto är aktiverat; därefter krävs en riktig session.
- Medel: orderdata, administrativa svar och kundmodellfiler saknade konsekvent cachebegränsning. De använder nu private/no-store. Produktbilder förblir publika.
- Medel: råa felobjekt och Klarna-felsvar kunde skrivas till loggar. De loggas inte längre; referrer-policy är no-referrer.
- Medel: IP-nycklar i rate-limitkartorna rensades inte när tidsfönstret löpt ut. De gallras nu från minnet varje minut.
- Funktionellt: kontaktformuläret visade leveransbekräftelse utan att skicka meddelandet. Nu används en tydlig länk till supportens e-postadress. Exempeltelefonnumret har tagits bort.

## Genomförda GDPR-funktioner

- Integritetssida `/integritet`, med ansvarig, ändamål, rättsliga grunder, rättigheter, leverantörer, lagringskriterier och information om kakor. Länk i kundformulär och sidfot. Ingen samtyckesruta används som falsk rättslig grund för en beställning.
- Kundprintfiler gallras 90 dagar efter leverans eller avbruten order. Avslutande statushändelse måste finnas och ha giltigt datum; annars krävs manuell granskning. Gallring sker vid start och varje timme medan tjänsten är igång. Egna biblioteksfiler, produktbilder och aktiva order berörs inte. Filreferenser och kundfilnamn tas också bort ur ordern.
- Oanvända kunduppladdningar gallras enligt befintlig 24-timmarsregel.
- Admin → GDPR ger registerutdrag filtrerat på kundens e-post. Utdraget gäller webbshoppen, inte all e-post, alla betalningsuppgifter eller transportörens lagring.
- Admin → GDPR kan efter identitets- och laglighetsprövning radera kundfiler och extra uppgifter i avslutade order. Aktiv produktion lämnas orörd. Namn, e-post, adress och ekonomiska orderuppgifter behålls för separat bedömning; åtgärden är INTE fullständig radering.
- Inga kända produktionsberoendesårbarheter vid npm audit --omit=dev. Inga spårade .env-, PEM- eller credentialsfiler hittades i den aktuella Git-förteckningen. Detta är inte en fullständig historisk hemlighetsskanning.

## Driftrutiner som bolaget måste slutföra

1. Spara och kontrollera personuppgiftsbiträdesavtal, leverantörernas aktuella underbiträden och villkor för tredjelandsöverföring. Cloudflares EU-bucket är inte bevis för att ALL behandling sker inom EU/EES. Kontrollera även Resend innan e-post aktiveras och Klarnas roll/villkor före riktiga betalningar. Inga nya avtal har signerats av agenten.
2. Fastställ dokumenterad gallring för andra uppgifter än printfiler: orderkontakt, fritext, stödärenden, lokala exportfiler, privata utkast i `state/data/utkorg`, bokföring och eventuella säkerhetskopior. Bokföringskravet gäller räkenskapsinformation, inte automatiskt varje kunduppgift. Webbshoppen raderar inte hela orderregistret automatiskt.
3. Vid en rättighetsbegäran: registrera datum, verifiera identitet proportionerligt, exportera via admin, kontrollera kompletterande e-post/betalnings-/leveranssystem och lämna ut säkert. Rättelser och fullständig radering av kvarvarande uppgifter kräver separat bedömning och dokumenterad åtgärd. Sätt en intern svarsrutin som uppfyller GDPR:s tidsfrister.
4. Kontrollera historiska åtkomstloggar för obehöriga orderläsningar. Granskningen visar en åtkomstbrist; den bevisar inte att en utomstående faktiskt läst uppgifter. Bedöm och dokumentera om en personuppgiftsincident har inträffat. En anmälningspliktig incident ska normalt anmälas till IMY inom 72 timmar från vetskap. Agenten har inte gjort någon incidentanmälan.
5. Skydda Cloudflare, GitHub, admin och e-postkonton med lämplig åtkomststyrning och MFA där tjänsten erbjuder det. Kontrollera återställningsmöjligheter och återläsning utan att behålla onödiga personuppgifter i testdata.
6. Äldre orderlänkar utan privat nyckel kan inte längre användas för att läsa kunduppgifter. Vid en verifierad kundförfrågan kan en ny statusbekräftelse generera en privat länk. E-post är ännu inte aktiverad; privata länkar måste därför också kunna sparas vid beställningen.
7. Byte av ADMIN_TOKEN eller ORDER_ACCESS_SECRET ogiltigförklarar gamla privata orderlänkar. Gör nyckelrotation planerat. Delning av den privata länken ger mottagaren åtkomst till ordern.
8. Klarna är ännu inte aktiverat för skarpa betalningar. Före aktivering behöver betalningsflödet verifieras för capture/refund, idempotens och återhämtning när en auktorisering lyckas men efterföljande orderlagring misslyckas. PENDING markeras nu som avvaktande. Det är kvarvarande betalningsarbete, inte ett bevisat dataläckage.

## Underlag

- IMY, information och rättslig grund: https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/foretag/
- IMY, rättigheter: https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/
- IMY, incidenthantering: https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/hantering-av-personuppgiftsincidenter/
- PTS, nödvändiga kakor: https://www.pts.se/internet-och-telefoni/kakor-cookies/
- BFN, arkivering: https://www.bfn.se/fragor-och-svar/arkivering/
- Cloudflare DPA: https://www.cloudflare.com/cloudflare-customer-dpa/
- Cloudflare Workers Logs (lagringsperiod enligt produktdokumentation): https://developers.cloudflare.com/workers/observability/logs/workers-logs/

Granskningen omfattar kod, behörighets- och gallringstester, beroendegranskning och begränsade publika kontroller. Den omfattar inte fullständig penetrationstestning, Cloudflares interna system, alla historiska loggar eller en juridisk certifiering.
