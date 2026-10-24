import { z } from "zod";

/** Date range for the analytics overview; defaults to the last 30 days in the service. */
export const AnalyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
