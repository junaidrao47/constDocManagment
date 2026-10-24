import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import { authorize, STAFF_ROLES } from "../../middleware/authorize";
import { validate, validateParams } from "../../middleware/validate";
import { AppError, HttpError } from "../../utils/http-error";
import { UserRole } from "../users/user.entity";
import {
  CreateDocumentUploadSchema,
  CreateVersionIntentSchema,
  DocumentIdParamSchema,
  UpdateDocumentStatusSchema,
  VersionIdParamSchema,
} from "./document.schema";
import { DocumentActor, documentService } from "./document.service";
import { phaseService } from "./phase.service";
import {
  CreatePhasesSchema,
  PhaseIdParamSchema,
  PhaseResultIntentSchema,
  PhaseResultParamSchema,
  UpdatePhaseSchema,
} from "./phase.schema";
import { ALLOWED_EXTENSIONS, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "./upload-constraints";
import { successResponse } from "../../utils/response";
import { getDownloadUrl, getLocalDocumentPath } from "../../utils/s3";

/**
 * Document routes. `authenticate` is applied once at the mount point in app.ts.
 * Reads are open to staff; ownership/assignment is enforced per document in the service.
 */
export const documentRouter = Router();

/** Read access: the owning customer, or any staff member. */
const READ_ROLES = [UserRole.Customer, ...STAFF_ROLES];
/** Who may create document versions: the owning customer, or staff on their behalf. */
const UPLOAD_ROLES = [UserRole.Customer, ...STAFF_ROLES];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const permitted = ALLOWED_UPLOAD_TYPES[file.mimetype];
    if (!permitted || !permitted.includes(extension)) {
      callback(new AppError("FILE_TYPE_NOT_ALLOWED", 415, `Unsupported file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`));
      return;
    }
    callback(null, true);
  },
});

function handleUpload(field: string) {
  const middleware = upload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          next(new AppError("FILE_TOO_LARGE", 413, `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit`));
        } else {
          next(new AppError("BAD_REQUEST", 400, error.message));
        }
        return;
      }
      next(error);
    });
  };
}

function sendAsync<T>(handler: (req: Request) => Promise<T>, status = 200) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req).then((data) => res.status(status).json(successResponse(data))).catch(next);
  };
}

function actor(req: Request): DocumentActor {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return { id: req.user.id, role: req.user.role };
}

// ── Status contracts (any authenticated role) ───────────────────────────────────
documentRouter.get("/statuses", sendAsync(async () => documentService.getStatusContract()));
documentRouter.get("/phases/statuses", sendAsync(async () => phaseService.getStatusContract()));

// ── Document phases (manager of the customer, or admin) ──────────────────────────
documentRouter.post(
  "/:id/phases",
  authorize(UserRole.Manager, UserRole.Admin),
  validateParams(DocumentIdParamSchema),
  validate(CreatePhasesSchema),
  sendAsync((req) => phaseService.createOrReorder(actor(req), req.params.id, req.body), 201),
);

documentRouter.patch(
  "/:id/phases/:phaseId",
  authorize(UserRole.Manager, UserRole.Admin),
  validateParams(PhaseIdParamSchema),
  validate(UpdatePhaseSchema),
  sendAsync((req) => phaseService.updatePhase(actor(req), req.params.id, req.params.phaseId, req.body)),
);

documentRouter.post(
  "/:id/phases/:phaseId/result-upload-intent",
  authorize(UserRole.Manager, UserRole.Admin),
  validateParams(PhaseIdParamSchema),
  validate(PhaseResultIntentSchema),
  sendAsync((req) => phaseService.createResultIntent(actor(req), req.params.id, req.params.phaseId, req.body), 201),
);

documentRouter.post(
  "/:id/phases/:phaseId/result/:versionId/confirm",
  authorize(UserRole.Manager, UserRole.Admin),
  validateParams(PhaseResultParamSchema),
  sendAsync((req) => phaseService.confirmResult(actor(req), req.params.id, req.params.phaseId, req.params.versionId)),
);

// ── Upload pipeline ─────────────────────────────────────────────────────────────
documentRouter.post(
  "/upload-url",
  authorize(...UPLOAD_ROLES),
  validate(CreateDocumentUploadSchema),
  sendAsync((req) => documentService.createUploadTarget(actor(req), req.body), 201),
);

documentRouter.post(
  "/:id/versions/upload-intent",
  authorize(...UPLOAD_ROLES),
  validateParams(DocumentIdParamSchema),
  validate(CreateVersionIntentSchema),
  sendAsync((req) => documentService.createVersionIntent(actor(req), req.params.id, req.body), 201),
);

documentRouter.post(
  "/:id/versions/:versionId/upload",
  authorize(...UPLOAD_ROLES),
  validateParams(VersionIdParamSchema),
  handleUpload("file"),
  sendAsync(async (req) => {
    if (!req.file) throw new HttpError(400, "file is required");
    return documentService.uploadVersionBytes(actor(req), req.params.id, req.params.versionId, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

documentRouter.post(
  "/:id/versions/:versionId/confirm",
  authorize(...UPLOAD_ROLES),
  validateParams(VersionIdParamSchema),
  sendAsync((req) => documentService.confirmVersion(actor(req), req.params.id, req.params.versionId)),
);

documentRouter.get(
  "/:id/versions",
  authorize(...READ_ROLES),
  validateParams(DocumentIdParamSchema),
  sendAsync((req) => documentService.listVersions(actor(req), req.params.id)),
);

documentRouter.get(
  "/:id/versions/:versionId/download-url",
  authorize(...READ_ROLES),
  validateParams(VersionIdParamSchema),
  sendAsync((req) => documentService.getVersionDownloadTarget(actor(req), req.params.id, req.params.versionId)),
);

documentRouter.get(
  "/:id/versions/:versionId/preview-url",
  authorize(...READ_ROLES),
  validateParams(VersionIdParamSchema),
  sendAsync((req) => documentService.getVersionDownloadTarget(actor(req), req.params.id, req.params.versionId, { inline: true })),
);

documentRouter.get(
  "/:id/versions/:versionId/download",
  authorize(...READ_ROLES),
  validateParams(VersionIdParamSchema),
  async (req, res, next) => {
    try {
      const version = await documentService.getVersionForDownload(actor(req), req.params.id, req.params.versionId);
      const inline = req.query.inline === "1";
      const disposition = inline ? "inline" : "attachment";
      const signedUrl = await getDownloadUrl({
        key: version.storageKey,
        responseContentDisposition: `${disposition}; filename="${version.fileName}"`,
        responseContentType: version.mimeType ?? undefined,
      });
      if (signedUrl) return res.redirect(signedUrl);
      if (inline) {
        res.setHeader("Content-Disposition", `inline; filename="${version.fileName}"`);
        res.sendFile(getLocalDocumentPath(version.storageKey));
        return;
      }
      res.download(getLocalDocumentPath(version.storageKey), version.fileName);
    } catch (error) {
      next(error);
    }
  },
);

// ── Single-call convenience uploads (bytes held by the API) ──────────────────────
documentRouter.post(
  "/:id/upload",
  authorize(...UPLOAD_ROLES),
  validateParams(DocumentIdParamSchema),
  handleUpload("file"),
  sendAsync(async (req) => {
    if (!req.file) throw new HttpError(400, "file is required");
    return documentService.uploadCustomerVersion(actor(req), req.params.id, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

documentRouter.post(
  "/:id/approved-upload",
  authorize(UserRole.Agent, UserRole.Manager, UserRole.Admin),
  validateParams(DocumentIdParamSchema),
  handleUpload("file"),
  sendAsync(async (req) => {
    if (!req.file) throw new HttpError(400, "file is required");
    return documentService.uploadOfficialVersion(actor(req), req.params.id, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

// ── Reads ────────────────────────────────────────────────────────────────────────
documentRouter.get("/:id", authorize(...READ_ROLES), validateParams(DocumentIdParamSchema), sendAsync((req) => documentService.getDocument(actor(req), req.params.id)));
documentRouter.get("/:id/history", authorize(...READ_ROLES), validateParams(DocumentIdParamSchema), sendAsync((req) => documentService.history(actor(req), req.params.id)));
documentRouter.get("/:id/download-url", authorize(...READ_ROLES), validateParams(DocumentIdParamSchema), sendAsync((req) => documentService.getDocumentDownloadTarget(actor(req), req.params.id)));
documentRouter.get("/:id/approved-download-url", authorize(...READ_ROLES), validateParams(DocumentIdParamSchema), sendAsync((req) => documentService.getApprovedDocumentDownloadTarget(actor(req), req.params.id)));

documentRouter.get(
  "/:id/download",
  authorize(...READ_ROLES),
  validateParams(DocumentIdParamSchema),
  async (req, res, next) => {
    try {
      const document = await documentService.getDocumentLocalPath(actor(req), req.params.id);
      const approved = req.query.version === "approved";
      const key = approved ? document.approvedS3Key : document.s3Key;
      const name = approved ? document.approvedFileName ?? document.fileName : document.fileName;
      if (approved && !document.approvedS3Key) throw new HttpError(404, "Approved document version not found");
      const signedUrl = await getDownloadUrl({ key: key!, responseContentDisposition: `attachment; filename="${name}"` });
      if (signedUrl) return res.redirect(signedUrl);
      res.download(getLocalDocumentPath(key!), name);
    } catch (error) {
      next(error);
    }
  },
);

// ── Status transition ──────────────────────────────────────────────────────────
documentRouter.patch(
  "/:id/status",
  authorize(UserRole.Agent, UserRole.Manager, UserRole.Admin),
  validateParams(DocumentIdParamSchema),
  validate(UpdateDocumentStatusSchema),
  sendAsync((req) => documentService.updateDocumentStatus(actor(req), req.params.id, req.body)),
);
