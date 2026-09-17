import { HttpError } from "../../utils/http-error";

export enum QuotationStatus {
  Draft = "draft",
  Sent = "sent",
  UnderReview = "under_review",
  Accepted = "accepted",
  Rejected = "rejected",
  Expired = "expired",
}

const FLOW: Record<QuotationStatus, QuotationStatus[]> = {
  [QuotationStatus.Draft]: [QuotationStatus.Sent, QuotationStatus.Rejected],
  [QuotationStatus.Sent]: [QuotationStatus.UnderReview, QuotationStatus.Accepted, QuotationStatus.Rejected, QuotationStatus.Expired],
  [QuotationStatus.UnderReview]: [QuotationStatus.Accepted, QuotationStatus.Rejected, QuotationStatus.Expired],
  [QuotationStatus.Accepted]: [],
  [QuotationStatus.Rejected]: [],
  [QuotationStatus.Expired]: [],
};

export function assertQuotationTransition(from: QuotationStatus, to: QuotationStatus): void {
  if (!FLOW[from]?.includes(to)) throw new HttpError(409, `Cannot move a quotation from ${from} to ${to}`);
}

export function isQuotationStatus(value: string): value is QuotationStatus {
  return Object.values(QuotationStatus).includes(value as QuotationStatus);
}