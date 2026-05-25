import { Router } from "express";

export const userRouter = Router();

userRouter.get("/me", (_req, res) => {
	res.json({ success: true, data: {}, message: "ok" });
});
