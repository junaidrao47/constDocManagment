import { Router } from "express";
import { validate } from "../../middleware/validate";
import { QuotationSchema } from "./quotation.schema";

export const quotationRouter = Router();

quotationRouter.post("/calculate", validate(QuotationSchema), (_req, res) => {
	res.json({ success: true, data: { total: 0 }, message: "ok" });
});

quotationRouter.post("/", (_req, res) => {
	res.json({ success: true, data: {}, message: "ok" });
});

quotationRouter.get("/:id", (_req, res) => {
	res.json({ success: true, data: {}, message: "ok" });
});
