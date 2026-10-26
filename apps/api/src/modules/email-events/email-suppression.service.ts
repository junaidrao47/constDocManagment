import { AppDataSource } from "../../config/database";
import { EmailSuppressionEntity, type SuppressionReason } from "../../entities/email-suppression.entity";

/** Addresses are matched case-insensitively; store and compare lowercased. */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function repo() {
  return AppDataSource.getRepository(EmailSuppressionEntity);
}

export const emailSuppressionService = {
  async isSuppressed(email: string): Promise<boolean> {
    const count = await repo().count({ where: { email: normalize(email) } });
    return count > 0;
  },

  /**
   * Idempotently record a suppression. A repeated event for an already-suppressed
   * address updates the reason/detail rather than failing on the unique index.
   */
  async suppress(email: string, reason: SuppressionReason, detail?: string | null): Promise<void> {
    const normalized = normalize(email);
    const existing = await repo().findOne({ where: { email: normalized } });
    if (existing) {
      existing.reason = reason;
      existing.detail = detail ?? existing.detail ?? null;
      await repo().save(existing);
      return;
    }
    await repo().save(repo().create({ email: normalized, reason, detail: detail ?? null }));
  },

  async list(): Promise<EmailSuppressionEntity[]> {
    return repo().find({ order: { createdAt: "DESC" } });
  },
};
