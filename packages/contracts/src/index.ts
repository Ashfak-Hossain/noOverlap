/**
 * The wire contract between the API and the worker: the events they exchange and the queue they
 * exchange them on. Both sides compile against this package, so a change that breaks one of them
 * fails the build rather than production.
 *
 * Schemas rather than bare types, because types are erased at runtime. A queue message is untrusted
 * input by the time it reaches the consumer — it may have been enqueued by an older deployment, or
 * have sat in Redis across a release — so the consumer parses it instead of casting.
 */
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

/**
 * Event type. Doubles as the `outbox.type` column and the BullMQ job name, so a single name follows
 * the event from the transaction that emitted it to the handler that runs it.
 */
export const BOOKING_HELD = 'BookingHeld' as const;

/**
 * Emitted when a hold is placed. The worker consumes it and charges the card. `idempotencyKey`
 * makes a redelivered message safe: the same booking always yields the same key, so it can never
 * charge twice.
 *
 * @remarks Delivery is at-least-once, so the consumer must expect to see the same event more than
 * once and must be idempotent — the key is what makes that possible.
 */
export const bookingHeldSchema = z.object({
  type: z.literal(BOOKING_HELD),
  // A literal, not a plain number: a consumer that only understands v1 fails the parse outright on a
  // v2 message rather than silently misreading it. Evolving the shape means a new literal, and a
  // window where both versions are accepted while producer and consumer deploy independently.
  version: z.literal(1),
  reservationId: z.uuid(),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  traceContext: traceContextSchema.optional(),
});
export type BookingHeld = z.infer<typeof bookingHeldSchema>;

/** BullMQ queue the relay publishes charge jobs onto; the worker consumes it. */
export const CHARGE_QUEUE = 'booking.charge' as const;
