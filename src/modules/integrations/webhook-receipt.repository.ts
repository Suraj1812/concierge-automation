import { WebhookReceipt, WebhookReceiptModel } from "./webhook-receipt.model";

export class WebhookReceiptRepository {
  async hasProcessed(provider: WebhookReceipt["provider"], externalEventId: string): Promise<boolean> {
    const result = await WebhookReceiptModel.exists({ provider, externalEventId });
    return Boolean(result);
  }

  async markProcessed(provider: WebhookReceipt["provider"], externalEventId: string, signature?: string): Promise<void> {
    await WebhookReceiptModel.updateOne(
      { provider, externalEventId },
      {
        $setOnInsert: {
          provider,
          externalEventId,
          signature,
          processedAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}
