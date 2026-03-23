import { z } from "zod";
import { communicationChannels, serviceTypes } from "../../common/types/domain";

const contactPointSchema = z.object({
  channel: z.enum(communicationChannels),
  value: z.string().min(1),
  label: z.string().optional()
});

export const createVendorSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    categories: z.array(z.string()).default([]),
    supportedServices: z.array(z.enum(serviceTypes)).min(1),
    geoCoverage: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    contactPoints: z.array(contactPointSchema).min(1),
    rating: z.number().min(0).max(5).default(4),
    responseSlaHours: z.number().positive().default(4),
    priorityWeight: z.number().positive().default(1),
    isActive: z.boolean().default(true)
  })
});

export const updateVendorSchema = z.object({
  params: z.object({
    vendorId: z.string().min(1)
  }),
  body: createVendorSchema.shape.body.partial()
});
