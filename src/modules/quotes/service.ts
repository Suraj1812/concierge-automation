import { quoteNormalizationQueue, proposalGenerationQueue } from "../../infrastructure/queue/queues";
import { OpenAIService } from "../integrations/openai.service";
import { EnquiryRepository } from "../enquiries/repository";
import { VendorRepository } from "../vendors/repository";
import { Quote, QuoteModel } from "./quote.model";
import { QuoteRepository } from "./repository";
import { DecisionEngineService } from "./decision-engine.service";
import { getEntityId } from "../../common/utils/entity";

export class QuoteService {
  constructor(
    private readonly quoteRepository: QuoteRepository,
    private readonly enquiryRepository: EnquiryRepository,
    private readonly vendorRepository: VendorRepository,
    private readonly openAIService: OpenAIService,
    private readonly decisionEngineService: DecisionEngineService
  ) {}

  async create(payload: Quote): Promise<Quote> {
    const quote = await this.quoteRepository.create(payload);

    await this.vendorRepository.markVendorResponded(payload.enquiryId.toString(), payload.vendorId.toString(), payload.rawPayload);
    await quoteNormalizationQueue.add(
      "quote-normalization",
      {
        quoteId: getEntityId(quote)
      },
      {
        jobId: `quote-normalization:${getEntityId(quote)}`
      }
    );

    return quote;
  }

  async listByEnquiry(enquiryId: string): Promise<Quote[]> {
    return this.quoteRepository.findByEnquiry(enquiryId);
  }

  async normalizeQuote(quoteId: string): Promise<void> {
    const quote = await this.quoteRepository.findById(quoteId);

    if (!quote) {
      return;
    }

    const enquiry = await this.enquiryRepository.findById(quote.enquiryId.toString());
    if (!enquiry) {
      return;
    }

    const normalized = await this.openAIService.normalizeQuote({
      enquirySummary: enquiry.summary,
      rawQuote: quote.rawPayload
    });

    await this.quoteRepository.update(quoteId, {
      normalizedOffer: {
        title: normalized.title,
        inclusions: normalized.inclusions,
        exclusions: normalized.exclusions,
        totalAmount: normalized.totalAmount,
        currency: normalized.currency,
        terms: normalized.terms,
        availabilityStatus: normalized.availabilityStatus,
        cancellationPolicy: normalized.cancellationPolicy
      },
      aiSummary: normalized.aiSummary,
      status: "normalized"
    });

    await this.enquiryRepository.update(quote.enquiryId.toString(), {
      status: "quote_normalizing"
    });

    const openVendorRequests = await this.vendorRepository.findOpenVendorRequestsByEnquiry(quote.enquiryId.toString());
    if (openVendorRequests.length === 0) {
      await proposalGenerationQueue.add(
        "proposal-generation",
        {
          enquiryId: quote.enquiryId.toString()
        },
        {
          jobId: `proposal-generation:${quote.enquiryId.toString()}`
        }
      );
    }
  }

  async rankEnquiryQuotes(enquiryId: string) {
    const enquiry = await this.enquiryRepository.findById(enquiryId);
    if (!enquiry) {
      return [];
    }

    const quotes = await this.quoteRepository.findByEnquiry(enquiryId);
    const vendors = await this.vendorRepository.list();
    const ranked = this.decisionEngineService.rankQuotes(enquiry, quotes, vendors);

    for (const rankedQuote of ranked) {
      await QuoteModel.findByIdAndUpdate(getEntityId(rankedQuote), {
        $set: {
          scoreBreakdown: rankedQuote.scoreBreakdown
        }
      });
    }

    return ranked;
  }
}
