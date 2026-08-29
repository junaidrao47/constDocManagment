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
  cityFee: number;
  serviceCharges: { serviceId: string; name: string; price: number }[];
  subtotal: number;
  total: number;
  recommendedPackage: string | null;
}

export interface PricingDbData {
  workerRanges: PricingWorkerRange[];
  location: PricingLocation | null | undefined;
  services: PricingService[];
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

export function calculateQuotation(input: PricingInput, dbData: PricingDbData): PricingOutput {
  const workerRange = pickWorkerRange(input.workerCount, dbData.workerRanges);
  const workerBasePrice = toNumber(workerRange?.basePrice);
  const locationMultiplier = toNumber(dbData.location?.multiplier) || 1;
  const cityFee = toNumber(dbData.location?.cityFee);

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
  const subtotal = workerBasePrice * locationMultiplier + serviceTotal;
  const total = subtotal + cityFee;

  return {
    workerBasePrice,
    locationMultiplier,
    cityFee,
    serviceCharges,
    subtotal,
    total,
    recommendedPackage: null,
  };
}
