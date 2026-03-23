import Razorpay from "razorpay";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { CircuitBreaker } from "../../infrastructure/resilience/circuit-breaker";
import { withTimeout } from "../../common/utils/timeout";

export class RazorpayService {
  private readonly circuitBreaker = new CircuitBreaker(4, 20_000);

  private async getClient(): Promise<Razorpay> {
    const tenantConfig = await resolveCurrentTenantConfig();
    return new Razorpay({
      key_id: tenantConfig.integrations.razorpay.keyId || "",
      key_secret: tenantConfig.integrations.razorpay.keySecret || ""
    });
  }

  async createOrder(payload: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }) {
    const client = await this.getClient();
    return this.circuitBreaker.execute(async () =>
      withTimeout(
        client.orders.create({
          amount: payload.amount,
          currency: payload.currency,
          receipt: payload.receipt,
          notes: payload.notes
        }),
        18_000,
        () => new Error("Razorpay order creation timed out")
      )
    );
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
