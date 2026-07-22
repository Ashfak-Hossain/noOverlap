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
import {
  RESERVATION_CHANGED,
  type ReservationChanged,
} from './realtime.js';

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

/**
 * The realtime contract is re-exported from a dependency-free module so the browser can import it
 * without pulling a schema validator into the bundle. See `./realtime` for why that split exists.
 */
export {
  RESERVATION_CHANGED,
  isReservationChanged,
  listingRoom,
  type ReservationChanged,
  type ReservationStatusName,
} from './realtime.js';

/**
 * The server's view of {@link ReservationChanged}.
 *
 * Annotated with the published interface rather than inferring a type from it: the schema and the
 * interface are two statements of one contract, and this is what makes a change to the schema that
 * the interface does not follow fail the build here instead of at a client that can no longer parse
 * what it is sent.
 */
export const reservationChangedSchema: z.ZodType<ReservationChanged> = z.object(
  {
    type: z.literal(RESERVATION_CHANGED),
    version: z.literal(1),
    listingId: z.uuid(),
    reservationId: z.uuid(),
    status: z.enum(['HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED']),
    /** Monotonic per listing. Compare against the last seen value to spot a missed event. */
    seq: z.number().int().positive(),
  },
);

/** BullMQ queue the relay publishes charge jobs onto; the worker consumes it. */
export const CHARGE_QUEUE = 'booking.charge' as const;

/** BullMQ queue the worker publishes payment results onto; the API consumes it. */
export const RESULT_QUEUE = 'booking.payment-result' as const;

export const PAYMENT_SUCCEEDED = 'PaymentSucceeded' as const;
export const PAYMENT_FAILED = 'PaymentFailed' as const;

/** The charge went through. `providerRef` is the provider's handle on it (stored for auditing). */
export const paymentSucceededSchema = z.object({
  type: z.literal(PAYMENT_SUCCEEDED),
  version: z.literal(1),
  reservationId: z.uuid(),
  idempotencyKey: z.string().min(1),
  amountCents: z.number().int().positive(),
  providerRef: z.string().min(1),
  traceContext: traceContextSchema.optional(),
});
export type PaymentSucceeded = z.infer<typeof paymentSucceededSchema>;

/** The charge was terminally declined — not a transient blip. The saga compensates (releases the hold). */
export const paymentFailedSchema = z.object({
  type: z.literal(PAYMENT_FAILED),
  version: z.literal(1),
  reservationId: z.uuid(),
  idempotencyKey: z.string().min(1),
  reason: z.string().min(1),
  traceContext: traceContextSchema.optional(),
});
export type PaymentFailed = z.infer<typeof paymentFailedSchema>;

/**
 * Either outcome, discriminated by `type` — the API's result consumer parses with this and switches
 * on the tag, so an unknown or malformed result is rejected rather than half-handled.
 */
export const paymentResultSchema = z.discriminatedUnion('type', [
  paymentSucceededSchema,
  paymentFailedSchema,
]);
export type PaymentResult = z.infer<typeof paymentResultSchema>;

/** Where charge jobs land after exhausting their retries — quarantined for inspection, not lost. */
export const CHARGE_DLQ = 'booking.charge.dlq' as const;

/** BullMQ queue the API publishes refund requests onto; the worker consumes it. */
export const REFUND_QUEUE = 'booking.refund' as const;

export const REFUND_REQUESTED = 'RefundRequested' as const;

/** Asks the worker to refund a settled charge — the compensation when a paid booking can't stand. */
export const refundRequestedSchema = z.object({
  type: z.literal(REFUND_REQUESTED),
  version: z.literal(1),
  reservationId: z.uuid(),
  idempotencyKey: z.string().min(1), // the original charge key — the refund settles against it
  traceContext: traceContextSchema.optional(),
});
export type RefundRequested = z.infer<typeof refundRequestedSchema>;
