# Google Search och Merchant Center

Cloudflare-workern lägger canonical-taggar på butikens offentliga sidor, även när
adressen innehåller spårningsparametrar eller avslutande snedstreck. Äldre
`/produkter/spiral-vas` omdirigeras med HTTP 301 till `/produkter/vas-nexo`.
`run_worker_first` måste vara aktiverat så att HTML och XML passerar SEO-koden.

Produktutbudets `Offer` använder samma pris- och fraktberäkning som kassan:
59 SEK, eller fri frakt från 699 SEK. Leveransdestinationen i strukturerad data är
Sverige. Transporttid har inte lagts till eftersom den inte är fastställd i
butikens publicerade villkor.

Lagerprodukter får returdata enligt `/om-oss`: 30 dagar, retur per post och
kostnadsfri returetikett. Returdata utelämnas för slut i lager och de två
personaliserade produkterna `namnornament` och `var-forsta-jul`, tills deras villkor
har bekräftats. Varningar om returdata kan därför kvarstå för dessa produkter.
Påhittade recensioner eller betyg läggs inte till för att ta bort Googles varningar.

## Efter driftsättning

1. Kontrollera en produktadress i Googles Rich Results Test. Kontrollera också att
   `https://formlabb.se/merchant-feed.xml` returnerar XML från den nya versionen.
2. I Merchant Center, konto **5907176761**, lägg till produktkällan som en fil med
   schemalagd hämtning från `https://formlabb.se/merchant-feed.xml`. Välj Sverige
   och svenska. Granska frakt- och returinställningarna i Merchant Center.
3. Flödet använder den publicerade katalogen och första färg-/storleksalternativet,
   samma pris och bild som produktsidans standardval. Opublicerade produkter och
   produkter utan bild tas inte med. Produkter utan lager anges som `out_of_stock`.
   Flödet innehåller inte alla variantkombinationer. Egentillverkade produkter
   anges utan globala produktidentifierare; inga GTIN-nummer hittas på.
4. I Search Console, inspektera exempeladresser från rapporten "Duplicate without
   user-selected canonical". Jämför Googles val med sidans canonical. Alla
   rapporterade dubbletter behöver inte vara fel. Begär omindexering av ändrade
   huvudadresser och validera relevanta åtgärder i rapporterna.

Kodändringen registrerar inte flödet i Google och startar inte en validering i
Search Console. Dessa steg kräver åtkomst till respektive Google-konto.

## Kontroll

`npm run test:seo` testar HTML, canonical, omdirigeringar, produktdata och XML-flöde
i Miniflare med Cloudflares riktiga HTMLRewriter. Testkatalogen är lokal; inga
anrop görs till butikens produktionskatalog.
