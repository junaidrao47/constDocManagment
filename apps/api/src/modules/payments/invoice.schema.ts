import { z } from "zod";
import { InvoiceStatus } from "../../entities/invoice.entity";
import { PaymentMethod } from "./payment.entity";

export const InvoiceIdParamSchema = z.object({ id: z.string().uuid() });

export const InvoiceListQuerySchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const PositiveMoneyString = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "amount must be a decimal string with at most two decimal places")
  .refine((value) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) > 0n;
  }, "amount must be greater than zero");

export const PaymentCreateSchema = z.object({
  amount: PositiveMoneyString,
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().max(255).nullable().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
});

export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;
export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>;
