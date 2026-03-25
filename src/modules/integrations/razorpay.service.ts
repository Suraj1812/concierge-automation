import Razorpay from "razorpay";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";
import { AppError } from "../../common/errors/AppError";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { CircuitBreaker } from "../../infrastructure/resilience/circuit-breaker";
import { withTimeout } from "../../common/utils/timeout";
import { retryAsync } from "../../common/utils/retry";

export class RazorpayService {
  private readonly circuitBreaker = new CircuitBreaker(4, 20_000);

  private shouldRetry(error: unknown): boolean {
    if (error instanceof AppError && error.code === "RAZORPAY_TIMEOUT") {
      return true;
    }

    const statusCode = typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : undefined;

    return statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
  }

  private normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error && error.message === "Circuit breaker is open") {
      return new AppError("Razorpay is temporarily unavailable", 503, "RAZORPAY_UNAVAILABLE");
    }

    const statusCode = typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : 502;

    return new AppError("Failed to create Razorpay order", statusCode, "RAZORPAY_ORDER_FAILED", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  private async getClient(): Promise<Razorpay> {
    const tenantConfig = await resolveCurrentTenantConfig();
    return new Razorpay({
      key_id: tenantConfig.integrations.razorpay.keyId || "",
      key_secret: tenantConfig.integrations.razorpay.keySecret || ""
    });
  }

  async createOrder(payload: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }) {
    const client = await this.getClient();

    try {
      return await this.circuitBreaker.execute(async () =>
        retryAsync(
          async () =>
            withTimeout(
              client.orders.create({
                amount: payload.amount,
                currency: payload.currency,
                receipt: payload.receipt,
                notes: payload.notes
              }),
              18_000,
              () => new AppError("Razorpay order creation timed out", 504, "RAZORPAY_TIMEOUT")
            ),
          {
            attempts: 3,
            initialDelayMs: 300,
            maxDelayMs: 1_500,
            shouldRetry: (error) => this.shouldRetry(error)
          }
        )
      );
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async verifyWebhookSignature(rawBody: Buffer | undefined, signature?: string): Promise<boolean> {
    if (!rawBody || !signature) {
      return false;
    }

    const tenantConfig = await resolveCurrentTenantConfig();
    const expected = createHmacSha256(tenantConfig.integrations.razorpay.webhookSecret || "", rawBody);
    return safeEqual(expected, signature);
  }
}
