import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { api } from './routes.ts';
import { uploads } from './uploadRoutes.ts';
import { ORPHAN_MAX_AGE_MS, sweepOrphans } from './uploads.ts';
import { ValidationError } from './validation.ts';
import { KlarnaError } from './klarna.ts';
import { OutOfStockError } from './stock.ts';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.use('/api', uploads);
app.use('/api', api);

// I produktion serveras den byggda React-appen från samma process.
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(process.env.CLIENT_DIST ?? join(here, '../../client/dist'));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Sidan hittades inte' });
});

const clientErrors: Record<number, string> = {
  400: 'Förfrågan gick inte att tolka',
  413: 'Förfrågan är för stor',
  415: 'Innehållstypen stöds inte',
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ValidationError) {
    res.status(400).json({ error: 'Kontrollera fälten nedan', fields: error.fields });
    return;
  }

  if (error instanceof OutOfStockError) {
    res.status(409).json({ error: 'Lagersaldot räcker inte längre', fields: error.fields });
    return;
  }

  if (error instanceof KlarnaError) {
    // Detaljen loggas för felsökning men skickas inte vidare till kunden.
    console.error('Klarna svarade med fel', error.status, error.detail);
    res.status(error.status >= 500 ? 502 : 400).json({
      error: 'Betalningen gick inte igenom. Försök igen eller välj att få en betalningslänk.',
    });
    return;
  }

  // Middleware som express.json sätter själva statuskoden på sina fel, till
  // exempel 400 för trasig JSON. Det är kundens fel och ska inte bli en 500:a.
  const status =
    (error as { status?: number; statusCode?: number } | null)?.status ??
    (error as { statusCode?: number } | null)?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: clientErrors[status] ?? 'Ogiltig förfrågan' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Något gick fel på servern' });
};
app.use(errorHandler);

app.listen(port, () => {
  console.log(`3D-prints API kör på http://localhost:${port}`);
});

// Uppladdningar som aldrig blev en beställning städas bort en gång i timmen.
const sweepInterval = setInterval(
  () => {
    sweepOrphans(ORPHAN_MAX_AGE_MS)
      .then((removed) => {
        if (removed > 0) console.log(`Städade bort ${removed} oanvända uppladdningar`);
      })
      .catch((error: unknown) => console.error('Städning av uppladdningar misslyckades', error));
  },
  60 * 60 * 1000,
);
sweepInterval.unref();
