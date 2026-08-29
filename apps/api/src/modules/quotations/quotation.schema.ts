import { z } from "zod";

export const QuotationSchema = z.object({
	workerCount: z.number().int().positive(),
	locationId: z.string().uuid(),
	serviceIds: z.array(z.string().uuid()).default([]),
	industryId: z.string().uuid(),
});
