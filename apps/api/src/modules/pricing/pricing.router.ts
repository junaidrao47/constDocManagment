import { Router } from "express";

export const pricingRouter = Router();

pricingRouter.get("/worker-ranges", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

pricingRouter.get("/locations", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

pricingRouter.get("/services", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});