import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import { authorize, STAFF_ROLES } from "../../middleware/authorize";
import { validate, validateParams } from "../../middleware/validate";
import { HttpError } from "../../utils/http-error";
import { UserRole } from "../users/user.entity";
import {
  CreateDocumentUploadSchema,
  DocumentIdParamSchema,
  UpdateDocumentStatusSchema,
} from "./document.schema";
import { DocumentActor, documentService } from "./document.service";
import { successResponse } from "../../utils/response";
import { getDownloadUrl, getLocalDocumentPath } from "../../utils/s3";

/**
 * Document routes.
 *
 * `authenticate` is applied once at the mount point in app.ts, so it is not
 * repeated here. What each route adds is the role gate — and the important change
 * is that reads are open to staff. Every read was previously `authorize("customer")`,
 * which meant an agent or manager could not open a document they were assigned to
 * approve. Ownership is still enforced inside the service, per document.
 */
export const documentRouter = Router();

/** Read access: the owning customer, or any staff member. */
const READ_ROLES = [UserRole.Customer, ...STAFF_ROLES];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Accepted upload types.
 *
 * Compliance documents are PDFs, office files, and photographs of certificates.
 * The previous configuration limited size only, so an HTML or SVG file could be
 * stored and later served from our own origin — which is how a stored XSS gets
 * into a portal that previews uploads.
 *
 * Both the reported MIME type and the file extension must be on the list. A client
 * controls both, so this is not proof of content; it is the cheap check. Real
 * content sniffing belongs with the antivirus/validation job in Phase 2.
 */
const ALLOWED_UPLOAD_TYPES: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/tiff": [".tif", ".tiff"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const ALLOWED_EXTENSIONS = Object.values(ALLOWED_UPLOAD_TYPES).flat();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const permittedExtensions = ALLOWED_UPLOAD_TYPES[file.mimetype];

    if (!permittedExtensions || !permittedExtensions.includes(extension)) {
      callback(
        new HttpError(
          415,
          `Unsupported file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`,
        ),
      );
      return;
    }

    callback(null, true);
  },
});

/** Turns multer's own errors into the API's error shape instead of a 500. */
function handleUpload(field: string) {
  const middleware = upload.single(field);

  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit`
            : error.message;

        next(new HttpError(status, message));
        return;
      }

      next(error);
    });
  };
}

function sendAsync<T>(handler: (req: Request) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req).then((data) => res.json(successResponse(data))).catch(next);
  };
}

/** `authenticate` guarantees `req.user`; this converts that into something typed. */
function actor(req: Request): DocumentActor {
  if (!req.user) {
    throw new HttpError(401, "Unauthorized");
  }

  return { id: req.user.id, role: req.user.role };
}

documentRouter.post(
  "/upload-url",
  authorize(UserRole.Customer),
  validate(CreateDocumentUploadSchema),
  sendAsync((req) => documentService.createUploadTarget(actor(req).id, req.body)),
);

documentRouter.post(
  "/:id/upload",
  authorize(UserRole.Customer),
  validateParams(DocumentIdParamSchema),
  handleUpload("file"),
  sendAsync(async (req) => {
    if (!req.file) {
      throw new HttpError(400, "file is required");
    }

    return documentService.uploadLocalDocument(actor(req), req.params.id, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

documentRouter.get(
  "/:id",
  authorize(...READ_ROLES),
  validateParams(DocumentIdParamSchema),
  sendAsync((req) => documentService.getDocument(actor(req), req.params.id)),
);

documentRouter.get(
  "/:id/download-url",
  authorize(...READ_ROLES),
  validateParams(DocumentIdParamSchema),
  sendAsync((req) => documentService.getDocumentDownloadTarget(actor(req), req.params.id)),
);

documentRouter.get(
  "/:id/download",
  authorize(...READ_ROLES),
  validateParams(DocumentIdParamSchema),
  async (req, res, next) => {
    try {
      const document = await documentService.getDocumentLocalPath(actor(req), req.params.id);
      const signedUrl = await getDownloadUrl({ key: document.s3Key });

      if (signedUrl) {
        res.redirect(signedUrl);
        return;
      }

      res.download(getLocalDocumentPath(document.s3Key), document.fileName);
    } catch (error) {
      next(error);
    }
  },
);

documentRouter.patch(
  "/:id/status",
  // Manager was missing here, so the role accountable for approvals could not
  // approve. Admin keeps the override.
  authorize(UserRole.Agent, UserRole.Manager, UserRole.Admin),
  validateParams(DocumentIdParamSchema),
  validate(UpdateDocumentStatusSchema),
  sendAsync((req) => documentService.updateDocumentStatus(actor(req), req.params.id, req.body)),
);
