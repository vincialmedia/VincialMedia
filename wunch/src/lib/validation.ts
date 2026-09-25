import { z } from "zod";

// Shared input rules for delivery details (checkout and profile).
export const deliveryDetailsSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  company: z.string().trim().max(120).optional().default(""),
  street: z.string().trim().min(3).max(160),
  postcode: z.string().trim().regex(/^\d{4}$/),
  city: z.string().trim().min(2).max(80),
  floorRoom: z.string().trim().max(80).optional().default(""),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()/.-]{7,25}$/),
  deliveryNote: z.string().trim().max(500).optional().default(""),
});

export type DeliveryDetails = z.infer<typeof deliveryDetailsSchema>;

export const profileSchema = deliveryDetailsSchema.partial().extend({
  locale: z.enum(["de", "en"]).optional(),
});

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
