import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { readFile, rm } from 'node:fs/promises';
import { pathParam } from './http.ts';
import { ModelParseError, analyzeModel, isAnalyzableExtension } from './modelAnalysis.ts';
import { storage as fileStore } from './storage.ts';
import {
  ALLOWED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSIONS,
  isAllowedImageName,
  isAllowedMediaName,
  isCatalogAsset,
  isMediaExtension,
  isVideoExtension,
  mediaContentType,
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
  writeMeta,
} from './uploads.ts';
import type { UploadMeta } from './uploads.ts';

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

const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 4 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedImageName(file.originalname)) {
      callback(new UploadRejected(`Bilden måste vara ${IMAGE_EXTENSIONS.join(', ')}.`));
      return;
    }
    callback(null, true);
  },
});

/**
 * Startsidans hero och kampanjer tar både bild och video. Gränsen sätts efter
 * video, så en bild som ändå är mindre påverkas inte.
 */
const mediaUpload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 4 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedMediaName(file.originalname)) {
      callback(
        new UploadRejected(
          `Filen måste vara ${[...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(', ')}.`,
        ),
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
 * Mäter upp modellen så att priset kan räknas på filens riktiga volym i stället
 * för på en siffra kunden gissat. Uppmätningen är en bonus, inte ett krav: en
 * fil vi inte kan läsa – ett CAD-format eller en exotisk export – ska fortfarande
 * gå att beställa, och då får verkstaden sätta volymen manuellt.
 */
async function measure(
  localPath: string,
  extension: string,
): Promise<Pick<UploadMeta, 'analysis' | 'analysisError'>> {
  if (!isAnalyzableExtension(extension)) return {};
  try {
    return { analysis: analyzeModel(await readFile(localPath), extension) };
  } catch (error) {
    return {
      analysisError:
        error instanceof ModelParseError
          ? error.message
          : 'Modellen gick inte att mäta upp automatiskt. Vi tittar på den för hand.',
    };
  }
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

uploads.post('/uploads', handleUpload, async (req: Request, res: Response) => {
  const file = req.file;
  const id = (req as Request & { uploadId?: string }).uploadId;
  if (!file || !id) {
    res.status(400).json({ error: 'Ingen fil togs emot.' });
    return;
  }

  const extension = extensionOf(file.originalname);
  // Uppmätningen sker före put: med objektlagring finns originalet inte kvar lokalt efteråt.
  const measured = await measure(file.path, extension);
  await fileStore().put(storedFileName(id, extension), file.path, 'application/octet-stream');
  const meta = await writeMeta({
    id,
    kind: 'model',
    originalName: file.originalname.slice(0, 200),
    extension,
    size: file.size,
    createdAt: new Date().toISOString(),
    claimedBy: null,
    ...measured,
  });

  recordUpload(clientKey(req), meta.size);
  res.status(201).json({
    upload: {
      id: meta.id,
      fileName: meta.originalName,
      size: meta.size,
      url: `/api/uploads/${meta.id}`,
      analysis: meta.analysis,
      analysisError: meta.analysisError,
    },
  });
});

/**
 * Nedladdningslänken är själva behörigheten: id:t är 128 slumpade bitar och går
 * inte att gissa. Filen skickas alltid som nedladdning, aldrig för visning i
 * webbläsaren, så att inget innehåll kan köras i vår domän.
 */
uploads.get('/uploads/:id', (req, res, next) => {
  readMeta(pathParam(req.params.id))
    .then(async (meta) => {
      const object = meta
        ? await fileStore().get(storedFileName(meta.id, meta.extension), filePathFor(meta))
        : undefined;
      if (!meta || !object) {
        res.status(404).json({ error: 'Filen hittades inte' });
        return;
      }
      const safeName = meta.originalName.replace(/["\\\r\n]/g, '_');
      const isMedia = isCatalogAsset(meta) || isMediaExtension(meta.extension);
      // Bilder och video ska visas i butiken; modellfiler ska aldrig renderas
      // av webbläsaren.
      res.setHeader(
        'Content-Type',
        isMedia ? mediaContentType(meta.extension) : 'application/octet-stream',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        isMedia
          ? `inline; filename="${safeName}"`
          : `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      );
      if (isMedia) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      // Vi svarar inte på delintervall. En kort hero-loop spelas ändå, men
      // webbläsaren ska inte tro att den kan spola i filen.
      if (isVideoExtension(meta.extension)) res.setHeader('Accept-Ranges', 'none');
      res.setHeader('Content-Length', String(meta.size));
      object.body.on('error', next).pipe(res);
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

/**
 * Produktbilder. Till skillnad från modellfiler hör de till katalogen och
 * knyts aldrig till en order, så de städas inte bort som föräldralösa.
 */
const handleImage: RequestHandler = (req, res, next) => {
  const limit = rateLimitStatus(clientKey(req));
  if (!limit.allowed) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  imageUpload.single('file')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (req.file?.path) void rm(req.file.path, { force: true });

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: `Bilden är större än ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
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

/**
 * Media till startsidan: bild eller video. Ligger för sig från produktbilderna,
 * som ska vara bilder och inget annat.
 */
const handleMedia: RequestHandler = (req, res, next) => {
  const limit = rateLimitStatus(clientKey(req));
  if (!limit.allowed) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  mediaUpload.single('file')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (req.file?.path) void rm(req.file.path, { force: true });

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: `Filen är större än ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB. Korta ner videon eller komprimera den hårdare.`,
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

uploads.post('/uploads/media', handleMedia, async (req: Request, res: Response) => {
  const file = req.file;
  const id = (req as Request & { uploadId?: string }).uploadId;
  if (!file || !id) {
    res.status(400).json({ error: 'Ingen fil togs emot.' });
    return;
  }

  const extension = extensionOf(file.originalname);
  const kind = isVideoExtension(extension) ? 'video' : 'image';
  await fileStore().put(storedFileName(id, extension), file.path, mediaContentType(extension));
  const meta = await writeMeta({
    id,
    kind,
    originalName: file.originalname.slice(0, 200),
    extension,
    size: file.size,
    createdAt: new Date().toISOString(),
    claimedBy: null,
  });

  recordUpload(clientKey(req), meta.size);
  res.status(201).json({
    media: {
      kind,
      id: meta.id,
      fileName: meta.originalName,
      size: meta.size,
      url: `/api/uploads/${meta.id}`,
    },
  });
});

uploads.post('/uploads/images', handleImage, (req: Request, res: Response, next) => {
  const file = req.file;
  const id = (req as Request & { uploadId?: string }).uploadId;
  if (!file || !id) {
    res.status(400).json({ error: 'Ingen bild togs emot.' });
    return;
  }

  const extension = extensionOf(file.originalname);
  fileStore()
    .put(storedFileName(id, extension), file.path, mediaContentType(extension))
    .then(() =>
      writeMeta({
        id,
        kind: 'image',
        originalName: file.originalname.slice(0, 200),
        extension,
        size: file.size,
        createdAt: new Date().toISOString(),
        claimedBy: null,
      }),
    )
    .then((meta) => {
      recordUpload(clientKey(req), meta.size);
      res.status(201).json({
        image: {
          id: meta.id,
          fileName: meta.originalName,
          size: meta.size,
          url: `/api/uploads/${meta.id}`,
        },
      });
    })
    .catch(next);
});
