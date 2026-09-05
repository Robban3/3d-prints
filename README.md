# Formlabb – webbshop för 3D-printade produkter

En komplett webbutik för 3D-printade produkter med två köpflöden: färdiga produkter
ur sortimentet och kundunika printjobb där kunden laddar upp sin egen modellfil och
får pris direkt.

- **Frontend:** React 18 + TypeScript + Vite + React Router
- **Backend:** Node + Express (TypeScript, körs med Nodes inbyggda type stripping)
- **Datalagring:** filbaserad orderlagring (`server/data/orders.json`) och uppladdade
  modellfiler på disk (`server/uploads/`)

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

- 14 unika produkter i fem kategorier med egna färger, storlekar och specifikationer
- Filtrering per kategori, fritextsökning och sortering på pris, namn eller popularitet
- Produktsida med färg- och storleksval, antal och löpande totalpris
- Varukorg som sparas i `localStorage` och överlever omladdning
- Kassa med validering, fri frakt över 599 kr och orderbekräftelse
- Orderspårning på ordernummer

**Egna printjobb**

- Uppladdning av STL, OBJ, 3MF, STEP eller F3D (drag-and-drop)
- Val av material (PLA, PETG, ABS, TPU, resin) och lagerhöjd
- Reglage för volym och fyllnadsgrad, antal, efterbearbetning och express
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

| Metod  | Väg                   | Beskrivning                                                 |
| ------ | --------------------- | ----------------------------------------------------------- |
| `GET`  | `/api/health`         | Enkel statuskontroll                                        |
| `GET`  | `/api/config`         | Material, kvaliteter, kategorier, gränsvärden, fraktvillkor |
| `GET`  | `/api/products`       | Produktlista, filtrerbar med `category` och `search`        |
| `GET`  | `/api/products/:slug` | En produkt plus relaterade produkter                        |
| `POST` | `/api/quote`          | Prisförslag för ett kundunikt printjobb                     |
| `POST` | `/api/orders`         | Lägger en butiksorder                                       |
| `POST` | `/api/custom-orders`  | Lägger en order för ett eget printjobb                      |
| `GET`  | `/api/orders/:id`     | Hämtar en order för spårning                                |

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

## Miljövariabler

| Variabel      | Standard            | Beskrivning                     |
| ------------- | ------------------- | ------------------------------- |
| `PORT`        | `4000`              | Port för API-servern            |
| `ORDER_STORE` | `data/orders.json`  | Fil där ordrar sparas           |
| `CLIENT_DIST` | `../../client/dist` | Katalog med den byggda klienten |

## Struktur

```
server/
  src/data/       produktkatalog och materialdata
  src/pricing.ts  prismodellen för egna printjobb
  src/validation.ts  indatavalidering
  src/uploads.ts  lagring av uppladdade modellfiler
  src/routes.ts   API-rutter
  test/           enhetstester
client/
  src/pages/      en fil per vy
  src/components/ delade komponenter, bl.a. de genererade produktbilderna
  src/lib/        API-klient, varukorg och formatering
```

Produktbilderna är genererade SVG:er (`client/src/components/ProductArt.tsx`) i
stället för fotografier, så butiken har ett enhetligt uttryck och inga externa
bildberoenden.
