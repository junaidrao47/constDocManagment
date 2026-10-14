import { In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { assignmentService } from "../assignments/assignment.service";
import { QuotationStatusHistoryEntity } from "../../entities/quotation-status-history.entity";
import { QuotationItemEntity } from "../../entities/quotation-item.entity";
import { HttpError } from "../../utils/http-error";
import { toPublicUser } from "../../utils/serialize-user";
import { UserEntity, UserRole } from "../users/user.entity";
import { publicService, getSettingValue } from "../public/public.service";
import { notify, type NotificationType } from "../notifications/notify.service";
import { PricingInput } from "./pricing.engine";
import { QuotationEntity } from "./quotation.entity";
import { assertQuotationTransition, isQuotationStatus, QuotationStatus } from "./quotation-status";
import { QuotationListQuery, StaffQuotationCreateInput } from "./quotation.schema";

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

/**
 * Replaces the loaded customer with its public fields. Runs last, after any save,
 * because the loaded relation carries passwordHash and tokensValidFrom.
 */
function withPublicCustomer(quotation: QuotationEntity): QuotationEntity {
  if (quotation.customer) {
    // Narrower than UserEntity by design; only the public fields may leave the service.
    quotation.customer = toPublicUser(quotation.customer) as UserEntity;
  }
  return quotation;
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

/**
 * Sort keys mapped to TypeORM order objects.
 *
 * An explicit allow-list, never a key interpolated from the query string: the
 * value reaches a repository option object, so an unmapped key would be a
 * caller-controlled column reference. `QuotationListQuerySchema` rejects anything
 * not listed here with a 400 before it gets this far; this table is the second
 * line of that defence, not the first.
 */
const SORT_ORDERS = {
  createdAt: { createdAt: "ASC" },
  "-createdAt": { createdAt: "DESC" },
  totalPrice: { totalPrice: "ASC" },
  "-totalPrice": { totalPrice: "DESC" },
  status: { status: "ASC" },
  "-status": { status: "DESC" },
} as const satisfies Record<NonNullable<QuotationListQuery["sort"]>, Record<string, "ASC" | "DESC">>;

const LIST_RELATIONS = { items: { service: true }, customer: true, industry: true, location: true } as const;

const DEFAULT_PAGE_SIZE = 25;

/** Normalises line items, applies lazy expiry, and strips the customer to public fields. */
async function decorateRow(row: QuotationEntity): Promise<QuotationEntity> {
  if (row.items) {
    row.items = row.items.map(normalizeItem);
  }
  return withPublicCustomer(await expireIfNeeded(row));
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

  /**
   * Quotations visible to `actor`, newest first.
   *
   * Pagination is **opt-in**. With no `page`/`pageSize`/`limit` the return value is
   * the bare array it has always been, because the admin, staff and customer
   * quotation pages all consume it as `Quotation[]`. Pass any one of them and the
   * result is wrapped as `{ data, pagination }`, matching the invoice and document
   * list endpoints.
   *
   * The customer ownership filter applies on both paths.
   */
  async list(actor: Actor, query?: QuotationListQuery) {
    // The same helper the document review queue uses. An agent sees quotations for
    // their assigned customers only; manager and admin are unrestricted.
    const scope = await assignmentService.customerScopeFor(actor);
    const where = {
      ...(actor.role === UserRole.Customer ? { customerId: actor.id } : {}),
      ...(scope ? { customerId: In(scope) } : {}),
      ...(query?.status ? { status: query.status } : {}),
    };
    const order = SORT_ORDERS[query?.sort ?? "-createdAt"];
    const paginating =
      query !== undefined &&
      (query.page !== undefined || query.pageSize !== undefined || query.limit !== undefined);

    // An agent with no assignments sees nothing. Short-circuited rather than built
    // into the query because In([]) is invalid SQL.
    const emptyScope = scope !== null && scope.length === 0;

    if (!paginating) {
      if (emptyScope) {
        return [];
      }

      const rows = await quotations().find({ where, relations: LIST_RELATIONS, order });
      return Promise.all(rows.map(decorateRow));
    }

    const page = query.page ?? 1;
    // pageSize wins over limit: limit exists only so an API client that reached for
    // the commoner name is not silently given 25 rows.
    const pageSize = query.pageSize ?? query.limit ?? DEFAULT_PAGE_SIZE;

    if (emptyScope) {
      return { data: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };
    }

    const [rows, total] = await quotations().findAndCount({
      where,
      relations: LIST_RELATIONS,
      order,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: await Promise.all(rows.map(decorateRow)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  },

  async get(id: string, actor: Actor) {
    const quotation = await quotations().findOne({ where: { id }, relations: { items: { service: true }, customer: true, industry: true, location: true } });
    if (!quotation) throw new HttpError(404, "Quotation not found");
    assertAccess(quotation, actor);
    return decorateRow(quotation);
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

    const notificationType: Partial<Record<QuotationStatus, NotificationType>> = {
      [QuotationStatus.Sent]: "quotation_sent",
      [QuotationStatus.Accepted]: "quotation_accepted",
      [QuotationStatus.Rejected]: "quotation_rejected",
    };
    const currencyRaw = quotation.currency ?? (await getSettingValue("currency"));
    const currency = typeof currencyRaw === "string" ? currencyRaw : "MXN";
    // Every transition is recorded; only sent/accepted/rejected also email the customer.
    await notify({
      userId: quotation.customerId,
      type: notificationType[nextStatus as QuotationStatus] ?? "quotation_status_changed",
      data: {
        quotationNumber: quotation.id,
        status: nextStatus,
        currency,
        total: quotation.totalPrice,
        note: note ?? "",
      },
    });
    return this.get(id, actor);
  },

  async history(id: string, actor: Actor) {
    await this.get(id, actor);
    return history().find({ where: { quotationId: id }, order: { createdAt: "ASC" } });
  },
};
