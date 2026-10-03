import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import path from "path";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { getLocalCatalogPath } from "../../utils/s3";
import {
  CatalogCategorySchema,
  CatalogCategoryPatchSchema,
  CatalogFieldSchema,
  CatalogIdParamSchema,
  CatalogImageParamSchema,
  CatalogImageSchema,
  CatalogItemSchema,
  CatalogItemPatchSchema,
  CatalogListQuerySchema,
} from "./catalog.schema";
import { catalogService } from "./catalog.service";

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

function send<T>(handler: (req: Request) => Promise<T>, status = 200) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req).then((data) => res.status(status).json(successResponse(data))).catch(next);
  };
}

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

export const adminCatalogRouter = Router();
export const publicCatalogRouter = Router();

adminCatalogRouter.get("/categories", send(() => catalogService.listCategories()));
adminCatalogRouter.post("/categories", validate(CatalogCategorySchema), send((req) => catalogService.createCategory(req.body), 201));
adminCatalogRouter.get("/categories/:id", validateParams(CatalogIdParamSchema), send((req) => catalogService.getCategory(req.params.id)));
adminCatalogRouter.patch("/categories/:id", validateParams(CatalogIdParamSchema), validate(CatalogCategoryPatchSchema), send((req) => catalogService.updateCategory(req.params.id, req.body)));
adminCatalogRouter.delete("/categories/:id", validateParams(CatalogIdParamSchema), send((req) => catalogService.deleteCategory(req.params.id)));

adminCatalogRouter.get("/fields", send((req) => catalogService.listFields(typeof req.query.entityType === "string" ? req.query.entityType : undefined)));
adminCatalogRouter.post("/fields", validate(CatalogFieldSchema), send((req) => catalogService.createField(req.body), 201));
adminCatalogRouter.patch("/fields/:id", validateParams(CatalogIdParamSchema), validate(CatalogFieldSchema.partial()), send((req) => catalogService.updateField(req.params.id, req.body)));

adminCatalogRouter.get("/items", validateQuery(CatalogListQuerySchema), send((req) => catalogService.listItems(req.query as never)));
adminCatalogRouter.post("/items", validate(CatalogItemSchema), send((req) => catalogService.createItem(req.body), 201));
adminCatalogRouter.get("/items/:id", validateParams(CatalogIdParamSchema), send((req) => catalogService.getItem(req.params.id)));
adminCatalogRouter.patch("/items/:id", validateParams(CatalogIdParamSchema), validate(CatalogItemPatchSchema), send((req) => catalogService.updateItem(req.params.id, req.body)));
adminCatalogRouter.delete("/items/:id", validateParams(CatalogIdParamSchema), send((req) => catalogService.deleteItem(req.params.id)));
adminCatalogRouter.post("/items/:id/images", validateParams(CatalogIdParamSchema), uploadImage, validate(CatalogImageSchema), send(async (req) => {
  if (!req.file) throw new HttpError(400, "image is required");
  return catalogService.addImage(req.params.id, { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype }, req.body);
}, 201));
adminCatalogRouter.delete("/items/:id/images/:imageId", validateParams(CatalogImageParamSchema), send((req) => catalogService.deleteImage(req.params.id, req.params.imageId)));
adminCatalogRouter.get("/analytics/summary", send(() => catalogService.analyticsSummary()));

publicCatalogRouter.get("/categories", send(() => catalogService.listCategories()));
publicCatalogRouter.get("/images/*", (req, res, next) => {
  const key = String((req.params as Record<string, string>)["0"] ?? "");
  if (!key || key.split("/").includes("..")) {
    next(new HttpError(400, "Invalid catalog image path"));
    return;
  }
  res.sendFile(getLocalCatalogPath(key), (error) => {
    if (error && !res.headersSent) next(new HttpError(404, "Catalog image not found"));
  });
});
publicCatalogRouter.get("/items", validateQuery(CatalogListQuerySchema), send((req) => catalogService.listItems(req.query as never, true)));
publicCatalogRouter.get("/items/:id", validateParams(CatalogIdParamSchema), send((req) => catalogService.getItem(req.params.id, true)));
