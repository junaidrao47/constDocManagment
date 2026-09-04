import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { CreateDocumentUploadSchema, UpdateDocumentStatusSchema } from "./document.schema";
import { documentService } from "./document.service";
import { successResponse } from "../../utils/response";
import { getDownloadUrl, getLocalDocumentPath } from "../../utils/s3";

export const documentRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function sendAsync<T>(handler: (req: Request) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req).then((data) => res.json(successResponse(data))).catch(next);
  };
}

documentRouter.post(
  "/upload-url",
  authenticate,
  authorize("customer"),
  validate(CreateDocumentUploadSchema),
  sendAsync((req) => {
    if (!req.user) {
      throw new Error("Authenticated user is required");
    }

    return documentService.createUploadTarget(req.user.id, req.body);
  }),
);

documentRouter.post(
  "/:id/upload",
  authenticate,
  authorize("customer"),
  upload.single("file"),
  sendAsync(async (req) => {
    if (!req.user) {
      throw new Error("Authenticated user is required");
    }

    if (!req.file) {
      throw new Error("file is required");
    }

    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    return documentService.uploadLocalDocument(req.user.id, documentId, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

documentRouter.get(
  "/:id/download-url",
  authenticate,
  authorize("customer"),
  sendAsync((req) => {
    if (!req.user) {
      throw new Error("Authenticated user is required");
    }

    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    return documentService.getDocumentDownloadTarget(req.user.id, documentId);
  }),
);

documentRouter.get(
  "/:id/download",
  authenticate,
  authorize("customer"),
  async (req, res, next) => {
    try {
      if (!req.user) {
        throw new Error("Authenticated user is required");
      }

      const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const document = await documentService.getDocumentLocalPath(req.user.id, documentId);
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
  authenticate,
  authorize("agent", "admin"),
  validate(UpdateDocumentStatusSchema),
  sendAsync((req) => {
    if (!req.user) {
      throw new Error("Authenticated user is required");
    }

    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    return documentService.updateDocumentStatus(documentId, req.body, req.user.id);
  }),
);
