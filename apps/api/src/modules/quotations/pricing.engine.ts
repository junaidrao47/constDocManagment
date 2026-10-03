export interface PricingInput {
  workerCount: number;
  locationId: string;
  serviceIds: string[];
  industryId: string;
}

export interface PricingWorkerRange {
  id: string;
  minWorkers: number;
  maxWorkers?: number | null;
  basePrice: string | number;
  isActive?: boolean;
}

export interface PricingLocation {
  id: string;
  multiplier: string | number;
  cityFee?: string | number | null;
  isActive?: boolean;
}

export interface PricingService {
  id: string;
  name: string;
  basePrice: string | number;
  isActive?: boolean;
}

export interface PricingOutput {
  workerBasePrice: number;
  locationMultiplier: number;
  /** Industry price-weight multiplier applied to the worker-base portion. Default 1. */
  industryWeight: number;
  cityFee: number;
  serviceCharges: { serviceId: string; name: string; price: number }[];
  subtotal: number;
  total: number;
  recommendedPackage: string | null;
  /** ISO-4217 currency code read from app_settings. */
  currency: string;
}

export interface PricingDbData {
  workerRanges: PricingWorkerRange[];
  location: PricingLocation | null | undefined;
  services: PricingService[];
  /** Decimal string or number; defaults to 1 when absent. */
  industryWeight?: string | number | null;
  /** ISO-4217 currency code; defaults to "MXN" when absent. */
  currency?: string | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickWorkerRange(workerCount: number, workerRanges: PricingWorkerRange[]): PricingWorkerRange | null {
  const activeRanges = workerRanges.filter((range) => range.isActive !== false);
  const matchedRange = activeRanges
    .filter((range) => workerCount >= range.minWorkers && (range.maxWorkers == null || workerCount <= range.maxWorkers))
    .sort((left, right) => left.minWorkers - right.minWorkers)[0];

  if (matchedRange) {
    return matchedRange;
  }

  return activeRanges
    .filter((range) => workerCount >= range.minWorkers)
    .sort((left, right) => right.minWorkers - left.minWorkers)[0] ?? null;
}

/**
 * Pure pricing calculation.
 *
 * Formula: workerBasePrice × locationMultiplier × industryWeight + serviceCharges + cityFee
 *
 * industryWeight defaults to 1 when absent, so existing prices are unchanged.
 * Only the worker-base portion is scaled; service charges are not affected.
 */
export function calculateQuotation(input: PricingInput, dbData: PricingDbData): PricingOutput {
  const workerRange = pickWorkerRange(input.workerCount, dbData.workerRanges);
  const workerBasePrice = toNumber(workerRange?.basePrice);
  const locationMultiplier = toNumber(dbData.location?.multiplier) || 1;
  const cityFee = toNumber(dbData.location?.cityFee);
  const industryWeight = dbData.industryWeight != null ? toNumber(dbData.industryWeight) || 1 : 1;
  const currency = dbData.currency ?? "MXN";

  const serviceById = new Map(
    dbData.services
      .filter((service) => service.isActive !== false)
      .map((service) => [service.id, service] as const),
  );

  const serviceCharges = input.serviceIds
    .map((serviceId) => {
      const service = serviceById.get(serviceId);
      if (!service) {
        return null;
      }

      return {
        serviceId,
        name: service.name,
        price: toNumber(service.basePrice),
      };
    })
    .filter((charge): charge is { serviceId: string; name: string; price: number } => charge !== null);

  const serviceTotal = serviceCharges.reduce((sum, charge) => sum + charge.price, 0);
  // Industry weight scales only the worker-base portion, not service charges
  const subtotal = workerBasePrice * locationMultiplier * industryWeight + serviceTotal;
  const total = subtotal + cityFee;

  return {
    workerBasePrice,
    locationMultiplier,
    industryWeight,
    cityFee,
    serviceCharges,
    subtotal,
    total,
    recommendedPackage: null,
    currency,
  };
}
