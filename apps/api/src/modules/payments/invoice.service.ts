import { AppDataSource } from "../../config/database";
import { AppSettingEntity } from "../../entities/app-setting.entity";
import { InvoiceEntity, InvoiceStatus } from "../../entities/invoice.entity";
import { PaymentEntity } from "./payment.entity";
import { QuotationEntity } from "../quotations/quotation.entity";
import { QuotationStatus } from "../quotations/quotation-status";
import { HttpError } from "../../utils/http-error";
import { PaymentCreateInput } from "./invoice.schema";
import { LessThan, MoreThanOrEqual } from "typeorm";

const invoices = () => AppDataSource.getRepository(InvoiceEntity);
const payments = () => AppDataSource.getRepository(PaymentEntity);

function moneyToCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new HttpError(400, "Invalid monetary amount");
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function centsToMoney(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const result = `${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
  return value < 0n ? `-${result}` : result;
}

function dueDateAfter(days: number): string {
  const dueDate = new Date();
  dueDate.setUTCHours(0, 0, 0, 0);
  dueDate.setUTCDate(dueDate.getUTCDate() + days);
  return dueDate.toISOString().slice(0, 10);
}

async function withPayments(invoice: InvoiceEntity): Promise<InvoiceEntity> {
  invoice.payments = await payments().find({ where: { invoiceId: invoice.id }, order: { paidAt: "ASC" } });
  return invoice;
}

async function applyOverdue(invoice: InvoiceEntity): Promise<InvoiceEntity> {
  const today = new Date().toISOString().slice(0, 10);
  if (
    invoice.dueDate < today &&
    (invoice.status === InvoiceStatus.Issued || invoice.status === InvoiceStatus.PartiallyPaid)
  ) {
    invoice.status = InvoiceStatus.Overdue;
    await invoices().save(invoice);
  }
  return withPayments(invoice);
}

async function requireInvoice(manager: any, id: string): Promise<InvoiceEntity> {
  const rows = await manager.find(InvoiceEntity, { where: { id } });
  const invoice = rows[0] as InvoiceEntity | undefined;
  if (!invoice) throw new HttpError(404, "Invoice not found");
  return invoice;
}

export const invoiceService = {
  async createFromQuotation(quotationId: string) {
    return AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT "id" FROM "quotations" WHERE "id" = $1 FOR UPDATE`, [quotationId]);
      const quotations = (await manager.find(QuotationEntity, { where: { id: quotationId } })) as QuotationEntity[];
      const quotation = quotations[0];
      if (!quotation) throw new HttpError(404, "Quotation not found");
      if (quotation.status !== QuotationStatus.Accepted) {
        throw new HttpError(409, "Only accepted quotations can be invoiced");
      }

      const existing = (await manager.find(InvoiceEntity, { where: { quotationId } })) as InvoiceEntity[];
      if (existing.length > 0) throw new HttpError(409, "Quotation already has an invoice");

      const settings = (await manager.find(AppSettingEntity, { where: { key: "payment_terms_days" } })) as AppSettingEntity[];
      const configuredDays = Number(settings[0]?.value);
      const paymentTermsDays = Number.isInteger(configuredDays) && configuredDays >= 1 && configuredDays <= 365
        ? configuredDays
        : 15;
      const now = new Date();
      const year = now.getUTCFullYear();
      const counterRows = (await manager.query(
        `INSERT INTO "invoice_number_counters" ("year", "last_number") VALUES ($1, 1)
         ON CONFLICT ("year") DO UPDATE SET "last_number" = "invoice_number_counters"."last_number" + 1
         RETURNING "last_number"`,
        [year],
      )) as Array<{ last_number: number | string }>;
      const sequence = Number(counterRows[0]?.last_number ?? 1);
      const invoiceNumber = `INV-${year}-${String(sequence).padStart(4, "0")}`;
      const subtotal = quotation.totalPrice;

      const invoice = manager.create(InvoiceEntity, {
        quotationId: quotation.id,
        invoiceNumber,
        customerId: quotation.customerId,
        subscriptionId: null,
        amount: subtotal,
        currency: quotation.currency ?? "MXN",
        subtotal,
        taxAmount: "0.00",
        status: InvoiceStatus.Issued,
        dueDate: dueDateAfter(paymentTermsDays),
        paidAt: null,
      } as Partial<InvoiceEntity>);
      const saved = (await manager.save(InvoiceEntity, invoice)) as InvoiceEntity;

      quotation.status = QuotationStatus.Converted;
      await manager.save(QuotationEntity, quotation);
      saved.payments = [];
      return saved;
    });
  },

  async listAdmin(query: { status?: InvoiceStatus; customerId?: string; page: number; pageSize: number }) {
    const today = new Date().toISOString().slice(0, 10);
    const withCustomer = (conditions: Record<string, unknown>[]) =>
      conditions.map((condition) => ({ ...condition, ...(query.customerId ? { customerId: query.customerId } : {}) }));
    let where: Record<string, unknown> | Record<string, unknown>[] = query.customerId
      ? { customerId: query.customerId }
      : {};
    if (query.status === InvoiceStatus.Overdue) {
      where = withCustomer([
        { status: InvoiceStatus.Overdue },
        { status: InvoiceStatus.Issued, dueDate: LessThan(today) },
        { status: InvoiceStatus.PartiallyPaid, dueDate: LessThan(today) },
      ]);
    } else if (query.status === InvoiceStatus.Issued || query.status === InvoiceStatus.PartiallyPaid) {
      where = {
        ...((Array.isArray(where) ? {} : where) as Record<string, unknown>),
        status: query.status,
        dueDate: MoreThanOrEqual(today),
      };
    } else if (query.status) {
      where = { ...((Array.isArray(where) ? {} : where) as Record<string, unknown>), status: query.status };
    }
    const [rows, total] = await invoices().findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const data = await Promise.all(rows.map(applyOverdue));
    return { data, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  },

  async getAdmin(id: string) {
    const invoice = await invoices().findOne({ where: { id } });
    if (!invoice) throw new HttpError(404, "Invoice not found");
    return applyOverdue(invoice);
  },

  async listCustomer(customerId: string) {
    const rows = await invoices().find({ where: { customerId }, order: { createdAt: "DESC" } });
    return Promise.all(rows.map(applyOverdue));
  },

  async getCustomer(id: string, customerId: string) {
    const invoice = await invoices().findOne({ where: { id } });
    if (!invoice || invoice.customerId !== customerId) throw new HttpError(404, "Invoice not found");
    return applyOverdue(invoice);
  },

  async recordPayment(id: string, input: PaymentCreateInput, recordedBy: string) {
    return AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT "id" FROM "invoices" WHERE "id" = $1 FOR UPDATE`, [id]);
      const invoice = await requireInvoice(manager, id);
      if ([InvoiceStatus.Paid, InvoiceStatus.Cancelled, InvoiceStatus.Draft].includes(invoice.status)) {
        throw new HttpError(409, "This invoice cannot accept payments");
      }

      const paymentRows = (await manager.find(PaymentEntity, { where: { invoiceId: id } })) as PaymentEntity[];
      const paidCents = paymentRows.reduce((sum, payment) => sum + moneyToCents(payment.amount), 0n);
      const totalCents = moneyToCents(invoice.subtotal) + moneyToCents(invoice.taxAmount);
      const amountCents = moneyToCents(input.amount);
      const remainingCents = totalCents - paidCents;
      if (amountCents > remainingCents) throw new HttpError(400, "Payment exceeds the remaining balance");

      const payment = manager.create(PaymentEntity, {
        invoiceId: id,
        amount: centsToMoney(amountCents),
        method: input.method,
        reference: input.reference ?? null,
        paidAt: new Date(),
        recordedBy,
        note: input.note ?? null,
      } as Partial<PaymentEntity>);
      const savedPayment = (await manager.save(PaymentEntity, payment)) as PaymentEntity;
      const newPaidCents = paidCents + amountCents;
      invoice.status = newPaidCents === totalCents ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
      invoice.paidAt = invoice.status === InvoiceStatus.Paid ? savedPayment.paidAt ?? new Date() : null;
      await manager.save(InvoiceEntity, invoice);
      invoice.payments = [...paymentRows, savedPayment];
      return invoice;
    });
  },

  async cancel(id: string) {
    return AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT "id" FROM "invoices" WHERE "id" = $1 FOR UPDATE`, [id]);
      const invoice = await requireInvoice(manager, id);
      const paymentRows = (await manager.find(PaymentEntity, { where: { invoiceId: id } })) as PaymentEntity[];
      if (paymentRows.length > 0) throw new HttpError(409, "An invoice with payments cannot be cancelled");
      if (invoice.status === InvoiceStatus.Paid || invoice.status === InvoiceStatus.Cancelled) {
        throw new HttpError(409, "Invoice cannot be cancelled");
      }
      invoice.status = InvoiceStatus.Cancelled;
      await manager.save(InvoiceEntity, invoice);
      invoice.payments = [];
      return invoice;
    });
  },
};
