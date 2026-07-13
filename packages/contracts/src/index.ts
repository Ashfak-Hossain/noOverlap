import { z } from 'zod';

/**
 * W3C trace context, carried alongside the event so a booking can be followed end to end
 * across the process boundary. Optional for now: the field is reserved so populating it later
 * is not a breaking change to the contract.
 */
export const traceContextSchema = z.object({
  traceparent: z.string(),
  tracestate: z.string().optional(),
});
export type TraceContext = z.infer<typeof traceContextSchema>;

export const BOOKING_HELD = 'BookingHeld' as const;

/**
 * Emitted when a hold is placed. The worker consumes it and charges the card. `idempotencyKey`
 * makes a redelivered message safe: the same booking always yields the same key, so it can never
 * charge twice.
 */
export const bookingHeldSchema = z.object({
  type: z.literal(BOOKING_HELD),
  version: z.literal(1),
  reservationId: z.uuid(),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  traceContext: traceContextSchema.optional(),
});
export type BookingHeld = z.infer<typeof bookingHeldSchema>;
