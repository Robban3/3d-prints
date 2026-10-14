# Verkstadsöversikt och produktionskort

Admin startar på Översikt. Räknarna filtrerar nya order, jobb i produktion, väntande betalning och passerat planerat klardatum. Sökning omfattar ordernummer, kundnamn, e-post och produkt/projektnamn. Bara mottagna order och order i produktion markeras som försenade; utan manuellt klardatum görs ingen förseningsbedömning.

Produktionskortet sparar maskin, planerad start, klardatum, uppskattade timmar, interna anteckningar och upp till tio egna biblioteksfiler. Kundfilen kan hämtas via adminbehörighet. Egna biblioteksfiler kan kopplas till både butiksorder och kundjobb. Nedladdning av biblioteksfiler kräver fortsatt admininloggning.

Produktionsinformationen är valfri i befintliga order och lagras tillsammans med ordern i den befintliga privata lagringen. Den tas bort ur kundens publika orderrespons. GDPR-minimering rensar interna produktionsanteckningar för avslutade order, och registerutdraget omfattar orderns produktionsinformation.

Revisionen kontrolleras atomiskt när ett kort sparas. En äldre formulärversion får 409 och måste laddas om; den skriver inte över någon annans ändring. Datum och timmar valideras på servern. Filkoppling till en annan kunds modell eller till en produktbild nekas.

Driftkonfigurationen visar om SMTP och Klarna-nycklar finns samt om orderlagringen använder R2. Den är ingen hälsogaranti. Testmejl kan endast skickas av admin och endast till support@formlabb.se. SMTP-anrop har tidsgränser. Klarna-auktorisering visas som auktorisering, inte som mottagen betalning.

E-postaktivering kräver fortfarande en Resend-sändningsnyckel och krypterad SMTP_PASSWORD i Cloudflare. Inkommande Strato-mejl berörs inte. Skarp Klarna-aktivering kräver dessutom godkänd ansökan, API-uppgifter och slutförda capture/refund- och återhämtningsflöden.
