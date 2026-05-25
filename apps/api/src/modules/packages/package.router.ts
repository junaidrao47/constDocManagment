import { Router } from "express";

export const packageRouter = Router();

packageRouter.get("/", (_req, res) => {
  res.json({ success: true, data: [], message: "ok" });
});
