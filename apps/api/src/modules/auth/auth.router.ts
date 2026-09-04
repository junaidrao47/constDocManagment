import { Router } from "express";
import { validate } from "../../middleware/validate";
import {
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
  ResetPasswordSchema,
} from "./auth.schema";
import { authService } from "./auth.service";

export const authRouter = Router();

function sendAsync(
  handler: (body: any, headers: Record<string, string | undefined>) => Promise<unknown>,
  statusCode = 200,
) {
  return (req: any, res: any, next: any) => {
    handler(req.body, req.headers)
      .then((data) => res.status(statusCode).json({ success: true, data, message: "ok" }))
      .catch(next);
  };
}

authRouter.post(["/register", "/signup"], validate(RegisterSchema), sendAsync((body) => authService.register(body), 201));

authRouter.post("/login", validate(LoginSchema), sendAsync((body) => authService.login(body)));

authRouter.post(["/refresh", "/refresh-token"], validate(RefreshSchema), sendAsync((body) => authService.refresh(body)));

authRouter.post(
  "/logout",
  validate(LogoutSchema),
  // Body only. The previous version fell back to the Authorization header, which
  // carries an *access* token — passed to the refresh-token verifier it always
  // threw, so logout could never succeed that way. Requiring the refresh token in
  // the body also keeps the revoked credential out of proxy and access logs.
  sendAsync((body) => authService.logout({ refreshToken: body.refreshToken })),
);

authRouter.post("/forgot-password", validate(ForgotPasswordSchema), sendAsync((body) => authService.forgotPassword(body)));

authRouter.post("/reset-password", validate(ResetPasswordSchema), sendAsync((body) => authService.resetPassword(body)));
