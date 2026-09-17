import cron from "node-cron";
import { AppDataSource } from "../config/database";
import { sendTransactionalEmail } from "../utils/email";

export async function sendRenewalReminders(): Promise<number> {
  const rows = await AppDataSource.query(`
    SELECT s.id, s.end_date AS "endDate", u.email
    FROM subscriptions s
    JOIN users u ON u.id = s.customer_id
    WHERE s.status = 'active'
      AND s.end_date > NOW()
      AND s.end_date <= NOW() + INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM notifications_log n
        WHERE n.user_id = s.customer_id
          AND n.type = 'subscription_renewal_reminder'
          AND n.created_at >= CURRENT_DATE
      )
  `) as Array<{ id: string; endDate: string; email: string }>;

  for (const row of rows) {
    await sendTransactionalEmail({
      to: row.email,
      subject: "Your ConstDoc subscription is renewing soon",
      text: `Your subscription renews on ${new Date(row.endDate).toLocaleDateString()}. Please contact us if you need help.`,
      html: `<p>Your subscription renews on <strong>${new Date(row.endDate).toLocaleDateString()}</strong>.</p><p>Please contact us if you need help.</p>`,
    });
    await AppDataSource.query(
      `INSERT INTO notifications_log (user_id, type, channel, status, sent_at) SELECT customer_id, 'subscription_renewal_reminder', 'email', 'sent', NOW() FROM subscriptions WHERE id = $1`,
      [row.id],
    );
  }

  return rows.length;
}

export function runRenewalCron() {
  return cron.schedule("0 9 * * *", () => {
    void sendRenewalReminders().catch((error) => console.error("[worker:renewal] reminder run failed", error));
  }, { timezone: "UTC" });
}
