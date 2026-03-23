import { AuditLogModel } from "../audit/audit-log.model";
import { BookingModel } from "../bookings/booking.model";
import { ConversationModel } from "../conversations/conversation.model";
import { EnquiryModel } from "../enquiries/enquiry.model";
import { PaymentModel } from "../payments/payment.model";
import { UsageEventModel } from "../usage/usage-event.model";

export class DashboardService {
  async getOverview() {
    const [enquiries, activeConversations, capturedPayments, bookings, recentUsage] = await Promise.all([
      EnquiryModel.countDocuments(),
      ConversationModel.countDocuments({ status: "active" }),
      PaymentModel.aggregate<{ totalRevenue: number }>([
        { $match: { status: "captured" } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" } } }
      ]),
      BookingModel.countDocuments({ status: { $in: ["confirmed", "vendor_confirmed", "in_progress"] } }),
      UsageEventModel.find().sort({ createdAt: -1 }).limit(10).lean()
    ]);

    return {
      enquiries,
      activeConversations,
      activeBookings: bookings,
      capturedRevenue: capturedPayments[0]?.totalRevenue || 0,
      recentUsage
    };
  }

  async getFunnel() {
    const [awaitingClarification, awaitingVendorQuotes, proposalSent, paymentPending, booked] = await Promise.all([
      EnquiryModel.countDocuments({ status: "awaiting_clarification" }),
      EnquiryModel.countDocuments({ status: "awaiting_vendor_quotes" }),
      EnquiryModel.countDocuments({ status: "proposal_sent" }),
      EnquiryModel.countDocuments({ status: "payment_pending" }),
      EnquiryModel.countDocuments({ status: "booked" })
    ]);

    return {
      awaitingClarification,
      awaitingVendorQuotes,
      proposalSent,
      paymentPending,
      booked
    };
  }

  async getActivity(limit = 25) {
    return AuditLogModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }
}
