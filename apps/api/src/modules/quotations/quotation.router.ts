import { Router } from "express";
import { validate, validateParams } from "../../middleware/validate";
import { QuotationIdParamSchema, QuotationStatusSchema } from "./quotation.schema";
import { quotationService } from "./quotation.service";
import { renderQuotationPdf } from "../../utils/quotation-pdf";

export const quotationRouter = Router();

quotationRouter.get("/:id/pdf", validateParams(QuotationIdParamSchema), (req, res, next) => quotationService.get(req.params.id, { id: req.user!.id, role: req.user!.role }).then((quotation) => {
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", `attachment; filename=quotation-${quotation.id}.pdf`);
	res.send(renderQuotationPdf(quotation));
}).catch(next));
quotationRouter.get("/:id", validateParams(QuotationIdParamSchema), (req, res, next) => quotationService.get(req.params.id, { id: req.user!.id, role: req.user!.role }).then((data) => res.json({ success: true, data, message: "ok" })).catch(next));
