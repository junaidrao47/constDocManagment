import { Router, Request, Response, NextFunction } from "express";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { customerService } from "./customer.service";
import { quotationService } from "../quotations/quotation.service";
import { QuotationIdParamSchema, QuotationRejectSchema, QuotationSchema } from "../quotations/quotation.schema";
import { validate, validateParams } from "../../middleware/validate";

export const customerRouter = Router();

function sendAsync<T>(handler: (req: Request) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req).then((data) => res.json(successResponse(data))).catch(next);
  };
}

customerRouter.get(
  "/me/dashboard",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.getCustomerDashboard(req.user.id);
  }),
);

customerRouter.get(
  "/me",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.getCustomerProfile(req.user.id);
  }),
);

customerRouter.get(
  "/me/documents",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.getMyDocuments(req.user.id);
  }),
);

customerRouter.get(
  "/me/subscriptions",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.getMySubscriptions(req.user.id);
  }),
);

customerRouter.get(
  "/me/invoices",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.getMyInvoices(req.user.id);
  }),
);

customerRouter.get("/me/quotations", sendAsync((req) => quotationService.list({ id: req.user!.id, role: req.user!.role })));
customerRouter.get("/me/quotations/:id", validateParams(QuotationIdParamSchema), sendAsync((req) => quotationService.get(req.params.id, { id: req.user!.id, role: req.user!.role })));
customerRouter.post("/me/quotations", validate(QuotationSchema), sendAsync((req) => quotationService.create(req.user!.id, req.body)));
customerRouter.post("/me/quotations/:id/accept", validateParams(QuotationIdParamSchema), sendAsync((req) => quotationService.transition(req.params.id, "accepted", { id: req.user!.id, role: req.user!.role })));
customerRouter.post("/me/quotations/:id/reject", validateParams(QuotationIdParamSchema), validate(QuotationRejectSchema), sendAsync((req) => quotationService.transition(req.params.id, "rejected", { id: req.user!.id, role: req.user!.role }, req.body.reason)));