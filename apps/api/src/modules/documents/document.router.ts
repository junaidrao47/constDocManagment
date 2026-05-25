import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { UpdateDocumentStatusSchema } from "./document.schema";

export const documentRouter = Router();

documentRouter.post("/upload-url", authenticate, authorize("customer"), (_req, res) => {
  res.json({ success: true, data: { uploadUrl: "" }, message: "ok" });
});

documentRouter.get("/:id/download-url", authenticate, authorize("customer"), (_req, res) => {
  res.json({ success: true, data: { downloadUrl: "" }, message: "ok" });
});

documentRouter.patch(
  "/:id/status",
  authenticate,
  authorize("agent", "admin"),
  validate(UpdateDocumentStatusSchema),
  (_req, res) => {
    res.json({ success: true, data: {}, message: "ok" });
  },
);
