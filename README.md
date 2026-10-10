# Formlabb – webbshop för 3D-printade produkter

En komplett webbutik för 3D-printade produkter med två köpflöden: färdiga produkter
ur sortimentet och kundunika printjobb där kunden laddar upp sin egen modellfil och
får pris direkt.

- **Frontend:** React 18 + TypeScript + Vite + React Router 7
- **Backend:** Node + Express 5 (TypeScript, körs med Nodes inbyggda type stripping)
- **Datalagring:** filbaserad lagring under `server/data/` (katalog, ordrar, lagersaldo)
  och uppladdade modellfiler på disk (`server/uploads/`)

## Kom igång

```bash
npm install
npm run dev
```

Klienten startar på http://localhost:5173 och proxar `/api` till API:et på port 4000.

För en produktionsliknande körning bygger du båda paketen och låter servern
leverera den byggda klienten från samma process:

```bash
npm run build
npm start          # http://localhost:4000
```

## Skript

| Kommando            | Beskrivning                                                 |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Startar API och klient parallellt med omladdning            |
| `npm run build`     | Bygger servern (`server/dist`) och klienten (`client/dist`) |
| `npm start`         | Startar den byggda servern, som även serverar klienten      |
| `npm test`          | Kör serverns enhetstester (prissättning och validering)     |
| `npm run typecheck` | Typkontrollerar båda paketen                                |

## Funktioner

**Butiken**

- 22 unika produkter i åtta kategorier, varav tre utgör julkollektionen
- Filtrering per kategori, fritextsökning och sortering på pris, namn eller popularitet
- Produktsida med färg- och storleksval, antal och löpande totalpris
- **Måttanpassade produkter**: reglage för bredd och höjd där pris, mått och
  printtid räknas om medan kunden drar
- Varukorg som sparas i `localStorage` och överlever omladdning
- Lagersaldo som dras av vid köp och hindrar överförsäljning
- Kassa med validering, fri frakt över 599 kr, Klarna-betalning och orderbekräftelse
- Orderspårning på ordernummer med tidslinje över var ordern befinner sig
- **Live printstatus** på spårningen: en framstegsmätare som räknas ur den
  beräknade printtiden och tidpunkten jobbet gick i produktion
- **Plats i produktionskön** på spårningen, med beräknad start och sluttid
- **Materialguiden**: tre frågor om hur delen ska användas, och ett
  rekommenderat material med skäl och varningar
- Bekräftelse- och statusmejl till kunden
- Kundomdömen med betygsfördelning, verifierat köp och svar från verkstaden –
  modererade, så inget syns förrän det godkänts
- Bevakning av slutsålda produkter: ett mejl när saldot fyllts på
- Egen titel, beskrivning och delningsbild per sida, plus `sitemap.xml`,
  `robots.txt` och strukturerad data för produkterna

**Egna printjobb**

- Uppladdning av STL, OBJ, 3MF, STEP eller F3D (drag-and-drop)
- **Automatisk uppmätning** av STL, OBJ och 3MF: volym, yttermått, yta och
  täthet läses ur filen, och volymen är den priset räknas på – kunden behöver
  inte uppskatta något, och priset går inte att pruta ner genom att skicka in en
  mindre volym än modellen har
- **3D-förhandsvisning** av den uppladdade modellen, ritad med WebGL i
  webbläsaren
- Varningar när modellen inte får plats på byggplattan, har hål i ytan,
  överlappar sig själv eller verkar exporterad i fel enhet
- Val av material (PLA, PETG, ABS, TPU, resin) och lagerhöjd
- Reglage för fyllnadsgrad, antal, efterbearbetning och express (volymreglaget
  ersätts av den uppmätta volymen när filen gått att läsa)
- Prisförslag som räknas om löpande mot servern, med full specifikation av
  materialkostnad, maskintid, startavgift, volymrabatt och leveranstid
- Nedladdningslänk till modellfilen på orderbekräftelsen och i orderspårningen

## Prismodellen

Priset för ett kundunikt jobb räknas ut i `server/src/pricing.ts`:

```
effektiv volym = volym × (0,35 + 0,65 × fyllnadsgrad)
styckpris      = (material + maskintid + efterbearbetning) × (1 − volymrabatt)
totalt         = styckpris × antal + startavgift + eventuellt expresstillägg
```

Materialet har en prisfaktor (PLA 1,0 → resin 2,1) och kvaliteten en tidsfaktor
(utkast 0,65 → ultrafin 2,4). Volymrabatten trappas från 4 % vid fem exemplar upp
till 25 % vid hundra. Minsta ordervärde är 149 kr.

Priser räknas alltid ut på servern – klienten skickar aldrig med ett pris som
accepteras rakt av, varken för butiksorder eller egna jobb.

## API

| Metod  | Väg                           | Beskrivning                                                 |
| ------ | ----------------------------- | ----------------------------------------------------------- |
| `GET`  | `/api/health`                 | Enkel statuskontroll                                        |
| `GET`  | `/api/config`                 | Material, kvaliteter, kategorier, gränsvärden, fraktvillkor |
| `GET`  | `/api/products`               | Produktlista, filtrerbar med `category` och `search`        |
| `GET`  | `/api/products/:slug`         | En produkt plus relaterade produkter                        |
| `POST` | `/api/quote`                  | Prisförslag för ett kundunikt printjobb                     |
| `POST` | `/api/orders`                 | Lägger en butiksorder                                       |
| `POST` | `/api/custom-orders`          | Lägger en order för ett eget printjobb                      |
| `GET`  | `/api/orders/:id`             | Hämtar en order för spårning, med plats i kön               |
| `POST` | `/api/products/:slug/reviews` | Lämnar ett omdöme, som läggs i kö för granskning            |
| `POST` | `/api/products/:slug/notify`  | Bevakar en slutsåld produkt                                 |
| `POST` | `/api/discounts/check`        | Prövar en rabattkod mot varukorgen                          |
| `GET`  | `/api/content/home`           | Startsidans hero och de kampanjer som är igång              |
| `POST` | `/api/materials/guide`        | Rekommenderar material utifrån tre frågor                   |
| `POST` | `/api/quotes`                 | Sparar en offert bakom en egen länk                         |
| `GET`  | `/api/quotes/:id`             | Hämtar en sparad offert, med dagens pris vid sidan om       |
| `POST` | `/api/orders/:id/reorder`     | Förbereder en ny beställning av ett tidigare jobb           |
| `GET`  | `/sitemap.xml`                | Sitemap byggd ur katalogen                                  |
| `GET`  | `/robots.txt`                 | Indexeringsregler                                           |

Valideringsfel besvaras med `400` och ett `fields`-objekt som pekar ut de fält som
behöver rättas, vilket formulären visar direkt vid respektive fält.

## Filuppladdning

Modellfilen laddas upp i ett eget steg innan beställningen skickas, så att kunden ser
förloppet direkt och slipper ladda upp igen om något annat fält behöver rättas.
`POST /api/uploads` svarar med ett id som beställningen sedan refererar till:

```
POST /api/uploads        -> { upload: { id, fileName, size, url } }
POST /api/custom-orders  <- { ..., fileId: "<id>" }
```

Så här hanteras filerna:

- **Filnamnet på disk sätts av servern**, inte av kunden. Varje fil får ett slumpat id på
  128 bitar och sparas som `<id><ändelse>`, med kundens ursprungliga filnamn i en
  metadatafil bredvid. Ett filnamn från klienten kan därför aldrig peka ut en sökväg.
- **Endast printbara format tas emot** (STL, OBJ, 3MF, STEP, STP, F3D). Ändelsen
  kontrolleras både vid uppladdningen och när metadatan läses tillbaka.
- **Storleksgränsen är 100 MB.** Överskrids den avbryts uppladdningen och den påbörjade
  filen tas bort från disken.
- **Nedladdning kräver id:t**, som fungerar som en oåtkomlig länk – det går inte att
  gissa och listas ingenstans. Filen skickas alltid som `attachment` med
  `application/octet-stream` och `nosniff`, aldrig för visning i webbläsaren.
- **En fil kan bara kopplas till en order.** När beställningen läggs märks filen med
  ordernumret, och därefter går den varken att återanvända eller radera via API:et.
- **Uppladdningar som aldrig blir en order städas bort** efter ett dygn av en
  bakgrundsstädning som körs varje timme.
- **Takgräns per IP** på 20 filer eller 500 MB per timme, eftersom uppladdningen inte
  kräver inloggning.

Byt lagringen mot S3 eller motsvarande genom att ersätta `server/src/uploads.ts` –
resten av koden går bara via funktionerna där.

**Julkollektionen** är tre kategorier: `julpynt-personligt` (namn och egna
hälsningar), `jul-dekorationer` (granar, stjärnor och julkulor) och `julklappar`
(presenter till familj, vänner och kollegor). De lyfts fram i en egen sektion på
startsidan, där namn och beskrivningar hämtas ur katalogen – en ändring i
panelen slår alltså igenom direkt, och bara urvalet och illustrationen står i
koden.

Kollektionens åtta produkter ritas med fem egna former i samma SVG-språk som
resten av sortimentet, i två nya ytor – granbarr och vinrött.

Produktlistan tar flera kategorier på en gång: `?kategori=a,b,c`. Det är så
kampanjen och kategoriraden pekar på hela kollektionen trots att den är uppdelad
i teman.

Kampanjen på startsidan följer med från start. Den har inget datumfönster satt,
så den syns direkt; sätt start- och slutdatum under **Startsida** i panelen när
den ska gå av sig själv. Bilden ligger i `client/public/kampanjer/` och är
beskuren så att den bara visar produkterna – kampanjblocket har sin egen rubrik
och text, och bildens egen text skulle dubblera den.

## Printstatus och materialguiden

**Framstegsmätaren** behöver ingen rapportering från verkstaden. Printtiden
summeras när ordern läggs (`productionHours` på butiksordern, offertens
`estimatedPrintHours` på ett kundunikt jobb), och tidpunkten då ordern gick i
produktion står redan i dess historik. Mätaren stannar på 99 % så länge jobbet
pågår – att visa 100 % på något som inte är klart är ett löfte vi inte kan
hålla – och säger till när tiden passerats.

Uträkningen finns i både `server/src/progress.ts` och `client/src/lib/progress.ts`:
mätaren måste röra sig medan sidan är öppen, så den kan inte hämtas från
servern en gång i sekunden. Båda testerna använder samma siffror, så en
avvikelse syns.

**Materialguiden** väger materialens egna egenskaper – högsta temperatur,
hållfasthet, böjlighet, detaljnivå och om de tål att stå ute – mot tre frågor om
hur delen ska användas. Egenskaperna redigeras i panelen, så ett nytt material
kommer med i guiden utan att någon kod ändras. Uträkningen ligger bara på
servern; klienten frågar.

## Offerter och ombeställning

En **sparad offert** ligger bakom en länk med 96 slumpade bitar i id:t – länken
är själva behörigheten, precis som för uppladdade modellfiler. Offerten gäller i
30 dagar, och när den öppnas räknas priset också om mot dagens siffror: har
något ändrats står det i klartext i stället för att kunden möts av ett annat
pris i kassan.

Filen som offerten pekar på skyddas från städningen av föräldralösa
uppladdningar så länge offerten gäller (`heldUntil` i uppladdningens metadata).
Annars hade modellen försvunnit inom ett dygn medan offerten fortfarande såg
giltig ut.

**Beställ samma igen** kopierar modellfilen till ett nytt id i stället för att
återanvända originalet. En fil hör till en order och bara en, annars går det
inte att se vilken beställning en fil tillhör. Själva ordern läggs sedan genom
det vanliga formuläret, så den går igenom samma validering, lagerreservation och
betalning som alla andra.

## Betalning med Klarna

Kassan använder **Klarna Payments**. Flödet är tvådelat, så att beloppet aldrig
kan sättas av klienten:

```
POST /api/payments/session   -> { clientToken }     servern prissätter ordern
   (webbläsaren renderar Klarnas widget och kunden godkänner)
POST /api/orders             <- { authorizationToken }
   (servern växlar in auktoriseringen mot en Klarna-order)
```

Beloppen räknas fram av samma kod som lägger ordern, i ören, med momsen per rad
enligt Klarnas formel `total_tax_amount = total_amount - total_amount * 10000 /
(10000 + tax_rate)`. Frakten skickas som en egen rad av typen `shipping_fee`.

**Utan nycklar kör butiken i testläge.** Servern svarar då med en session märkt
`test: true`, kassan visar en tydlig platshållare i stället för widgeten, och
ordern läggs med betalstatus _avvaktar_ – ingen betalning genomförs och inget
utger sig för att vara betalt. Det gör att hela flödet går att använda i
utveckling utan konto hos Klarna.

För att slå på riktiga betalningar, sätt nycklarna från Klarnas
merchant-portal:

```bash
export KLARNA_USERNAME=PK00000_0000000000000000
export KLARNA_PASSWORD=...
export KLARNA_ENV=playground   # eller production
```

Playground är standard. Nycklarna läses bara på servern och skickas aldrig till
webbläsaren; klienten får enbart det kortlivade `client_token` som Klarnas SDK
behöver.

## Adminpanelen

Verkstadens panel ligger på `/verkstad` och har åtta flikar:

- **Översikt** – omsättning per dag, ordrar per status, bästsäljare och lågt lager
- **Ordrar** – flytta ordrar framåt i produktionen, en i taget eller flera på
  en gång, filtrera på status och skriv ut en plocklista
- **Produkter** – lägg till, redigera och ta bort produkter, med foto eller ritad bild
- **Kategorier** – lägg till, byt namn på och ta bort kategorier
- **Material** – material, densitet och kvalitetsnivåer, vars faktorer styr priset på egna printjobb
- **Omdömen** – granska, publicera, avslå och svara på kundomdömen
- **Produktion** – produktionskön och filamentlagret
- **Rabatter** – skapa och stäng av rabattkoder, och se hur många som löst in dem
- **Användare** – konton, roller och avstängningar (bara för ägaren)
- **Import/export** – exportera katalogen, ändra många produkter i filen, läs in igen
- **Historik** – de senaste ändringarna i katalogen och i ordrarnas status

Allt i en produkt går att ändra: namn, webbadress, säljande rad, beskrivning,
kategori, pris, material, ytfinish, mått, vikt, printtid, lagersaldo, färger,
storlekar med pristillägg, valbara mått, höjdpunkter, samt vilken form och yta
produktbilden ritas i – med levande förhandsvisning medan du väljer.

Varje produkt kan ha ett **uppladdat foto**; utan foto ritas illustrationen.
Bilderna har egna gränser (JPG, PNG, WEBP, AVIF, max 8 MB) och serveras med sin
riktiga innehållstyp, medan modellfiler fortsatt bara går att ladda ner.

**Import och export** går via samma JSON-format åt båda hållen. Produkter matchas
på webbadressen, så en exporterad fil som ändrats uppdaterar i stället för att
skapa dubbletter. Importen visar alltid en plan först och skriver ingenting om
någon rad är felaktig.

En ny produkt kan sparas som **utkast**. Utkast syns bara i panelen och går
varken att se eller beställa i butiken förrän de publiceras.

**Katalogen är inte längre en konstant i koden.** Den sås från
`server/src/data/products.ts` första gången servern startar och sparas sedan i
`server/data/catalog.json`. Lagersaldot bor kvar i sin egen lagring, så ett
saldo som ändrats av köp skrivs inte över när produkten redigeras.

Att ta bort en produkt påverkar inte lagda ordrar – varje orderrad bär sin egen
kopia av namn och pris. En kategori som fortfarande har produkter i sig går inte
att ta bort; flytta produkterna först.

**Översiktens siffror** räknas fram ur ordrarna vid varje anrop i stället för att
hållas i en egen räknare, så de kan inte hamna i otakt. Avbrutna ordrar räknas
inte som omsättning men syns i statusfördelningen. Varje diagram visar en serie,
och siffrorna finns också som tabell.

**Omdömen** publiceras aldrig automatiskt. Kön visar hela texten, vem som skrivit
den och vilken produkt det gäller. Finns det publicerade omdömen är det deras
snitt butiken visar; annars behåller produkten katalogens eget värde, så en ny
produkt inte ser ut att ha fått noll i betyg.

**Startsidan** är redigerbar. Heron tar en uppladdad bild eller en video; utan
media ritas den genererade scenen, och utgångstexten är densamma som stod i
koden förut – startsidan ser alltså likadan ut tills någon ändrar den. En video
spelas ljudlöst i loop, vilket är det enda webbläsare startar av sig själva, och
den som bett om minskad rörelse får stillbilden och en spelknapp i stället.

Adresser som skrivs in i panelen måste vara interna sökvägar eller https. En
länk som får vara vad som helst i ett adminfält är en väg in för
`javascript:`-adresser. Mediets adress byggs alltid av uppladdningens id på
servern, aldrig av det klienten skickar.

**Rabattkoder** räknas alltid om på servern. Koden som kommer från kunden är
bara en nyckel; hur mycket den är värd beror på varukorgens innehåll och
bestäms här. Räknaren över inlösen ökas innan betalningen och backas om något
går fel, precis som lagersaldot, så en kod med en användning kvar inte kan lösas
in av två kunder samtidigt. Rabatten går in i Klarnas underlag som en egen rad
med negativt belopp – summan av raderna måste vara exakt det auktoriserade
beloppet.

Fraktavgiften mäts mot summan **före** rabatt, så att en rabattkod inte tar
tillbaka den fria frakt kunden redan handlat ihop till.

**Plocklistan** slår ihop raderna över ordrarna på produkt, färg, storlek och
mått, så varje sak hämtas en gång i stället för en gång per order – men varje
rad bär med sig vilka ordrar den gäller, för plocket är meningslöst om sakerna
sedan hamnar i fel låda. Egna printjobb slås inte ihop; de är unika per order
och ligger i en egen lista. Listan är gjord för att skrivas ut: rutan längst
till vänster är till för pennan, och utskriften tar bara med själva listan.

**Bulkbytet** flyttar flera ordrar till samma status i ett svep. Knappen
erbjuds bara för de statusar som _varje_ markerad order kan gå till – ett
bulkbyte som är till hälften gjort är värre än inget alls. Varje order prövas
ändå för sig på servern, och de som inte gick rapporteras tillbaka med skälet.
Lager, filament, logg och mejl hanteras precis som vid ett enskilt statusbyte,
för det är samma kod som kör.

**Produktionskön** räknas fram ur ordrarna varje gång, inte ur ett eget
register – en kö som är en egen sanning hinner alltid bli osann. Jobb som redan
printar upptar sin skrivare tills de är klara, resten läggs på den skrivare som
blir ledig först, och expressjobb går före i kön men aldrig före något som redan
börjat. Panelen visar maskintid kvar, vilken skrivare varje jobb ligger på och
när allt är klart; kunden ser sin egen plats i kön på orderspårningen, och
ingenting annat ur kön.

**Filamentlagret** är rullar, inte ett saldo per material: två rullar svart PLA
tar slut var för sig, och det är rullen man byter. Åtgången bokförs när ordern
går i produktion, en gång per ordernummer – samma order två gånger vore att tro
att plasten tog slut dubbelt upp. Räcker inte plasten bokförs åtgången ändå och
bristen rapporteras; verkstaden ska inte hindras av bokföringen, men den ska se
att en rulle behöver bytas. Panelen jämför kön mot hyllan och säger hur många
gram som behöver köpas in.

**Valbara mått** är det en 3D-printbutik kan som en lagerhållande butik inte
kan: hyllan görs i den bredd kunden faktiskt behöver. Varje mått har ett
standardvärde som ingår i grundpriset, och ett pris per enhet som gäller åt båda
hållen – en smalare hylla kostar mindre. Kopplas måttet till en axel skrivs
produktens mått om efter kundens val, och printtiden skalas mot hur mycket
större delen blivit.

Reglagen på produktsidan är ett besked, inte ett avtal: servern snäpper alltid
värdena till spannet och räknar om priset när ordern läggs, så `server/src/parameters.ts`
och dess spegling i `client/src/lib/parameters.ts` måste ge samma svar. Testerna
på båda sidor räknar på samma siffror för att fånga det den dagen de glider isär.
Måtten följer med ordern i klartext hela vägen till verkstadens lista och
orderbekräftelsen, och två olika bredder blir två rader i varukorgen.

**Lagerbevakningar** löses ut av panelen: höjer du saldot på en slutsåld produkt
från noll får alla som bevakat den ett mejl, en gång var. Översikten visar hur
många som väntar per produkt.

## Orderns livscykel

En order rör sig `mottagen → i produktion → skickad → levererad`, och kan
avbrytas fram tills den skickats. Övergångarna är strikta, så en order kan inte
hoppa över ett steg eller gå bakåt. Varje byte sparas i orderns historik, som
kunden ser som en tidslinje under **Spåra order**. Avbryts en butiksorder
lämnas exemplaren tillbaka till lagret.

Verkstaden flyttar ordrar i vyn på `/verkstad`, en i taget eller flera på en
gång.

## Inloggning och roller

Panelen har **användare med roller**, inte en delad nyckel. En nyckel som alla
känner till kan inte tas ifrån någon, och loggen visar bara att "admin" gjorde
något. Med användare går det att se vem som flyttade ordern, och att stänga av
en person utan att alla andra måste byta nyckel.

| Roll         | Får                                                   |
| ------------ | ----------------------------------------------------- |
| **Ägare**    | Allt, inklusive användare och roller                  |
| **Verkstad** | Ordrar, produktionskö och filamentlager               |
| **Redaktör** | Katalog, startsida, omdömen, rabatter och statistiken |

Rollerna är få med flit: tre som betyder något är lättare att förvalta än tjugo
kryssrutor som ingen orkar hålla rätt på. Historiken är öppen för alla
inloggade – att veta vem som gjorde vad är hela poängen med att ha användare.

**Första gången** finns ingen användare att logga in som. Då gäller startnyckeln
i `ADMIN_TOKEN`, minst 16 tecken och jämförd i konstant tid:

```bash
export ADMIN_TOKEN=$(openssl rand -hex 24)
```

Logga in med nyckeln och skapa den första ägaren. I samma stund slutar nyckeln
fungera – den är till för att komma igång, inte för att leva vid sidan av
inloggningen. Utan både nyckel och användare är panelen helt avstängd.

**Lösenord** sparas som scrypt-hash med eget salt per användare, och kravet är
enbart längd: minst tolv tecken. Regler om stora bokstäver och tecken får folk
att skriva lappar. En inloggning som inte går igenom svarar likadant vare sig
adressen finns eller inte, och räknar ändå på ett låtsassalt så att svarstiden
inte skvallrar.

**Sessioner** sparas som sha256 av sin token – filen ska inte innehålla något
som går att logga in med om den kommer på villovägar – och gäller tolv timmar.
Ett byte av lösenord eller en avstängning loggar ut personens sessioner direkt,
inte när de råkar löpa ut. Den sista aktiva ägaren går varken att degradera,
stänga av eller ta bort: då stod panelen utan någon som kan släppa in folk igen.

## E-post

Kunden får ett bekräftelsemejl när ordern läggs, och ett brev vid varje
statusbyte som rör hen (i produktion, skickad, levererad).

**Utan SMTP-uppgifter skrivs breven till `data/utkorg` som `.eml`-filer** i
stället för att skickas. Då syns exakt vad kunden skulle ha fått, utan att
något lämnar maskinen – och löftet i gränssnittet motsvaras av något verkligt.
Ett misslyckat utskick fäller aldrig en order som redan är betald och sparad.

```bash
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=...
export SMTP_PASSWORD=...
export MAIL_FROM='Formlabb <hej@formlabb.se>'
```

## Härdning för drift

- **Säkerhetsheaders** via helmet, med en CSP som släpper igenom Klarnas
  skript och iframe men inget annat. `frame-ancestors 'none'` hindrar att
  butiken bäddas in någon annanstans.
- **Takgränser per IP** på de vägar som kostar något: 20 ordrar och 120
  betalsessioner per timme, 120 prisförfrågningar per minut, 30 adminförsök
  per kvart, och 20 filer eller 500 MB per timme. Sessionsgränsen är avsiktligt
  mycket högre än ordergränsen, eftersom en session skapas om varje gång
  varukorgen ändras. Svaret innehåller `Retry-After`.
- **`trust proxy`** är påslaget, annars ser servern bara proxyns adress och
  takgränserna blir verkningslösa. Antalet hopp styrs med `TRUST_PROXY_HOPS`.
- **Klarnas notifieringar** tas emot på
  `POST /api/payments/klarna/notification`, som löser ut en betalning vars
  bedrägerikontroll låg på `PENDING`. Klarna signerar inte sina push-anrop, så
  hemligheten i frågesträngen är det som skiljer ett äkta anrop från ett
  påhittat – utan `KLARNA_NOTIFICATION_SECRET` tas inga notifieringar emot.
- **Filuppladdning mot objektlagring.** Filerna ligger på lokal disk som
  standard, vilket försvinner vid omstart i de flesta driftmiljöer. Sätts
  `S3_BUCKET` läggs de i stället i objektlagring; SDK:n laddas först då.

## Miljövariabler

| Variabel                  | Standard                | Beskrivning                                            |
| ------------------------- | ----------------------- | ------------------------------------------------------ |
| `PORT`                    | `4000`                  | Port för API-servern                                   |
| `ORDER_STORE`             | `data/orders.json`      | Fil där ordrar sparas                                  |
| `REVIEW_STORE`            | `data/omdomen.json`     | Fil där omdömen sparas                                 |
| `WATCH_STORE`             | `data/bevakningar.json` | Fil där lagerbevakningar sparas                        |
| `DISCOUNT_STORE`          | `data/rabatter.json`    | Fil där rabattkoder sparas                             |
| `CONTENT_STORE`           | `data/startsida.json`   | Fil där startsidans innehåll sparas                    |
| `QUOTE_STORE`             | `data/offerter.json`    | Fil där sparade offerter sparas                        |
| `FILAMENT_STORE`          | `data/filament.json`    | Fil där filamentrullar och åtgång sparas               |
| `USER_STORE`              | `data/anvandare.json`   | Fil där användare och sessioner sparas                 |
| `CLIENT_DIST`             | `../../client/dist`     | Katalog med den byggda klienten                        |
| `SHOP_URL`                | `https://formlabb.se`   | Adressen länkar i mejl och sitemap pekar på            |
| `SHOP_TIME_ZONE`          | `Europe/Stockholm`      | Tidszon som avgör dygnsgränsen i översiktens siffror   |
| `BUILD_PLATE_MM`          | `256x256x256`           | Byggvolymen som modeller mäts mot                      |
| `LOW_STOCK_THRESHOLD`     | `5`                     | Saldo som flaggas som lågt i översikten                |
| `LOW_FILAMENT_GRAMS`      | `250`                   | Gram kvar på en rulle innan den flaggas                |
| `PRINTERS`                | `2`                     | Antal skrivare, dvs. hur många jobb som går parallellt |
| `SESSION_HOURS`           | `12`                    | Hur länge en inloggning gäller                         |
| `RATE_LIMIT_REVIEWS`      | `5`                     | Omdömen per IP och timme                               |
| `RATE_LIMIT_WATCHES`      | `10`                    | Lagerbevakningar per IP och timme                      |
| `RATE_LIMIT_DISCOUNTS`    | `60`                    | Försök med rabattkoder per IP och timme                |
| `RATE_LIMIT_SAVED_QUOTES` | `20`                    | Sparade offerter per IP och timme                      |

## Struktur

```
server/
  src/data/       produktkatalog och materialdata
  src/pricing.ts  prismodellen för egna printjobb
  src/validation.ts  indatavalidering
  src/uploads.ts  lagring av uppladdade modellfiler
  src/klarna.ts   betalsessioner och orderväxling mot Klarna
  src/lifecycle.ts orderns tillåtna statusövergångar
  src/mailer.ts   bekräftelse- och statusmejl
  src/stock.ts    lagersaldo med reservation
  src/catalog.ts  produkter och kategorier, redigerbara i adminpanelen
  src/catalogValidation.ts  validering av produktformuläret
  src/catalogTransfer.ts  export och import av katalogen
  src/auditLog.ts  ändringshistorik
  src/modelAnalysis.ts  uppmätning av STL, OBJ och 3MF
  src/reviews.ts  omdömen med moderering
  src/stats.ts    siffrorna till panelens översikt
  src/notify.ts   bevakningar av slutsålda produkter
  src/seo.ts      sitemap och robots.txt
  src/parameters.ts  mått kunden ställer in själv, och vad de kostar
  src/queue.ts    produktionskön: vad som printas, var och när
  src/picking.ts  plocklistan, sammanslagen över ordrarna
  src/users.ts    användare, roller, lösenord och sessioner
  src/filament.ts filamentrullarna och vad som gått åt
  src/shipping.ts fraktalternativ och orderns totalsumma
  src/discounts.ts rabattkoder
  src/content.ts  startsidans hero och kampanjer
  src/quotes.ts   sparade offerter med egen länk
  src/materialGuide.ts  rekommenderar material utifrån hur delen ska användas
  src/progress.ts  hur långt ett printjobb har kommit
  src/storage.ts  lokal disk eller objektlagring för uppladdade filer
  src/rateLimit.ts takgränser per IP
  src/routes.ts   API-rutter
  test/           enhetstester
client/
  src/pages/      en fil per vy
  src/components/ delade komponenter, bl.a. de genererade produktbilderna
  src/components/admin/  adminpanelens vyer och produktformulär
  src/lib/        API-klient, varukorg, formatering och sidornas metadata
  src/lib/mesh.ts modellfiler tolkade i webbläsaren, för 3D-vyn
  test/           komponent- och enhetstester (Vitest + Testing Library)
```

Produktbilderna är genererade SVG:er (`client/src/components/ProductArt.tsx`) i
stället för fotografier, så butiken har ett enhetligt uttryck och inga externa
bildberoenden.
