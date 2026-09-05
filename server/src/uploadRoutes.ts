import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pathParam } from './http.ts';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  deleteUpload,
  ensureUploadDir,
  extensionOf,
  filePathFor,
  generateUploadId,
  isAllowedFileName,
  rateLimitStatus,
  readMeta,
  recordUpload,
  storedFileName,
  uploadDir,
  uploadExists,
  writeMeta,
} from './uploads.ts';

export const uploads = Router();

class UploadRejected extends Error {}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadDir()
      .then(() => callback(null, uploadDir()))
      .catch((error: Error) => callback(error, uploadDir()));
  },
  filename: (req, file, callback) => {
    // Filen får ett slumpat namn på disk. Kundens filnamn sparas bara i metadatan,
    // så inget i det kan peka ut en sökväg.
    const id = generateUploadId();
    const extension = extensionOf(file.originalname);
    (req as Request & { uploadId?: string }).uploadId = id;
    callback(null, storedFileName(id, extension));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedFileName(file.originalname)) {
      callback(
        new UploadRejected(`Filformatet stöds inte. Ladda upp ${ALLOWED_EXTENSIONS.join(', ')}.`),
      );
      return;
    }
    callback(null, true);
  },
});

function clientKey(req: Request): string {
  return req.ip ?? 'okänd';
}

/**
 * Multers fel ska bli begripliga meddelanden i formuläret i stället för en 500:a,
 * och en halvskriven fil får aldrig ligga kvar på disken.
 */
const handleUpload: RequestHandler = (req, res, next) => {
  const limit = rateLimitStatus(clientKey(req));
  if (!limit.allowed) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  upload.single('file')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const partial = (req as Request & { uploadId?: string }).uploadId;
    if (partial && req.file?.path) void rm(req.file.path, { force: true });

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: `Filen är större än ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Hör av dig så löser vi överföringen manuellt.`,
      });
      return;
    }
    if (error instanceof UploadRejected) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  });
};

uploads.post('/uploads', handleUpload, (req: Request, res: Response, next) => {
  const file = req.file;
  const id = (req as Request & { uploadId?: string }).uploadId;
  if (!file || !id) {
    res.status(400).json({ error: 'Ingen fil togs emot.' });
    return;
  }

  writeMeta({
    id,
    originalName: file.originalname.slice(0, 200),
    extension: extensionOf(file.originalname),
    size: file.size,
    createdAt: new Date().toISOString(),
    claimedBy: null,
  })
    .then((meta) => {
      recordUpload(clientKey(req), meta.size);
      res.status(201).json({
        upload: {
          id: meta.id,
          fileName: meta.originalName,
          size: meta.size,
          url: `/api/uploads/${meta.id}`,
        },
      });
    })
    .catch(next);
});

/**
 * Nedladdningslänken är själva behörigheten: id:t är 128 slumpade bitar och går
 * inte att gissa. Filen skickas alltid som nedladdning, aldrig för visning i
 * webbläsaren, så att inget innehåll kan köras i vår domän.
 */
uploads.get('/uploads/:id', (req, res, next) => {
  readMeta(pathParam(req.params.id))
    .then(async (meta) => {
      if (!meta || !(await uploadExists(meta))) {
        res.status(404).json({ error: 'Filen hittades inte' });
        return;
      }
      const safeName = meta.originalName.replace(/["\\\r\n]/g, '_');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      );
      res.setHeader('Content-Length', String(meta.size));
      createReadStream(filePathFor(meta)).on('error', next).pipe(res);
    })
    .catch(next);
});

uploads.delete('/uploads/:id', (req, res, next) => {
  readMeta(pathParam(req.params.id))
    .then(async (meta) => {
      if (!meta) {
        res.status(404).json({ error: 'Filen hittades inte' });
        return;
      }
      if (meta.claimedBy) {
        // Filen hör till en lagd order och ska finnas kvar för produktionen.
        res.status(409).json({ error: 'Filen hör till en beställning och kan inte tas bort här.' });
        return;
      }
      await deleteUpload(meta.id);
      res.status(204).end();
    })
    .catch(next);
});
