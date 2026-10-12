# Hela Formlabb hos Cloudflare

React och Express kör i en Cloudflare Container bakom en Worker på samma
HTTPS-adress. En namngiven instans behåller serverns köer för order och lager.
Kör inte flera parallella instanser mot samma JSON-lagring.

Order, katalog, lager, adminlösenordets hash, tema, ändringslogg, metadata och
brevutkorg sparas privat i R2 när `STATE_BUCKET` är satt. Uppladdningar använder
befintlig S3-lagring mot R2. Lokal disk används för tillfälliga filer.
Adminsessioner finns i minnet: efter vila/omstart krävs ny inloggning.

## Cloudflare-panelen

1. Använd Workers Paid och aktiverad R2. Kontrollera kostnaden innan ett nytt
   abonnemang aktiveras.
2. Skapa privat R2-bucket `formlabb-private`. Aktivera inte publik åtkomst.
3. Skapa R2 S3-uppgifter med objektläsning/skrivning för endast denna bucket.
4. Workers & Pages → Create application → importera `Robban3/3d-prints` från
   GitHub. Välj Worker, produktionsgren `main`, rot `/`, byggkommando `npm ci`
   och deploykommando `npm run deploy:cloudflare`. Workers Builds bygger
   Dockerbilden utan Docker på din dator.
5. Lägg till Workerns runtime variables och secrets nedan. Byggmiljöns
   variabler ersätter inte runtime-inställningar.
6. Starta deployment och kontrollera Build/Containers-loggar. Första starten
   kan ta flera minuter. Verifiera `/api/health`, katalog, bilder, `/verkstad`,
   inloggning och att data överlever omstart före riktiga beställningar.

| Runtime variable | Värde |
| --- | --- |
| `PUBLIC_URL` | Exakt HTTPS-ursprung utan avslutande snedstreck |
| `ADMIN_EMAIL` | Administratörens e-post |
| `STATE_BUCKET` | `formlabb-private` |
| `S3_BUCKET` | `formlabb-private` |
| `S3_ENDPOINT` | R2 S3-endpoint från panelen |
| `STATE_PREFIX` | `state/` (standard) |
| `S3_PREFIX` | `uploads/` (standard) |

| Runtime secret | Användning |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | R2 access key |
| `AWS_SECRET_ACCESS_KEY` | R2 secret access key |
| `ADMIN_TOKEN` | Slumpad bootstrapnyckel för första kontoaktiveringen |

För riktiga mejl: sätt `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASSWORD` (secret), `MAIL_FROM`. Verifiera leveransen med en SMTP-port
som stöds av Containers. Utan SMTP lagras brev privat men skickas inte.

För Klarna: secrets `KLARNA_USERNAME`, `KLARNA_PASSWORD`,
`KLARNA_NOTIFICATION_SECRET` och variable `KLARNA_ENV=production`.
`PUBLIC_BASE_URL` sätts automatiskt från `PUBLIC_URL`. Utan Klarna-uppgifter
används befintlig testbetalning; konfigurera riktiga betalningar före försäljning.

## Katalogexport

`npm run export:deployment-catalog` exporterar lokal katalog och publika
produktbilder till `server/seed/catalog.json` och
`client/public/images/catalog-seed`. Kunduppladdningar, order och adminkonton
exporteras inte. Dockerbilden använder seed endast när ingen sparad katalog
finns i R2. Nya deployments ersätter inte adminändringar i R2.

## Verifiering och direkt deployment

```powershell
npm ci
npm test
npm run build
npx tsc -p cloudflare/tsconfig.json
npm run deploy:cloudflare
```

Direkt deployment kräver Wrangler-inloggning och Docker. Använd annars Workers
Builds. Lägg aldrig secrets i Git, `wrangler.jsonc` eller katalogexporten.
`.dev.vars` ignoreras av Git.

Referenser:
- https://developers.cloudflare.com/containers/guides/deploy/
- https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/
- https://developers.cloudflare.com/containers/platform/pricing/
