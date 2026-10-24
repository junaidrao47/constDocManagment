import { NextFunction, Request, Response, Router } from "express";
import { validate, validateParams } from "../../middleware/validate";
import { successResponse } from "../../utils/response";
import {
  CategoryCreateSchema,
  CategoryIdParamSchema,
  CategoryReorderSchema,
  CategoryStatusSchema,
  CategoryUpdateSchema,
} from "./category.schema";
import { categoryService } from "./category.service";

function send<T>(handler: (req: Request) => Promise<T>, status = 200) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req).then((data) => res.status(status).json(successResponse(data))).catch(next);
  };
}

export const adminCategoryRouter = Router();

adminCategoryRouter.get("/", send(() => categoryService.list()));
adminCategoryRouter.post("/", validate(CategoryCreateSchema), send((req) => categoryService.create(req.body), 201));
adminCategoryRouter.post("/reorder", validate(CategoryReorderSchema), send((req) => categoryService.reorder(req.body.orderedIds)));
adminCategoryRouter.get("/:id", validateParams(CategoryIdParamSchema), send((req) => categoryService.get(req.params.id)));
adminCategoryRouter.patch("/:id", validateParams(CategoryIdParamSchema), validate(CategoryUpdateSchema), send((req) => categoryService.update(req.params.id, req.body)));
adminCategoryRouter.patch("/:id/status", validateParams(CategoryIdParamSchema), validate(CategoryStatusSchema), send((req) => categoryService.setStatus(req.params.id, req.body.isActive)));
adminCategoryRouter.delete("/:id", validateParams(CategoryIdParamSchema), send((req) => categoryService.remove(req.params.id)));
