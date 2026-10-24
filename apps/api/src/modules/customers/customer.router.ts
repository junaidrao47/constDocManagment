import { Router, Request, Response, NextFunction } from "express";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { customerService } from "./customer.service";
import { quotationService } from "../quotations/quotation.service";
import { QuotationIdParamSchema, QuotationListQuerySchema, QuotationRejectSchema, QuotationSchema, type QuotationListQuery } from "../quotations/quotation.schema";
import { invoiceService } from "../payments/invoice.service";
import { InvoiceIdParamSchema } from "../payments/invoice.schema";
import { documentService } from "../documents/document.service";
import { localeFromRequest } from "../../utils/i18n";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { enforceAccountStatus } from "../../middleware/account-status";
import { OnboardingSchema } from "./customer.schema";

export const customerRouter = Router();

// A pending/suspended customer may still read their own record and complete
// onboarding (PROJECT-BRIEF §11.1); everything else under /customers is gated.
customerRouter.use(
  enforceAccountStatus({
    allow: [
      { method: "GET", path: "/me" },
      { method: "GET", path: "/me/onboarding" },
      { method: "PUT", path: "/me/onboarding" },
    ],
  }),
);

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
  "/me/onboarding",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.getOnboarding(req.user.id);
  }),
);

customerRouter.put(
  "/me/onboarding",
  validate(OnboardingSchema),
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return customerService.putOnboarding(req.user.id, req.body);
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
  "/me/checklist",
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return documentService.getChecklist(req.user.id, localeFromRequest(req));
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

    return invoiceService.listCustomer(req.user.id);
  }),
);

customerRouter.get(
  "/me/invoices/:id",
  validateParams(InvoiceIdParamSchema),
  sendAsync((req) => {
    if (!req.user) {
      throw new HttpError(401, "Authenticated user is required");
    }

    return invoiceService.getCustomer(req.params.id, req.user.id);
  }),
);

customerRouter.get("/me/quotations", validateQuery(QuotationListQuerySchema), sendAsync((req) => quotationService.list({ id: req.user!.id, role: req.user!.role }, req.query as unknown as QuotationListQuery)));
customerRouter.get("/me/quotations/:id", validateParams(QuotationIdParamSchema), sendAsync((req) => quotationService.get(req.params.id, { id: req.user!.id, role: req.user!.role })));
customerRouter.post("/me/quotations", validate(QuotationSchema), sendAsync((req) => quotationService.create(req.user!.id, req.body)));
customerRouter.post("/me/quotations/:id/accept", validateParams(QuotationIdParamSchema), sendAsync((req) => quotationService.transition(req.params.id, "accepted", { id: req.user!.id, role: req.user!.role })));
customerRouter.post("/me/quotations/:id/reject", validateParams(QuotationIdParamSchema), validate(QuotationRejectSchema), sendAsync((req) => quotationService.transition(req.params.id, "rejected", { id: req.user!.id, role: req.user!.role }, req.body.reason)));