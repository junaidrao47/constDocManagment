import { AppDataSource } from "../../config/database";
import { QuotationStatusHistoryEntity } from "../../entities/quotation-status-history.entity";
import { QuotationItemEntity } from "../../entities/quotation-item.entity";
import { NotificationLogEntity } from "../../entities/notification-log.entity";
import { HttpError } from "../../utils/http-error";
import { sendEmail } from "../../utils/email";
import { UserEntity, UserRole } from "../users/user.entity";
import { publicService, getSettingValue } from "../public/public.service";
import { PricingInput } from "./pricing.engine";
import { QuotationEntity } from "./quotation.entity";
import { assertQuotationTransition, isQuotationStatus, QuotationStatus } from "./quotation-status";
import { StaffQuotationCreateInput } from "./quotation.schema";

type Actor = { id: string; role: UserRole };
const quotations = () => AppDataSource.getRepository(QuotationEntity);
const history = () => AppDataSource.getRepository(QuotationStatusHistoryEntity);
const users = () => AppDataSource.getRepository(UserEntity);

function toCents(amount: number | string): number {
  const value = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new HttpError(400, "Amounts must have no more than two decimal places");
  }

  const whole = Number(match[2]);
  const fractional = Number((match[3] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fractional;
  if (!Number.isSafeInteger(cents)) {
    throw new HttpError(400, "Amount is outside the supported range");
  }

  return match[1] === "-" ? -cents : cents;
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function normalizeItem(item: QuotationItemEntity): QuotationItemEntity {
  const unitPrice = item.unitPrice ?? item.unit_price ?? item.price ?? "0.00";
  const lineTotal = item.lineTotal ?? item.line_total ?? item.price ?? "0.00";
  return {
    ...item,
    label: item.label ?? item.service?.name ?? item.kind,
    kind: item.kind ?? "service",
    quantity: item.quantity ?? 1,
    unitPrice,
    lineTotal,
    unit_price: unitPrice,
    line_total: lineTotal,
  } as QuotationItemEntity;
}

function assertAccess(quotation: QuotationEntity, actor: Actor, mutating = false) {
  if (actor.role === UserRole.Customer && quotation.customerId !== actor.id) throw new HttpError(404, "Quotation not found");
  if (mutating && actor.role === UserRole.Agent) throw new HttpError(403, "Only managers or admins may change quotation status");
}

async function expireIfNeeded(quotation: QuotationEntity) {
  if (quotation.expiresAt && quotation.expiresAt.getTime() < Date.now() && quotation.status !== QuotationStatus.Expired) {
    const previous = quotation.status;
    quotation.status = QuotationStatus.Expired;
    await quotations().save(quotation);
    await history().save(history().create({ quotationId: quotation.id, fromStatus: previous, toStatus: QuotationStatus.Expired, note: "Automatically expired" }));
  }
  return quotation;
}

export const quotationService = {
  async create(customerId: string, input: PricingInput) {
    // Read validity from settings; fall back to 15 if not configured
    const validityRaw = await getSettingValue("quote_validity_days");
    const validityDays = typeof validityRaw === "number" && validityRaw >= 1 ? Math.round(validityRaw) : 15;

    const calculated = await publicService.calculate(input);
    const quotation = quotations().create({
      customerId, industryId: input.industryId, locationId: input.locationId, workerCount: input.workerCount,
      totalPrice: calculated.total.toFixed(2), currency: calculated.currency, status: QuotationStatus.Draft,
      expiresAt: new Date(Date.now() + validityDays * 86_400_000),
      items: calculated.serviceCharges.map((item) => {
        const priceStr = item.price.toFixed(2);
        return {
          serviceId: item.serviceId,
          kind: "service",
          quantity: 1,
          unitPrice: priceStr,
          lineTotal: priceStr,
          unit_price: priceStr,
          line_total: priceStr,
          price: priceStr,
        } as QuotationItemEntity;
      }),
    });
    const saved = await quotations().save(quotation);
    await history().save(history().create({ quotationId: saved.id, toStatus: QuotationStatus.Draft, changedBy: customerId }));
    return this.get(saved.id, { id: customerId, role: UserRole.Customer });
  },

  async staffCreate(input: StaffQuotationCreateInput, actor: Actor) {
    const customer = await users().findOne({ where: { id: input.customerId } });
    if (!customer || customer.role !== UserRole.Customer) {
      throw new HttpError(404, "Customer not found");
    }

    const validityRaw = await getSettingValue("quote_validity_days");
    const validityDays = typeof validityRaw === "number" && validityRaw >= 1 ? Math.round(validityRaw) : 15;

    const calculated = await publicService.calculate({
      workerCount: input.workerCount,
      locationId: input.locationId,
      serviceIds: input.serviceIds,
      industryId: input.industryId,
    });

    const subtotalCents = toCents(calculated.subtotal);
    const engineTotalCents = toCents(calculated.total);
    const cityFeeCents = toCents(calculated.cityFee);

    let govFeeCents = 0;
    let discountCents = 0;

    for (const line of input.extraLines ?? []) {
      const lineCents = toCents(line.amount);
      if (line.kind === "gov_fee") {
        govFeeCents += lineCents;
      } else if (line.kind === "discount") {
        discountCents += lineCents;
      }
    }

    if (discountCents > subtotalCents) {
      throw new HttpError(400, "Discount cannot exceed subtotal");
    }

    const finalTotalCents = engineTotalCents + govFeeCents - discountCents;
    const totalPrice = fromCents(finalTotalCents);

    const serviceCents = calculated.serviceCharges.reduce((sum, item) => sum + toCents(item.price), 0);
    const engineItems: QuotationItemEntity[] = [
      {
        serviceId: null,
        label: "Worker base",
        kind: "worker_base",
        quantity: 1,
        unitPrice: fromCents(subtotalCents - serviceCents),
        lineTotal: fromCents(subtotalCents - serviceCents),
        unit_price: fromCents(subtotalCents - serviceCents),
        line_total: fromCents(subtotalCents - serviceCents),
        price: fromCents(subtotalCents - serviceCents),
      } as QuotationItemEntity,
      ...calculated.serviceCharges.map((item) => {
      const priceStr = fromCents(toCents(item.price));
      return {
        serviceId: item.serviceId,
        label: item.name,
        kind: "service",
        quantity: 1,
        unitPrice: priceStr,
        lineTotal: priceStr,
        unit_price: priceStr,
        line_total: priceStr,
        price: priceStr,
      } as QuotationItemEntity;
      }),
    ];

    if (cityFeeCents !== 0) {
      const cityFee = fromCents(cityFeeCents);
      engineItems.push({
        serviceId: null,
        label: "City fee",
        kind: "gov_fee",
        quantity: 1,
        unitPrice: cityFee,
        lineTotal: cityFee,
        unit_price: cityFee,
        line_total: cityFee,
        price: cityFee,
      } as QuotationItemEntity);
    }

    const extraItems: QuotationItemEntity[] = (input.extraLines ?? []).map((line) => {
      const amountCents = toCents(line.amount);
      const signedAmount = line.kind === "discount" ? -amountCents : amountCents;
      const amountStr = fromCents(signedAmount);
      return {
        serviceId: null,
        label: line.label,
        kind: line.kind,
        quantity: 1,
        unitPrice: amountStr,
        lineTotal: amountStr,
        unit_price: amountStr,
        line_total: amountStr,
        price: amountStr,
      } as QuotationItemEntity;
    });

    const quotation = quotations().create({
      customerId: input.customerId,
      industryId: input.industryId,
      locationId: input.locationId,
      workerCount: input.workerCount,
      totalPrice,
      currency: calculated.currency,
      status: QuotationStatus.Draft,
      expiresAt: new Date(Date.now() + validityDays * 86_400_000),
      items: [...engineItems, ...extraItems],
    });

    const saved = await quotations().save(quotation);
    await history().save(history().create({ quotationId: saved.id, toStatus: QuotationStatus.Draft, changedBy: actor.id }));
    return this.get(saved.id, actor);
  },

  async list(actor: Actor) {
    const where = actor.role === UserRole.Customer ? { customerId: actor.id } : {};
    const rows = await quotations().find({ where, relations: { items: { service: true }, customer: true, industry: true, location: true }, order: { createdAt: "DESC" } });
    return Promise.all(
      rows.map(async (row) => {
        if (row.items) {
          row.items = row.items.map(normalizeItem);
        }
        return expireIfNeeded(row);
      }),
    );
  },

  async get(id: string, actor: Actor) {
    const quotation = await quotations().findOne({ where: { id }, relations: { items: { service: true }, customer: true, industry: true, location: true } });
    if (!quotation) throw new HttpError(404, "Quotation not found");
    assertAccess(quotation, actor);
    if (quotation.items) {
      quotation.items = quotation.items.map(normalizeItem);
    }
    return expireIfNeeded(quotation);
  },

  async transition(id: string, nextStatus: string, actor: Actor, note?: string) {
    if (!isQuotationStatus(nextStatus)) throw new HttpError(400, "Invalid quotation status");
    const quotation = await this.get(id, actor);
    assertAccess(quotation, actor, true);
    assertQuotationTransition(quotation.status as QuotationStatus, nextStatus);
    const previous = quotation.status;
    quotation.status = nextStatus;
    if (nextStatus === QuotationStatus.Sent) quotation.sentAt = new Date();
    if (nextStatus === QuotationStatus.Accepted) quotation.acceptedAt = new Date();
    if (nextStatus === QuotationStatus.Rejected) quotation.rejectionReason = note ?? null;
    await quotations().save(quotation);
    await history().save(history().create({ quotationId: id, fromStatus: previous, toStatus: nextStatus, changedBy: actor.id, note: note ?? null }));

    const notificationRepository = AppDataSource.getRepository(NotificationLogEntity);
    await notificationRepository.save(
      notificationRepository.create({
        userId: quotation.customerId,
        type: "quotation_status_change",
        channel: "email",
        status: "queued",
        sentAt: null,
      }),
    );

    if (nextStatus === QuotationStatus.Sent && quotation.customer?.email) {
      const currencyRaw = quotation.currency ?? (await getSettingValue("currency"));
      const currency = typeof currencyRaw === "string" ? currencyRaw : "MXN";
      void sendEmail({
        to: quotation.customer.email,
        subject: "Your quotation is ready",
        text: `Your quotation ${quotation.id} is ready for review. Total: ${currency} ${quotation.totalPrice}.`,
      });
    }
    return this.get(id, actor);
  },

  async history(id: string, actor: Actor) {
    await this.get(id, actor);
    return history().find({ where: { quotationId: id }, order: { createdAt: "ASC" } });
  },
};
