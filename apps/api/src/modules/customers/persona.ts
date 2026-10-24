import { z } from "zod";

/**
 * The customer personas offered at onboarding (PROJECT-BRIEF §11.2).
 *
 * Kept as ONE constant here so nothing hardcodes the list elsewhere. The decision
 * says the list becomes admin-editable later; until then this is the single source
 * of truth, and the zod enum below is derived from it so the two cannot drift.
 */
export const PERSONAS = ["individual", "company"] as const;

export type Persona = (typeof PERSONAS)[number];

export const PersonaSchema = z.enum(PERSONAS);
