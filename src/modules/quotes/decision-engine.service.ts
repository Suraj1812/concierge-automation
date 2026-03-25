import { Enquiry } from "../enquiries/enquiry.model";
import { getEntityId } from "../../common/utils/entity";
import { Vendor } from "../vendors/vendor.model";
import { Quote, QuoteScoreBreakdown } from "./quote.model";

export class DecisionEngineService {
  private computePriceScore(amount: number, minAmount: number, maxAmount: number): number {
    if (maxAmount === minAmount) {
      return 90;
    }

    return Math.max(20, Math.min(100, 100 - ((amount - minAmount) / (maxAmount - minAmount)) * 80));
  }

  private computeFitScore(quote: Quote, enquiry: Enquiry): number {
    const inclusionScore = Math.min((quote.normalizedOffer?.inclusions.length ?? 0) * 8, 40);
    const preferenceMatches = enquiry.requirements.preferences?.filter((preference) =>
      quote.normalizedOffer?.inclusions.some((item) => item.toLowerCase().includes(preference.toLowerCase()))
    ).length ?? 0;
    const preferenceScore = Math.min(preferenceMatches * 15, 30);
    const availabilityScore = quote.normalizedOffer?.availabilityStatus.toLowerCase().includes("available") ? 30 : 10;
    return Math.min(100, inclusionScore + preferenceScore + availabilityScore);
  }

  private computeVendorReliability(vendor?: Vendor): number {
    if (!vendor) {
      return 50;
    }
    return Math.round((vendor.rating / 5) * 100);
  }

  private computeResponseSpeed(vendor?: Vendor): number {
    if (!vendor) {
      return 40;
    }
    return Math.max(20, 100 - vendor.responseSlaHours * 8);
  }

  rankQuotes(enquiry: Enquiry, quotes: Quote[], vendors: Vendor[]): Array<Quote & { scoreBreakdown: QuoteScoreBreakdown }> {
    const normalizedQuotes = quotes.filter((quote) => quote.normalizedOffer?.totalAmount);
    if (normalizedQuotes.length === 0) {
      return [];
    }

    const vendorById = new Map(
      vendors.map((vendor) => [
        getEntityId(vendor),
        vendor
      ])
    );
    const minAmount = Math.min(...normalizedQuotes.map((quote) => quote.normalizedOffer?.totalAmount ?? 0));
    const maxAmount = Math.max(...normalizedQuotes.map((quote) => quote.normalizedOffer?.totalAmount ?? 0));

    return normalizedQuotes
      .map((quote) => {
        const vendor = vendorById.get(quote.vendorId.toString());
        const priceScore = this.computePriceScore(quote.normalizedOffer?.totalAmount ?? maxAmount, minAmount, maxAmount);
        const fitScore = this.computeFitScore(quote, enquiry);
        const vendorReliabilityScore = this.computeVendorReliability(vendor);
        const responseSpeedScore = this.computeResponseSpeed(vendor);
        const totalScore = Math.round(priceScore * 0.35 + fitScore * 0.35 + vendorReliabilityScore * 0.2 + responseSpeedScore * 0.1);

        return {
          ...quote,
          scoreBreakdown: {
            priceScore,
            fitScore,
            vendorReliabilityScore,
            responseSpeedScore,
            totalScore
          }
        };
      })
      .sort((left, right) => right.scoreBreakdown.totalScore - left.scoreBreakdown.totalScore);
  }
}
