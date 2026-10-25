import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validate, validateQuery } from "../../middleware/validate";
import { QuotationSchema } from "../quotations/quotation.schema";
import { localeFromRequest } from "../../utils/i18n";
import { publicService } from "./public.service";
import { ContactInquirySchema } from "../contact/contact.schema";
import { contactService } from "../contact/contact.service";

export const publicRouter = Router();

const CategoryQuerySchema = z.object({
  category: z
    .string()
    .trim()
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "category must be a valid slug")
    .optional(),
});

function send<T>(handler: (req: Request) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req).then((data) => res.json({ success: true, data, message: "ok" })).catch(next);
  };
}

publicRouter.get("/site-config", send(() => publicService.siteConfig()));
publicRouter.get("/categories", send((req) => publicService.listCategories(localeFromRequest(req))));
publicRouter.get(
  "/services",
  validateQuery(CategoryQuerySchema),
  send((req) => publicService.listServices(localeFromRequest(req), req.query.category as string | undefined)),
);
publicRouter.get(
  "/packages",
  validateQuery(CategoryQuerySchema),
  send((req) => publicService.listPackages(localeFromRequest(req), req.query.category as string | undefined)),
);
publicRouter.get("/worker-ranges", send(() => publicService.listWorkerRanges()));
publicRouter.get("/locations", send(() => publicService.listLocations()));
publicRouter.get("/industries", send(() => publicService.listIndustries()));
publicRouter.post("/quotations/calculate", validate(QuotationSchema), (req, res, next) => {
  publicService.calculate(req.body).then((data) => res.json({ success: true, data, message: "ok" })).catch(next);
});
publicRouter.post("/contact", validate(ContactInquirySchema), send((req) => contactService.submit(req.body)));
