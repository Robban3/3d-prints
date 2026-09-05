import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { api } from "./routes.ts";
import { ValidationError } from "./validation.ts";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.use("/api", api);

// I produktion serveras den byggda React-appen från samma process.
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(
  process.env.CLIENT_DIST ?? join(here, "../../client/dist"),
);
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Sidan hittades inte" });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ValidationError) {
    res
      .status(400)
      .json({ error: "Kontrollera fälten nedan", fields: error.fields });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Något gick fel på servern" });
};
app.use(errorHandler);

app.listen(port, () => {
  console.log(`3D-prints API kör på http://localhost:${port}`);
});
