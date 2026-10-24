import { z } from "zod";
import { PhaseStatus } from "./phase-status";

const phaseNameShape = {
  nameEn: z.string().trim().min(1).max(150),
  nameEs: z.string().trim().min(1).max(150),
  department: z.string().trim().max(150).nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
};

export const PhaseCreateItemSchema = z.object(phaseNameShape);

/**
 * `POST /documents/:id/phases` does two jobs (PROJECT-BRIEF §11.5): create new
 * phases (append, in order) and/or reorder existing ones by listing their ids in
 * the new order. At least one of the two must be present.
 */
export const CreatePhasesSchema = z
  .object({
    phases: z.array(PhaseCreateItemSchema).min(1).max(30).optional(),
    order: z.array(z.string().uuid()).min(1).max(100).optional(),
  })
  .refine((input) => input.phases !== undefined || input.order !== undefined, {
    message: "Provide phases to create or an order to apply",
  });

export const UpdatePhaseSchema = z
  .object({
    nameEn: z.string().trim().min(1).max(150).optional(),
    nameEs: z.string().trim().min(1).max(150).optional(),
    department: z.string().trim().max(150).nullable().optional(),
    targetDate: z.coerce.date().nullable().optional(),
    note: z.string().trim().max(1000).optional(),
    status: z.nativeEnum(PhaseStatus).optional(),
  })
  .superRefine((input, context) => {
    if (input.status === PhaseStatus.Rejected && (input.note?.trim().length ?? 0) < 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A rejection note of at least 5 characters is required",
      });
    }
  });

export const PhaseResultIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(200),
});

export const PhaseIdParamSchema = z.object({
  id: z.string().uuid("must be a valid document id"),
  phaseId: z.string().uuid("must be a valid phase id"),
});

export const PhaseResultParamSchema = z.object({
  id: z.string().uuid("must be a valid document id"),
  phaseId: z.string().uuid("must be a valid phase id"),
  versionId: z.string().uuid("must be a valid version id"),
});

export type CreatePhasesInput = z.infer<typeof CreatePhasesSchema>;
export type UpdatePhaseInput = z.infer<typeof UpdatePhaseSchema>;
