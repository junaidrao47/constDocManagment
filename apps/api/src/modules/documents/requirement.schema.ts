import { z } from "zod";
import { ALLOWED_UPLOAD_TYPES } from "./upload-constraints";

const allowedMime = z.enum(Object.keys(ALLOWED_UPLOAD_TYPES) as [string, ...string[]]);

export const RequirementCreateSchema = z.object({
  nameEn: z.string().trim().min(1).max(150),
  nameEs: z.string().trim().min(1).max(150),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  isRequired: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  allowedMimeTypes: z.array(allowedMime).min(1).max(20).nullable().optional(),
});

export const RequirementUpdateSchema = z.object({
  nameEn: z.string().trim().min(1).max(150).optional(),
  nameEs: z.string().trim().min(1).max(150).optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  isRequired: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  allowedMimeTypes: z.array(allowedMime).min(1).max(20).nullable().optional(),
});

export const ServiceIdParamSchema = z.object({ serviceId: z.string().uuid("must be a valid service id") });
export const RequirementIdParamSchema = z.object({ id: z.string().uuid("must be a valid requirement id") });
