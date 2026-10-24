import { NextFunction, Request, Response, Router } from "express";
import { authorize } from "../../middleware/authorize";
import { AppError } from "../../utils/http-error";
import { UserRole } from "../users/user.entity";
import { documentService } from "../documents/document.service";
import { DocumentStatus } from "../documents/document-status";
import { quotationService } from "../quotations/quotation.service";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { QuotationIdParamSchema, QuotationListQuerySchema, QuotationStatusSchema, StaffQuotationCreateSchema, type QuotationListQuery } from "../quotations/quotation.schema";

export const agentRouter = Router();

agentRouter.get("/quotations", authorize(UserRole.Agent, UserRole.Manager), validateQuery(QuotationListQuerySchema), (req, res, next) => quotationService.list({ id: req.user!.id, role: req.user!.role }, req.query as unknown as QuotationListQuery).then((data) => res.json({ success: true, data, message: "ok" })).catch(next));
agentRouter.post("/quotations", authorize(UserRole.Agent, UserRole.Manager), validate(StaffQuotationCreateSchema), (req, res, next) => quotationService.staffCreate(req.body, { id: req.user!.id, role: req.user!.role }).then((data) => res.status(201).json({ success: true, data, message: "ok" })).catch(next));
agentRouter.get("/quotations/:id", authorize(UserRole.Agent, UserRole.Manager), validateParams(QuotationIdParamSchema), (req, res, next) => quotationService.get(req.params.id, { id: req.user!.id, role: req.user!.role }).then((data) => res.json({ success: true, data, message: "ok" })).catch(next));
agentRouter.patch("/quotations/:id/status", authorize(UserRole.Agent, UserRole.Manager), validateParams(QuotationIdParamSchema), validate(QuotationStatusSchema), (req, res, next) => quotationService.transition(req.params.id, req.body.status, { id: req.user!.id, role: req.user!.role }, req.body.note).then((data) => res.json({ success: true, data, message: "ok" })).catch(next));

agentRouter.get("/documents", authorize(UserRole.Agent, UserRole.Manager), (req: Request, res: Response, next: NextFunction) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !Object.values(DocumentStatus).includes(status as DocumentStatus)) {
    next(new AppError("VALIDATION_FAILED", 400, "Invalid document status"));
    return;
  }
  documentService.listReviewDocuments({ id: req.user!.id, role: req.user!.role }, status).then((data) => res.json({ success: true, data, message: "ok" })).catch(next);
});