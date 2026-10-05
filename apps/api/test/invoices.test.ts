import crypto from "crypto";
import request from "supertest";
import { AppDataSource } from "../src/config/database";
import { InvoiceEntity, InvoiceStatus } from "../src/entities/invoice.entity";
import { QuotationStatus } from "../src/modules/quotations/quotation-status";
import { PaymentEntity, PaymentMethod } from "../src/modules/payments/payment.entity";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

function seedAcceptedQuotation(customerId: string, status = QuotationStatus.Accepted) {
  const quotation = {
    id: crypto.randomUUID(),
    customerId,
    industryId: crypto.randomUUID(),
    locationId: crypto.randomUUID(),
    workerCount: 4,
    totalPrice: "100.00",
    currency: "USD",
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  fakeDb.quotations().seed(quotation);
  return quotation;
}

async function seedInvoice(customerId: string, status = InvoiceStatus.Issued, dueDate = "2099-01-01") {
  const invoice = {
    id: crypto.randomUUID(),
    quotationId: null,
    invoiceNumber: `INV-2099-${crypto.randomUUID().slice(0, 4)}`,
    customerId,
    subscriptionId: null,
    amount: "100.00",
    currency: "USD",
    subtotal: "100.00",
    taxAmount: "0.00",
    status,
    dueDate,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  (AppDataSource.getRepository(InvoiceEntity) as any).seed(invoice);
  return invoice;
}

async function recordPayment(token: string, invoiceId: string, amount: string) {
  return request(testApp())
    .post(`/api/admin/invoices/${invoiceId}/payments`)
    .set("Authorization", token)
    .send({ amount, method: PaymentMethod.Spei, reference: "bank-ref" });
}

describe("invoice issuance and manual payments", () => {
  it("issues invoices only from accepted quotations and prevents duplicates", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    const token = bearer(mintToken(admin));
    const draft = seedAcceptedQuotation(customer.id, QuotationStatus.Draft);
    const accepted = seedAcceptedQuotation(customer.id);
    fakeDb.appSettings().seed({ key: "payment_terms_days", value: 30, updatedBy: admin.id, updatedAt: new Date() } as any);

    const draftResponse = await request(testApp())
      .post(`/api/admin/quotations/${draft.id}/invoice`)
      .set("Authorization", token);
    expect(draftResponse.status).toBe(409);

    const response = await request(testApp())
      .post(`/api/admin/quotations/${accepted.id}/invoice`)
      .set("Authorization", token);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      invoiceNumber: expect.stringMatching(/^INV-\d{4}-\d{4}$/),
      quotationId: accepted.id,
      customerId: customer.id,
      amount: "100.00",
      subtotal: "100.00",
      currency: "USD",
      status: InvoiceStatus.Issued,
    });
    const expectedDueDate = new Date();
    expectedDueDate.setUTCHours(0, 0, 0, 0);
    expectedDueDate.setUTCDate(expectedDueDate.getUTCDate() + 30);
    expect(response.body.data.dueDate).toBe(expectedDueDate.toISOString().slice(0, 10));
    expect(fakeDb.quotations().all().find((row: any) => row.id === accepted.id)?.status).toBe(QuotationStatus.Converted);

    const duplicate = await request(testApp())
      .post(`/api/admin/quotations/${accepted.id}/invoice`)
      .set("Authorization", token);
    expect(duplicate.status).toBe(409);
  });

  it("rejects non-admins on every new admin invoice route and non-customers on customer detail", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });
    const quotation = seedAcceptedQuotation(customer.id);
    const invoice = await seedInvoice(customer.id);
    const customerToken = bearer(mintToken(customer));
    const agentToken = bearer(mintToken(agent));

    const responses = await Promise.all([
      request(testApp()).post(`/api/admin/quotations/${quotation.id}/invoice`).set("Authorization", customerToken),
      request(testApp()).get("/api/admin/invoices").set("Authorization", customerToken),
      request(testApp()).get(`/api/admin/invoices/${invoice.id}`).set("Authorization", customerToken),
      request(testApp()).post(`/api/admin/invoices/${invoice.id}/payments`).set("Authorization", customerToken).send({ amount: "1.00", method: "cash" }),
      request(testApp()).post(`/api/admin/invoices/${invoice.id}/cancel`).set("Authorization", customerToken),
      request(testApp()).get(`/api/customers/me/invoices/${invoice.id}`).set("Authorization", agentToken),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it("records partial and full payments with exact cent balances and rejects overpayment", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    const invoice = await seedInvoice(customer.id);
    const token = bearer(mintToken(admin));

    const overpayment = await recordPayment(token, invoice.id, "100.01");
    expect(overpayment.status).toBe(400);

    const partial = await recordPayment(token, invoice.id, "10.10");
    expect(partial.status).toBe(201);
    expect(partial.body.data.status).toBe(InvoiceStatus.PartiallyPaid);
    expect(partial.body.data.paidAt).toBeNull();
    expect(partial.body.data.payments).toHaveLength(1);

    const final = await recordPayment(token, invoice.id, "89.90");
    expect(final.status).toBe(201);
    expect(final.body.data.status).toBe(InvoiceStatus.Paid);
    expect(final.body.data.paidAt).toBeTruthy();
    expect(final.body.data.payments).toHaveLength(2);
    expect(final.body.data.payments.map((payment: PaymentEntity) => payment.amount)).toEqual(["10.10", "89.90"]);
  });

  it("blocks cancellation after payment and computes overdue status on read", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    const invoice = await seedInvoice(customer.id);
    const overdue = await seedInvoice(customer.id, InvoiceStatus.Issued, "2000-01-01");
    const token = bearer(mintToken(admin));

    const payment = await recordPayment(token, invoice.id, "1.00");
    expect(payment.status).toBe(201);
    const cancelled = await request(testApp())
      .post(`/api/admin/invoices/${invoice.id}/cancel`)
      .set("Authorization", token);
    expect(cancelled.status).toBe(409);

    const overdueResponse = await request(testApp())
      .get(`/api/admin/invoices/${overdue.id}`)
      .set("Authorization", token);
    expect(overdueResponse.status).toBe(200);
    expect(overdueResponse.body.data.status).toBe(InvoiceStatus.Overdue);
  });

  it("filters admin invoices by computed overdue status and paginates", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    await seedInvoice(customer.id, InvoiceStatus.Issued, "2000-01-01");
    await seedInvoice(customer.id, InvoiceStatus.PartiallyPaid, "2000-01-01");
    await seedInvoice(customer.id, InvoiceStatus.Issued, "2099-01-01");

    const response = await request(testApp())
      .get("/api/admin/invoices?status=overdue&page=1&pageSize=1")
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(200);
    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.data[0].status).toBe(InvoiceStatus.Overdue);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  });

  it("returns customer invoices with payments and hides another customer's invoice", async () => {
    const owner = await seedUser({ role: UserRole.Customer });
    const other = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    const invoice = await seedInvoice(owner.id, InvoiceStatus.PartiallyPaid);
    const payment = {
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      amount: "12.34",
      method: PaymentMethod.BankTransfer,
      reference: "ref",
      paidAt: new Date(),
      recordedBy: admin.id,
      note: null,
      createdAt: new Date(),
    };
    (AppDataSource.getRepository(PaymentEntity) as any).seed(payment);

    const own = await request(testApp())
      .get(`/api/customers/me/invoices/${invoice.id}`)
      .set("Authorization", bearer(mintToken(owner)));
    expect(own.status).toBe(200);
    expect(own.body.data.payments).toHaveLength(1);
    expect(own.body.data.payments[0].amount).toBe("12.34");

    const foreign = await request(testApp())
      .get(`/api/customers/me/invoices/${invoice.id}`)
      .set("Authorization", bearer(mintToken(other)));
    expect([403, 404]).toContain(foreign.status);
  });
});
