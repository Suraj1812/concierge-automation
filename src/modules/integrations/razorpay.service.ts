import Razorpay from "razorpay";
import { env } from "../../config/env";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";

export class RazorpayService {
  private readonly client: Razorpay;

  constructor() {
    this.client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
  }

  async createOrder(payload: { amount: number; currency: string; receipt: string; notes?: Record<string, string> }) {
    return this.client.orders.create({
      amount: payload.amount,
      currency: payload.currency,
      receipt: payload.receipt,
      notes: payload.notes
    });
  }

  verifyWebhookSignature(rawBody: Buffer | undefined, signature?: string): boolean {
    if (!rawBody || !signature) {
      return false;
    }

    const expected = createHmacSha256(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
    return safeEqual(expected, signature);
  }
}
