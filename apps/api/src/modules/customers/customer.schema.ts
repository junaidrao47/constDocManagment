import { z } from "zod";
import { PersonaSchema } from "./persona";

const notificationEmail = z.string().trim().toLowerCase().email();

/**
 * Onboarding profile input (PROJECT-BRIEF §11.4). All fields are optional on the
 * wire so the customer can save partial progress; `completed_at` is set by the
 * service only once the required set is present. `notificationEmails` is capped at
 * three and each address is validated — these are the phase-email recipients.
 */
export const OnboardingSchema = z.object({
  persona: PersonaSchema.optional(),
  legalName: z.string().trim().min(1).max(200).optional(),
  contactName: z.string().trim().min(1).max(200).optional(),
  notificationEmails: z.array(notificationEmail).max(3, "At most 3 notification emails").optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  state: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  needs: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  // Sets the account's preferred locale used for phase/approval emails.
  locale: z.enum(["en", "es-MX"]).optional(),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;
