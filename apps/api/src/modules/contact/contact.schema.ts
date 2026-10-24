import { z } from "zod";

/**
 * A public contact-form submission. Mirrors the fields on the website form
 * (first/last name, email, optional phone, message). Phone accepts an empty string so the
 * optional field can be sent blank without a 400.
 */
export const ContactInquirySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("A valid email is required").max(254),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().min(1, "A message is required").max(5000),
});

export type ContactInquiryInput = z.infer<typeof ContactInquirySchema>;
