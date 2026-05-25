import { Router } from "express";

export const adminRouter = Router();

adminRouter.get("/users", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

adminRouter.patch("/users/:id", (_req, res) => {
  res.json({ success: true, data: {}, message: "ok" });
});

adminRouter.get("/documents", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

adminRouter.patch("/documents/:id/status", (_req, res) => {
  res.json({ success: true, data: {}, message: "ok" });
});

adminRouter.get("/subscriptions", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});

adminRouter.post("/pricing/worker-ranges", (_req, res) => {
  res.json({ success: true, data: {}, message: "ok" });
});

adminRouter.post("/pricing/locations", (_req, res) => {
  res.json({ success: true, data: {}, message: "ok" });
});

adminRouter.get("/analytics", (_req, res) => {
  res.json({ success: true, data: {}, message: "ok" });
});
