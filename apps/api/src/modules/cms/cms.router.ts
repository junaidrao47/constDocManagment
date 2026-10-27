import crypto from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import path from "path";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { AppError, HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { magicBytesMatch } from "../../utils/magic-bytes";
import {
  ContentKeyParamSchema,
  ContentPublishSchema,
  ContentPutSchema,
  HeroIdParamSchema,
  HeroReorderSchema,
  HeroSlidePatchSchema,
  HeroSlideSchema,
  HeroToggleSchema,
  PublicLocaleQuerySchema,
} from "./cms.schema";
import { CmsSettingsPatchSchema } from "./cms-settings";
import { cmsService } from "./cms.service";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extensions = ALLOWED_IMAGES[file.mimetype];
    if (!extensions || !extensions.includes(path.extname(file.originalname).toLowerCase())) {
      callback(new HttpError(415, "Only JPG, PNG, and WebP images are allowed"));
      return;
    }
    callback(null, true);
  },
});

function uploadImage(req: Request, res: Response, next: NextFunction): void {
  imageUpload.single("image")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new HttpError(413, "Image exceeds the 8MB limit"));
      return;
    }
    next(error);
  });
}

function send<T>(handler: (req: Request) => Promise<T>, status = 200) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req).then((data) => res.status(status).json(successResponse(data))).catch(next);
  };
}

function actorId(req: Request): string {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user.id;
}

/** Parses the optional `data` JSON field that rides along with a multipart image upload. */
function parseMetaField(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION_FAILED", 400, "The `data` field must be valid JSON");
  }
}

// ── Admin router (mounted behind authenticate + authorize(Admin)) ────────────────

export const adminCmsRouter = Router();

adminCmsRouter.get("/hero-slides", send(() => cmsService.listHeroSlides()));

adminCmsRouter.post(
  "/hero-slides",
  uploadImage,
  send(async (req) => {
    if (!req.file) throw new HttpError(400, "image is required");
    if (!magicBytesMatch(req.file.buffer, req.file.mimetype)) {
      throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "The uploaded file's contents do not match its image type");
    }
    const parsed = HeroSlideSchema.safeParse(parseMetaField(req.body?.data));
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid slide metadata", parsed.error.flatten());
    }
    return cmsService.createHeroSlide(
      { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype },
      parsed.data,
      actorId(req),
    );
  }, 201),
);

adminCmsRouter.patch(
  "/hero-slides/reorder",
  validate(HeroReorderSchema),
  send((req) => cmsService.reorderHeroSlides(req.body.ids, actorId(req))),
);

adminCmsRouter.get("/hero-slides/:id", validateParams(HeroIdParamSchema), send((req) => cmsService.getHeroSlide(req.params.id)));

adminCmsRouter.patch(
  "/hero-slides/:id",
  validateParams(HeroIdParamSchema),
  validate(HeroSlidePatchSchema),
  send((req) => cmsService.updateHeroSlide(req.params.id, req.body, actorId(req))),
);

adminCmsRouter.patch(
  "/hero-slides/:id/active",
  validateParams(HeroIdParamSchema),
  validate(HeroToggleSchema),
  send((req) => cmsService.toggleHeroSlide(req.params.id, req.body.isActive, actorId(req))),
);

adminCmsRouter.delete(
  "/hero-slides/:id",
  validateParams(HeroIdParamSchema),
  send((req) => cmsService.deleteHeroSlide(req.params.id)),
);

adminCmsRouter.get("/settings", send(() => cmsService.getSettings()));
adminCmsRouter.put(
  "/settings",
  validate(CmsSettingsPatchSchema),
  send((req) => cmsService.updateSettings(req.body, actorId(req))),
);

adminCmsRouter.get("/content", send(() => cmsService.listContent()));
adminCmsRouter.get(
  "/content/:key",
  validateParams(ContentKeyParamSchema),
  send((req) => cmsService.getContentAdmin(req.params.key)),
);
adminCmsRouter.put(
  "/content/:key",
  validateParams(ContentKeyParamSchema),
  validate(ContentPutSchema),
  send((req) => cmsService.putContent(req.params.key, req.body, actorId(req))),
);
adminCmsRouter.post(
  "/content/:key/publish",
  validateParams(ContentKeyParamSchema),
  validate(ContentPublishSchema),
  send((req) => cmsService.setPublished(req.params.key, req.body.publish, actorId(req))),
);
adminCmsRouter.get(
  "/content/:key/history",
  validateParams(ContentKeyParamSchema),
  send((req) => cmsService.contentHistory(req.params.key)),
);

// ── Public router (mounted at /api/public, no auth) ──────────────────────────────

export const publicCmsRouter = Router();

/** Sends a JSON payload with a 60s cache + ETag; answers 304 when the client's tag matches. */
function sendCached(req: Request, res: Response, data: unknown): void {
  const body = JSON.stringify(successResponse(data));
  const etag = `"${crypto.createHash("sha1").update(body).digest("hex")}"`;
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(body);
}

function localeFrom(req: Request): "en" | "es" {
  const q = (req.query.locale as string | undefined) ?? "";
  if (q === "en" || q.toLowerCase().startsWith("en")) return "en";
  if (q === "es" || q.toLowerCase().startsWith("es")) return "es";
  const header = req.headers["accept-language"] ?? "";
  return String(header).toLowerCase().startsWith("en") ? "en" : "es";
}

publicCmsRouter.get("/hero", validateQuery(PublicLocaleQuerySchema), (req, res, next) => {
  cmsService.publicHero(localeFrom(req)).then((data) => sendCached(req, res, data)).catch(next);
});

publicCmsRouter.get("/content", validateQuery(PublicLocaleQuerySchema), (req, res, next) => {
  cmsService.publicContent(localeFrom(req)).then((data) => sendCached(req, res, data)).catch(next);
});
