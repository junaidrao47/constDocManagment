import { NextFunction, Request, Response, Router } from "express";
import { validate } from "../../middleware/validate";
import { QuotationSchema } from "../quotations/quotation.schema";
import { publicService } from "./public.service";

export const publicRouter = Router();

function send<T>(handler: () => Promise<T>) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    handler().then((data) => res.json({ success: true, data, message: "ok" })).catch(next);
  };
}

publicRouter.get("/services", send(() => publicService.listServices()));
publicRouter.get("/packages", send(() => publicService.listPackages()));
publicRouter.get("/worker-ranges", send(() => publicService.listWorkerRanges()));
publicRouter.get("/locations", send(() => publicService.listLocations()));
publicRouter.get("/industries", send(() => publicService.listIndustries()));
publicRouter.post("/quotations/calculate", validate(QuotationSchema), (req, res, next) => {
  publicService.calculate(req.body).then((data) => res.json({ success: true, data, message: "ok" })).catch(next);
});