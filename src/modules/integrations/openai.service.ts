import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../config/env";
import { serviceTypes, conversationStates } from "../../common/types/domain";
import { safeJsonParse } from "../../common/utils/json";
import { AppError } from "../../common/errors/AppError";
import { CircuitBreaker } from "../../infrastructure/resilience/circuit-breaker";
import { withTimeout } from "../../common/utils/timeout";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { recordUsageEvent } from "../usage/recorder";

const customerTurnSchema = z.object({
  replyText: z.string().min(1),
  summary: z.string().min(1),
  title: z.string().min(1),
  serviceType: z.enum(serviceTypes).optional(),
  extractedRequirements: z.object({
    destination: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    guestCount: z.number().int().positive().optional(),
    budgetMin: z.number().optional(),
    budgetMax: z.number().optional(),
    preferences: z.array(z.string()).optional(),
    notes: z.string().optional()
  }),
  missingFields: z.array(z.string()),
  nextState: z.enum(conversationStates),
  nextAction: z.enum(["clarify", "vendor_match", "proposal_follow_up", "payment_follow_up", "general_reply"]),
  memoryUpdate: z
    .object({
      shouldUpdate: z.boolean(),
      summary: z.string().optional(),
      preferences: z
        .object({
          language: z.string().optional(),
          tone: z.string().optional(),
          budgetRange: z.string().optional(),
          destinations: z.array(z.string()).optional(),
          dietaryRestrictions: z.array(z.string()).optional(),
          roomPreferences: z.array(z.string()).optional(),
          travelPreferences: z.array(z.string()).optional(),
          specialOccasions: z.array(z.string()).optional()
        })
        .optional()
    })
    .default({ shouldUpdate: false })
});

const normalizedQuoteSchema = z.object({
  title: z.string(),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  totalAmount: z.number(),
  currency: z.string(),
  terms: z.array(z.string()),
  availabilityStatus: z.string(),
  cancellationPolicy: z.string().optional(),
  aiSummary: z.string()
});

const proposalCopySchema = z.object({
  summary: z.string(),
  premiumMessage: z.string()
});

export class OpenAIService {
  private readonly client: OpenAI;
  private readonly circuitBreaker = new CircuitBreaker(4, 20_000);

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  private async createJsonCompletion(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
    const completion = await this.circuitBreaker.execute(async () =>
      withTimeout(
        this.client.chat.completions.create({
          model: env.OPENAI_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ]
        }),
        20_000,
        () => new AppError("OpenAI request timed out", 504, "AI_TIMEOUT")
      )
    );

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new AppError("OpenAI returned an empty response", 502, "AI_EMPTY_RESPONSE");
    }

    const parsed = safeJsonParse<Record<string, unknown>>(content);

    if (!parsed) {
      throw new AppError("OpenAI response was not valid JSON", 502, "AI_INVALID_JSON");
    }

    await recordUsageEvent("ai.completion", 1, {
      model: env.OPENAI_MODEL
    });

    return parsed;
  }

  async generateConciergeTurn(payload: {
    customerName?: string;
    customerMemory?: string;
    activeEnquirySummary?: string;
    pendingClarifications: string[];
    history: Array<{ role: string; text: string }>;
    latestCustomerMessage: string;
  }) {
    const tenantConfig = await resolveCurrentTenantConfig();
    const systemPrompt = `
You are an AI concierge for a luxury concierge SaaS platform.
Return only JSON.
You must:
1. Reply in a ${tenantConfig.ai.tone}, warm, polished, human-like tone.
2. Decide whether to clarify missing details or proceed to vendor matching.
3. Extract structured requirements.
4. Preserve continuity using customer memory and the active enquiry.
5. Keep WhatsApp replies concise, high-signal, and service-oriented.
6. Never invent vendor availability, pricing, or confirmed bookings.
7. Use clarification questions when facts are missing.
8. Follow this style guide when available: ${tenantConfig.ai.styleGuide || "Concise, polished, human, service-first."}
9. Clarification strategy: ${tenantConfig.ai.clarificationStrategy}
10. Guardrails: ${tenantConfig.ai.hallucinationGuardrails.join(" | ")}
`;

    const userPrompt = JSON.stringify(payload, null, 2);
    const parsed = await this.createJsonCompletion(systemPrompt, userPrompt);
    const result = customerTurnSchema.safeParse(parsed);

    if (!result.success) {
      return {
        replyText: tenantConfig.ai.fallbackReply,
        summary: "Fallback concierge clarification response",
        title: "Concierge enquiry",
        serviceType: undefined,
        extractedRequirements: {},
        missingFields: ["destination", "startDate"],
        nextState: "awaiting_clarification" as const,
        nextAction: "clarify" as const,
        memoryUpdate: {
          shouldUpdate: false
        }
      };
    }

    return result.data;
  }

  async normalizeQuote(payload: { enquirySummary: string; rawQuote: string }) {
    const systemPrompt = `
You normalize luxury vendor quotes into a structured commercial format.
Return only JSON.
Amounts must be numeric.
Keep the summary factual and concise.
`;

    const parsed = await this.createJsonCompletion(systemPrompt, JSON.stringify(payload, null, 2));
    const result = normalizedQuoteSchema.parse(parsed);
    return result;
  }

  async generateProposalCopy(payload: {
    customerName?: string;
    enquiryTitle: string;
    enquirySummary: string;
    recommendation: Record<string, unknown>;
    alternatives: Record<string, unknown>[];
    customerMemory?: string;
  }) {
    const tenantConfig = await resolveCurrentTenantConfig();
    const systemPrompt = `
You write premium luxury concierge proposals for high-value clients.
Return only JSON.
The premiumMessage must feel polished, concise, reassuring, and suitable for WhatsApp.
The summary should be suitable for a PDF proposal body.
The company brand is ${tenantConfig.proposal.companyName}.
Use this style guide when helpful: ${tenantConfig.ai.styleGuide || "Concise, polished, human, service-first."}
`;

    const parsed = await this.createJsonCompletion(systemPrompt, JSON.stringify(payload, null, 2));
    return proposalCopySchema.parse(parsed);
  }
}
