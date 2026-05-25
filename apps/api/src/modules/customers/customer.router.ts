import { Router } from "express";

export const customerRouter = Router();

customerRouter.get("/me", (_req, res) => {
  res.json({ success: true, data: {}, message: "ok" });
});

customerRouter.get("/me/documents", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

customerRouter.get("/me/subscriptions", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

customerRouter.get("/me/invoices", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});