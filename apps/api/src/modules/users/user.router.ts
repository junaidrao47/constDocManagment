import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../../middleware/validate";
import { HttpError } from "../../utils/http-error";
import { UpdateProfileSchema } from "./user.schema";
import { userService } from "./user.service";
import { successResponse } from "../../utils/response";

export const userRouter = Router();

function sendAsync<T>(handler: (req: Request) => Promise<T>) {
	return (req: Request, res: Response, next: NextFunction) => {
		handler(req).then((data) => res.json(successResponse(data))).catch(next);
	};
}

userRouter.get(
	"/me",
	sendAsync((req) => {
		if (!req.user) {
			throw new HttpError(401, "Authenticated user is required");
		}

		return userService.getCurrentUser(req.user.id);
	}),
);

userRouter.patch(
	"/me",
	validate(UpdateProfileSchema),
	sendAsync((req) => {
		if (!req.user) {
			throw new HttpError(401, "Authenticated user is required");
		}

		return userService.updateCurrentUser(req.user.id, req.body);
	}),
);
