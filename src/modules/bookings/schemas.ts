import { z } from "zod";

export const updateBookingSchema = z.object({
  params: z.object({
    bookingId: z.string().min(1)
  }),
  body: z.object({
    status: z.string().optional(),
    confirmationReference: z.string().optional(),
    notes: z.string().optional()
  })
});
