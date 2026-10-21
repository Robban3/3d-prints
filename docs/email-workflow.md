# Formlabbs mejlflöde

Alla mejl har skogsgrönt huvud, varmvit bakgrund, tydlig rubrik, kontaktuppgifter, företagsfot och vanlig text som reserv. Avsändaren använder befintlig MAIL_FROM; SMTP-utskick har support@formlabb.se som standardsvarsadress. Inga externa typsnitt eller bilder behövs.

## Automatiska händelser

- Sparad butiksorder eller kundorder: orderbekräftelse till kunden samt separat intern avisering till vardera nygren.cn@gmail.com och rvdv1122@gmail.com.
- Status i_produktion: produktionsbesked till kunden.
- Status skickad: besked om skickad order. Ingen transportör eller leveranstid hittas på.
- Status levererad: leveransbesked. Admin uppmanas bekräfta att leveransen faktiskt har bekräftats. Ingen automatisk fraktspårning finns.
- Status avbruten: avbokningsbekräftelse. Den lovar ingen återbetalning och utför ingen återbetalning.
- Begärd återställning av adminlösenord: befintligt engångsflöde, nu med HTML-design.
- Manuellt mejltest: tydligt märkt designexempel utan riktig order.

## Manuella kundmejl

Admin → Ordrar → öppna orderkortets ”Skicka kundmejl”. Välj typ, skriv meddelande, förhandsgranska och klicka därefter på knappen med mottagarens adress. Ändrad text ogiltigförklarar förhandsvisningen. Kunden och mottagaren hämtas från den sparade ordern, inte från en användarangiven e-postadress.

- Komplettering: beskriv vilken fil eller information som behövs.
- Offert: enbart kundunika order. Ange pris inklusive moms och villkor i meddelandet. Ändrar inte sparad order, skapar ingen betalning och innebär inte att kunden accepterat.
- Försening: beskriv ny uppskattad tid eller när ni återkommer.
- Återbetalning: ange genomfört belopp och verklig återbetalningsreferens och bekräfta att återbetalningen verifierats hos betalningsleverantören. Testorder spärras, belopp måste vara positivt och högst orderbeloppet. Mejlet utför ingen återbetalning och ändrar inte betalstatus. Detta är en manuell kontroll; leverantörsbekräftelse/webhook saknas fortfarande.

Avslutade order kan inte få offert, kompletterings- eller förseningsmejl. API kräver admininloggning. Förhandsvisning skickar inget och ändrar inte ordern. Utskick loggas som orderhändelse utan kundens meddelandetext. Lokal utkorg räknas inte som levererat mejl. SMTP-acceptans är inte bevis på slutlig inkorgsleverans.

## Begränsningar

Ingen varaktig utskickskö, automatisk återförsöksmekanism eller exakt-en-gång-garanti finns. Kontrollera mejltjänstens status innan ett osäkert utskick upprepas. Återbetalning och leverans kontrolleras manuellt mot verkliga underlag. Provbilder använder fiktiva uppgifter; en riktig Gmail-/Outlook-kontroll behöver göras separat.
