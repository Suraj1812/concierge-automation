export const serviceTypes = [
  "luxury_hotel",
  "private_jet",
  "yacht",
  "villa",
  "restaurant",
  "chauffeur",
  "event",
  "bespoke"
] as const;

export type ServiceType = (typeof serviceTypes)[number];

export const enquiryStatuses = [
  "new",
  "awaiting_clarification",
  "vendor_matching",
  "awaiting_vendor_quotes",
  "quote_normalizing",
  "proposal_ready",
  "proposal_sent",
  "payment_pending",
  "payment_authorized",
  "booked",
  "completed",
  "cancelled",
  "stalled"
] as const;

export type EnquiryStatus = (typeof enquiryStatuses)[number];

export const conversationStates = [
  "collecting_requirements",
  "awaiting_clarification",
  "vendor_discovery",
  "proposal_presented",
  "payment_collection",
  "booking_confirmed"
] as const;

export type ConversationState = (typeof conversationStates)[number];

export const proposalStatuses = ["draft", "generated", "sent", "accepted", "declined", "superseded"] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];

export const paymentStatuses = ["created", "pending", "captured", "failed", "refunded"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const bookingStatuses = ["pending_payment", "confirmed", "vendor_confirmed", "in_progress", "completed", "cancelled"] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export const quoteStatuses = ["received", "normalized", "shortlisted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export const vendorRequestStatuses = ["queued", "sent", "responded", "timed_out", "failed", "closed"] as const;
export type VendorRequestStatus = (typeof vendorRequestStatuses)[number];

export const notificationStatuses = ["pending", "processing", "sent", "failed"] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];

export const communicationChannels = ["whatsapp", "email", "portal"] as const;
export type CommunicationChannel = (typeof communicationChannels)[number];

export const customerFollowUpKinds = [
  "clarification-reminder",
  "proposal-review-reminder",
  "payment-completion-reminder"
] as const;
export type CustomerFollowUpKind = (typeof customerFollowUpKinds)[number];
