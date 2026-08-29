import { calculateQuotation, type PricingDbData, type PricingInput } from "./pricing.engine";

export const quotationService = {
  calculateQuotation(input: PricingInput, dbData: PricingDbData) {
    return calculateQuotation(input, dbData);
  },
};
