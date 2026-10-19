# Artikelnummer och produktionskontroll, 2026-10-19

## Artikelserier

- FL-P-0001 identifierar en sortimentsprodukt. Färg och storlek får egna stabila variantnummer, exempelvis FL-P-0001-001.
- FL-K-0001 identifierar en kundmodell med kund, filinnehåll, material, kvalitet och infill som identitet. Antal ändrar inte artikelnumret. Ändrat filinnehåll eller tillverkningsval ger ett nytt nummer.
- Numren reserveras beständigt i privat articles.json och återanvänds inte efter borttagning. Registret måste säkerhetskopieras tillsammans med katalogen och orderlagret.
- Befintlig katalog säkerhetskopieras före migrering. Orderrader sparar artikelnummer och då aktuella produktionsuppgifter. Äldre order kompletteras vid öppning av orderlistan när identiteten kan matchas säkert; osäkra matchningar lämnas utan gissning.
- Nummer visas i produktvy, admin, orderöversikt, produktionskort och orderbekräftelse. Kundens egna inmatade artikelnummer styr inte orderraden.

## Orderflöde

Verifiering: 197 servertester och 82 klienttester i hela sviten, samt ett separat godkänt migreringstest för äldre order. Produktionsbygge och typkontroll för server, klient och Cloudflare är godkända.

Isolerade integrationstester kontrollerar sortimentsorder och kundorder, serverberäknade uppgifter, privat orderåtkomst, lageravdrag, avbokning och lageråterföring, produktionsplan, revisionskonflikt, leveransstatus och lokalt sparat ordermejl. Inga riktiga betalningar eller mejl skickas i dessa tester.

Produktionskortets kontroll granskar artikelnummer, sparad plan, filåtkomst och preliminära uppgifter. Betalning och fysisk tillverkning kräver separat kontroll. Auktorisering och testbetalning är inte bevis på debitering.

## Geometrisk granskning

Resultat: [maskinläsbar rapport](production-model-audit-2026-10-19.json). Skript: scripts/audit-production-models.py.

31 STL-/3MF-filer för 11 av 56 publicerade produkter granskades utan tolkningsfel. För övriga 45 produkter har denna begränsade sökvägsmappning inte identifierat en mesh; det bevisar inte att underlag saknas i andra mappar eller adminbiblioteket.

Viktiga avvikelser:

- Bokstödens båda granskade filer motsvarar 90 × 120 × 200 mm och har sluten kanttopologi.
- Granskade färgexporter av lucia, stjärngosse och pepparkaksgubbe är 50 mm höga, medan figurerna ska vara 100 mm. Slutliga utskriftsfiler för tärnornas båda hårfärger har inte identifierats i denna mappning.
- Senaste Noel-kroppen mäter 55 × 55 × 51,8 mm i filens orientering. Dekorationerna behöver också räknas in. Det motsvarar inte det godkända yttermåttet 55 × 35 × 55 mm.
- Häxans gömma har 22 icke-manifoldkanter och 13 degenererade trianglar i den svarta delen; insatsen har fyra respektive en. Dessa behöver granskas före utskrift.
- Stjärnkulans gulddel har två icke-manifoldkanter. Kulornas huvudmått är 80 × 80 × 95 mm.
- Pepparkakshusets färgexport är 50 mm hög och ska inte förväxlas med den större byggsatsen. Separata byggsatsdelars mått visar inte ensam monterat yttermått.

Rapporten kontrollerar filhash, storlek, mått och kanttopologi. Den verifierar inte självskärningar, väggtjocklek, passform, sammanbyggda mått, slicerprofil eller provutskrift. Originalmodellerna har inte ändrats. Produktionsuppskattningar ska ersättas med slicerresultat och provprint innan de betraktas som verifierade.

## Återstår

Verifiera skarpa betalningar genom vald och godkänd betalningsleverantör, åtgärda modellavvikelserna, koppla rätt filrevision till varje produkt och genomför slicer-/provprintkontroll. Återställning av privat lagring och avstämning efter driftfel behöver också provas separat. Detta är ingen juridisk märkningskontroll.
