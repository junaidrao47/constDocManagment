import { NotificationLogEntity } from "../src/entities/notification-log.entity";
import { createNotifyService, NotificationType } from "../src/modules/notifications/notify.service";

describe("notification dispatcher", () => {
  const events: Array<[NotificationType, string]> = [
    ["quotation_sent", "quotation-ready"],
    ["quotation_accepted", "quotation-accepted"],
    ["quotation_rejected", "quotation-rejected"],
    ["document_approved", "document-approved"],
    ["document_rejected", "document-rejected"],
    ["invoice_issued", "invoice"],
    ["payment_recorded", "payment-recorded"],
  ];

  it.each(events)("writes a log and enqueues exactly once for %s", async (type, templateName) => {
    const logRows: NotificationLogEntity[] = [];
    const enqueue = jest.fn().mockResolvedValue({ id: "job-1" });
    const service = createNotifyService({
      createLog: async (input) => {
        const row = { id: `log-${logRows.length + 1}`, ...input } as NotificationLogEntity;
        logRows.push(row);
        return row;
      },
      saveLog: async (row) => row,
      findRecipient: async () => "customer@example.test",
      enqueue,
      logError: jest.fn(),
      portalUrl: "https://portal.example.test",
    });

    await service.notify({ userId: "user-1", type, data: { currency: "USD", total: "10.00" } });

    expect(logRows).toHaveLength(1);
    expect(logRows[0]).toMatchObject({ userId: "user-1", type, channel: "email", status: "queued" });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      to: "customer@example.test",
      templateName,
      data: expect.objectContaining({ currency: "USD", portalUrl: "https://portal.example.test" }),
    }));
  });

  it.each(["document_status_changed", "quotation_status_changed"] as NotificationType[])(
    "records %s without enqueueing an email",
    async (type) => {
      const logRows: NotificationLogEntity[] = [];
      const enqueue = jest.fn();
      const findRecipient = jest.fn();
      const service = createNotifyService({
        createLog: async (input) => {
          const row = { id: "log-1", ...input } as NotificationLogEntity;
          logRows.push(row);
          return row;
        },
        saveLog: async (row) => row,
        findRecipient,
        enqueue,
        logError: jest.fn(),
        portalUrl: "https://portal.example.test",
      });

      await service.notify({ userId: "user-1", type, data: {} });

      expect(logRows).toEqual([expect.objectContaining({ type, channel: "in_app", status: "recorded" })]);
      expect(findRecipient).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    },
  );

  it("marks the log failed and never throws when enqueue fails", async () => {
    const logRows: NotificationLogEntity[] = [];
    const logError = jest.fn();
    const enqueue = jest.fn().mockRejectedValue(new Error("Redis unavailable"));
    const service = createNotifyService({
      createLog: async (input) => {
        const row = { id: "log-1", ...input } as NotificationLogEntity;
        logRows.push(row);
        return row;
      },
      saveLog: async (row) => row,
      findRecipient: async () => "customer@example.test",
      enqueue,
      logError,
      portalUrl: "https://portal.example.test",
    });

    await expect(service.notify({ userId: "user-1", type: "document_approved", data: {} })).resolves.toBeUndefined();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(logRows[0].status).toBe("failed");
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("Redis unavailable"));
  });
});
