import { Router } from "express";
import { validate } from "../../middleware/validate";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RefreshSchema,
  RegisterSchema,
  ResetPasswordSchema,
} from "./auth.schema";
import { authService } from "./auth.service";

export const authRouter = Router();

authRouter.post("/register", validate(RegisterSchema), (_req, res) => {
  res.json({ success: true, data: authService.register(), message: "ok" });
});

authRouter.post("/login", validate(LoginSchema), (_req, res) => {
  res.json({ success: true, data: authService.login(), message: "ok" });
});

authRouter.post("/refresh", validate(RefreshSchema), (_req, res) => {
  res.json({ success: true, data: authService.refresh(), message: "ok" });
});

authRouter.post("/logout", (_req, res) => {
  res.json({ success: true, data: authService.logout(), message: "ok" });
});

authRouter.post("/forgot-password", validate(ForgotPasswordSchema), (_req, res) => {
  res.json({ success: true, data: authService.forgotPassword(), message: "ok" });
});

authRouter.post("/reset-password", validate(ResetPasswordSchema), (_req, res) => {
  res.json({ success: true, data: authService.resetPassword(), message: "ok" });
});
