import { Request, Response } from "express";
import { ConnectorDispatchResult, ConnectorService } from "./service";

export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  private sendDispatchResponse<T>(
    response: Response,
    outcome: ConnectorDispatchResult<T>,
    buildAcceptedPayload: (outcome: Extract<ConnectorDispatchResult<T>, { status: "accepted" }>) => Record<string, unknown>
  ): void {
    if (outcome.status === "duplicate") {
      response.status(200).json({
        success: true,
        duplicate: true,
        data: {
          eventId: outcome.eventId
        }
      });
      return;
    }

    if (outcome.status === "in_progress") {
      response.status(202).json({
        success: true,
        inProgress: true,
        data: {
          eventId: outcome.eventId
        }
      });
      return;
    }

    response.status(202).json({
      success: true,
      ...buildAcceptedPayload(outcome)
    });
  }

  health = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      success: true,
      data: {
        status: "ok",
        tenant: request.tenant || null
      }
    });
  };

  queueWhatsAppInbound = async (request: Request, response: Response): Promise<void> => {
    const outcome = await this.connectorService.queueWhatsAppInbound({
      tenantId: request.tenant?.id,
      tenantSlug: request.tenant?.slug,
      phone: request.body.phone,
      name: request.body.name,
      whatsappUserId: request.body.whatsappUserId,
      message: request.body.message,
      messageId: request.body.messageId,
      correlationId: request.correlationId
    });

    this.sendDispatchResponse(response, outcome, (accepted) => ({
      data: {
        ...accepted.data,
        messageId: accepted.eventId
      },
      message: "WhatsApp connector message queued. Make sure the worker is running."
    }));
  };

  ingestEmailInbound = async (request: Request, response: Response): Promise<void> => {
    const outcome = await this.connectorService.ingestEmailInbound({
      from: request.body.from,
      to: request.body.to,
      subject: request.body.subject,
      text: request.body.text,
      providerMessageId: request.body.providerMessageId,
      correlationId: request.correlationId
    });

    this.sendDispatchResponse(response, outcome, (accepted) => ({
      data: accepted.data,
      message: "Email connector payload processed successfully."
    }));
  };

  ingestVendorResponse = async (request: Request, response: Response): Promise<void> => {
    const outcome = await this.connectorService.ingestVendorResponse({
      vendorReference: request.body.vendorReference,
      vendorId: request.body.vendorId,
      enquiryId: request.body.enquiryId,
      rawPayload: request.body.rawPayload,
      expiresAt: request.body.expiresAt,
      externalEventId: request.body.externalEventId,
      correlationId: request.correlationId
    });

    this.sendDispatchResponse(response, outcome, (accepted) => ({
      data: accepted.data
    }));
  };
}
