import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError";
import { BookingRepository } from "./repository";
import { PaymentRepository } from "../payments/repository";
import { ProposalRepository } from "../proposals/repository";
import { EnquiryRepository } from "../enquiries/repository";
import { CustomerRepository } from "../users/repository";
import { QuoteRepository } from "../quotes/repository";
import { NotificationService } from "../notifications/service";
import { getEntityId } from "../../common/utils/entity";
import { Booking } from "./booking.model";
import { VendorRepository } from "../vendors/repository";
import { bookingLifecycleQueue } from "../../infrastructure/queue/queues";
import { addHours, parseDateOrNull } from "../../common/utils/date";
import { env } from "../../config/env";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";
import { getTenantIdFromEntity } from "../../common/utils/tenant";

export class BookingService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly proposalRepository: ProposalRepository,
    private readonly enquiryRepository: EnquiryRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly notificationService: NotificationService,
    private readonly vendorRepository: VendorRepository
  ) {}

  async list() {
    return this.bookingRepository.list();
  }

  async update(bookingId: string, payload: { status?: Booking["status"]; confirmationReference?: string; notes?: string }) {
    return this.bookingRepository.update(bookingId, payload);
  }

  async createOrUpdateFromPayment(paymentId: string) {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
    }

    const enquiry = await this.enquiryRepository.findById(payment.enquiryId.toString());
    const proposal = payment.proposalId ? await this.proposalRepository.findById(payment.proposalId.toString()) : null;
    const customer = enquiry ? await this.customerRepository.findById(enquiry.customerId.toString()) : null;

    if (!payment || !enquiry || !proposal || !customer) {
      throw new AppError("Booking dependencies missing", 422, "BOOKING_DEPENDENCY_MISSING");
    }
    const tenantId = getTenantIdFromEntity(payment)
      || getTenantIdFromEntity(enquiry)
      || getTenantIdFromEntity(proposal)
      || getTenantIdFromEntity(customer)
      || getCurrentTenantId();

    const existingBooking = await this.bookingRepository.findByEnquiry(getEntityId(enquiry));

    if (existingBooking) {
      await this.bookingRepository.update(getEntityId(existingBooking), {
        paymentId: new Types.ObjectId(paymentId),
        status: "confirmed"
      });
      return existingBooking;
    }

    const quote = await this.quoteRepository.findById(proposal.recommendedQuoteId.toString());

    if (!quote) {
      throw new AppError("Recommended quote missing for booking", 422, "BOOKING_QUOTE_MISSING");
    }

    const booking = await this.bookingRepository.create({
      enquiryId: new Types.ObjectId(getEntityId(enquiry)),
      customerId: new Types.ObjectId(getEntityId(customer)),
      vendorId: new Types.ObjectId(quote.vendorId.toString()),
      quoteId: new Types.ObjectId(getEntityId(quote)),
      proposalId: new Types.ObjectId(getEntityId(proposal)),
      paymentId: new Types.ObjectId(paymentId),
      status: "confirmed",
      confirmationReference: `BKG-${Date.now()}`,
      serviceWindow: [enquiry.requirements.startDate, enquiry.requirements.endDate].filter(Boolean).join(" to "),
      ...(tenantId ? { tenantId } : {})
    });

    await this.enquiryRepository.update(getEntityId(enquiry), {
      bookingId: new Types.ObjectId(getEntityId(booking)),
      paymentStatus: "captured",
      status: "booked"
    });

    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "booking-confirmed",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: `Your booking is confirmed. Reference: ${(booking as unknown as { confirmationReference?: string }).confirmationReference}. Our concierge team will now coordinate the final arrangements.`
        },
        idempotencyKey: `booking-confirmed:${getEntityId(booking)}`,
        tenantId
      });
    }

    const vendor = await this.vendorRepository.findById(quote.vendorId.toString());
    const vendorContact = vendor?.contactPoints.find((contact) => contact.channel === "whatsapp")
      || vendor?.contactPoints.find((contact) => contact.channel === "email")
      || vendor?.contactPoints[0];

    if (vendorContact) {
      await this.notificationService.enqueue({
        type: "vendor-booking-confirmed",
        channel: vendorContact.channel,
        recipient: vendorContact.value,
        body: {
          subject: `Confirmed booking: ${enquiry.title}`,
          text: `The booking is now confirmed.\nReference: ${(booking as unknown as { confirmationReference?: string }).confirmationReference}\nService: ${enquiry.title}\nWindow: ${(booking as unknown as { serviceWindow?: string }).serviceWindow || "TBD"}`
        },
        idempotencyKey: `vendor-booking-confirmed:${getEntityId(booking)}`,
        tenantId
      });
    }

    await this.scheduleLifecycleJobs(getEntityId(booking), enquiry.requirements.startDate, enquiry.requirements.endDate, tenantId);

    return booking;
  }

  async processServiceReminder(bookingId: string): Promise<void> {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking || ["cancelled", "completed"].includes(booking.status)) {
      return;
    }

    const enquiry = await this.enquiryRepository.findById(booking.enquiryId.toString());
    const customer = await this.customerRepository.findById(booking.customerId.toString());
    const vendor = await this.vendorRepository.findById(booking.vendorId.toString());

    if (!enquiry || !customer) {
      return;
    }
    const tenantId = getTenantIdFromEntity(booking) || getTenantIdFromEntity(enquiry) || getTenantIdFromEntity(customer) || getCurrentTenantId();

    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "service-reminder-customer",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: `A quick note that your upcoming ${enquiry.title.toLowerCase()} arrangement is approaching. Our concierge team is coordinating all final details for a seamless experience.`
        },
        idempotencyKey: `service-reminder-customer:${bookingId}`,
        tenantId
      });
    }

    const vendorContact = vendor?.contactPoints.find((contact) => contact.channel === "whatsapp")
      || vendor?.contactPoints.find((contact) => contact.channel === "email")
      || vendor?.contactPoints[0];

    if (vendorContact) {
      await this.notificationService.enqueue({
        type: "service-reminder-vendor",
        channel: vendorContact.channel,
        recipient: vendorContact.value,
        body: {
          subject: `Upcoming service reminder: ${enquiry.title}`,
          text: `This is a reminder for the upcoming confirmed service.\nReference: ${booking.confirmationReference || "TBD"}\nWindow: ${booking.serviceWindow || "TBD"}`
        },
        idempotencyKey: `service-reminder-vendor:${bookingId}`,
        tenantId
      });
    }
  }

  async processDayOfServiceCheckIn(bookingId: string): Promise<void> {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking || ["cancelled", "completed"].includes(booking.status)) {
      return;
    }

    const enquiry = await this.enquiryRepository.findById(booking.enquiryId.toString());
    const customer = await this.customerRepository.findById(booking.customerId.toString());

    if (!enquiry || !customer) {
      return;
    }
    const tenantId = getTenantIdFromEntity(booking) || getTenantIdFromEntity(enquiry) || getTenantIdFromEntity(customer) || getCurrentTenantId();

    await this.bookingRepository.update(bookingId, {
      status: "in_progress"
    });

    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "day-of-service-checkin",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: `Today is the day for your ${enquiry.title.toLowerCase()} arrangement. If you need anything at all, I’m here and coordinating in the background for you.`
        },
        idempotencyKey: `day-of-service-checkin:${bookingId}`,
        tenantId
      });
    }
  }

  async processPostServiceFollowUp(bookingId: string): Promise<void> {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking || booking.status === "cancelled") {
      return;
    }

    const enquiry = await this.enquiryRepository.findById(booking.enquiryId.toString());
    const customer = await this.customerRepository.findById(booking.customerId.toString());

    if (!enquiry || !customer) {
      return;
    }
    const tenantId = getTenantIdFromEntity(booking) || getTenantIdFromEntity(enquiry) || getTenantIdFromEntity(customer) || getCurrentTenantId();

    await this.bookingRepository.update(bookingId, {
      status: "completed"
    });

    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "post-service-follow-up",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: `I hope your ${enquiry.title.toLowerCase()} experience was exceptional. If you would like, I can also help with anything next on your calendar.`
        },
        idempotencyKey: `post-service-follow-up:${bookingId}`,
        tenantId
      });
    }
  }

  private async scheduleLifecycleJobs(bookingId: string, startDate?: string, endDate?: string, tenantId?: string): Promise<void> {
    const start = parseDateOrNull(startDate);
    const end = parseDateOrNull(endDate) || start;

    if (!start) {
      return;
    }

    const reminderAt = addHours(start, -env.SERVICE_REMINDER_HOURS_BEFORE);
    const now = new Date();

    if (reminderAt > now) {
      await bookingLifecycleQueue.add(
        "service-reminder",
        {
          tenantId: tenantId || getCurrentTenantId(),
          bookingId
        },
        {
          delay: reminderAt.getTime() - now.getTime(),
          jobId: `service-reminder:${bookingId}`
        }
      );
    }

    if (start > now) {
      await bookingLifecycleQueue.add(
        "day-of-service-checkin",
        {
          tenantId: tenantId || getCurrentTenantId(),
          bookingId
        },
        {
          delay: start.getTime() - now.getTime(),
          jobId: `day-of-service-checkin:${bookingId}`
        }
      );
    }

    if (end && end > now) {
      const followUpAt = addHours(end, env.POST_SERVICE_FOLLOW_UP_HOURS_AFTER);
      await bookingLifecycleQueue.add(
        "post-service-follow-up",
        {
          tenantId: tenantId || getCurrentTenantId(),
          bookingId
        },
        {
          delay: followUpAt.getTime() - now.getTime(),
          jobId: `post-service-follow-up:${bookingId}`
        }
      );
    }
  }
}
