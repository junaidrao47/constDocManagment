import { Router, Request, Response, NextFunction } from "express";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import { customerService } from "./customer.service";

export const customerRouter = Router();

function sendAsync<T>(handler: (req: Request) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req).then((data) => res.json(successResponse(data))).catch(next);
  };
}

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