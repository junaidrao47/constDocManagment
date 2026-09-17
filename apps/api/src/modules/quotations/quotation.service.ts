import { AppDataSource } from "../../config/database";
import { QuotationStatusHistoryEntity } from "../../entities/quotation-status-history.entity";
import { QuotationItemEntity } from "../../entities/quotation-item.entity";
import { HttpError } from "../../utils/http-error";
import { sendEmail } from "../../utils/email";
import { UserRole } from "../users/user.entity";
import { publicService } from "../public/public.service";
import { PricingInput } from "./pricing.engine";
import { QuotationEntity } from "./quotation.entity";
import { assertQuotationTransition, isQuotationStatus, QuotationStatus } from "./quotation-status";

type Actor = { id: string; role: UserRole };
const quotations = () => AppDataSource.getRepository(QuotationEntity);
const history = () => AppDataSource.getRepository(QuotationStatusHistoryEntity);

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
  async create(customerId: string, input: PricingInput, validityDays = 30) {
    const calculated = await publicService.calculate(input);
    const quotation = quotations().create({
      customerId, industryId: input.industryId, locationId: input.locationId, workerCount: input.workerCount,
      totalPrice: calculated.total.toFixed(2), status: QuotationStatus.Draft,
      expiresAt: new Date(Date.now() + validityDays * 86_400_000),
      items: calculated.serviceCharges.map((item) => ({ serviceId: item.serviceId, price: item.price.toFixed(2) } as QuotationItemEntity)),
    });
    const saved = await quotations().save(quotation);
    await history().save(history().create({ quotationId: saved.id, toStatus: QuotationStatus.Draft, changedBy: customerId }));
    return this.get(saved.id, { id: customerId, role: UserRole.Customer });
  },

  async list(actor: Actor) {
    const where = actor.role === UserRole.Customer ? { customerId: actor.id } : {};
    const rows = await quotations().find({ where, relations: { items: { service: true }, customer: true, industry: true, location: true }, order: { createdAt: "DESC" } });
    return Promise.all(rows.map(expireIfNeeded));
  },

  async get(id: string, actor: Actor) {
    const quotation = await quotations().findOne({ where: { id }, relations: { items: { service: true }, customer: true, industry: true, location: true } });
    if (!quotation) throw new HttpError(404, "Quotation not found");
    assertAccess(quotation, actor);
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
    if (nextStatus === QuotationStatus.Sent && quotation.customer?.email) {
      void sendEmail({ to: quotation.customer.email, subject: "Your quotation is ready", text: `Your quotation ${quotation.id} is ready for review. Total: PKR ${quotation.totalPrice}.` });
    }
    return this.get(id, actor);
  },

  async history(id: string, actor: Actor) {
    await this.get(id, actor);
    return history().find({ where: { quotationId: id }, order: { createdAt: "ASC" } });
  },
};
