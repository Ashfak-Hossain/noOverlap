import {
  PAYMENT_FAILED,
  PAYMENT_SUCCEEDED,
  type BookingHeld,
  type PaymentResult,
} from '@no-overlap/contracts';
import { Injectable } from '@nestjs/common';
import { PaymentStatus, type Payment } from '@no-overlap/db';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from './mock-payment.provider';
import { isUniqueViolation } from './unique-violation';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: MockPaymentProvider,
  ) {}

  /**
   * Charges a booking exactly once, however many times its message is delivered.
   *
   * Two layers are needed, and neither alone is sufficient:
   * - `payments.idempotency_key` is UNIQUE, so a redelivery cannot open a second payment, and an
   *   already-settled one is replayed rather than re-charged.
   * - The same key is handed to the provider, so a crash *between* charging and recording the result
   *   still cannot take the money twice — the provider recognises the key and returns the first
   *   charge. The row is our record of the charge; the provider's key is what protects the money.
   *
   * @throws TransientPaymentError from the provider, so the job retries rather than compensating.
   */
  async charge(event: BookingHeld): Promise<PaymentResult> {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: event.idempotencyKey },
    });

    // Settled by an earlier delivery — replay its outcome and charge nothing.
    if (existing && existing.status !== PaymentStatus.PENDING) {
      return this.toResult(event, existing);
    }

    if (!existing) {
      // Claim it. If a concurrent delivery claimed it first, the unique index rejects this insert and
      // that is fine — the same insert-and-let-the-database-reject move as the no-overlap constraint.
      try {
        await this.prisma.payment.create({
          data: {
            reservationId: event.reservationId,
            idempotencyKey: event.idempotencyKey,
            amountCents: event.amountCents,
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }

    const outcome = await this.provider.charge(
      event.idempotencyKey,
      event.amountCents,
    );

    const payment = await this.prisma.payment.update({
      where: { idempotencyKey: event.idempotencyKey },
      data:
        outcome.status === 'succeeded'
          ? {
              status: PaymentStatus.SUCCEEDED,
              providerRef: outcome.providerRef,
            }
          : { status: PaymentStatus.FAILED, failureReason: outcome.reason },
    });

    return this.toResult(event, payment);
  }

  /**
   * Builds the result from the persisted payment, so a first charge and a redelivered one emit an
   * identical message.
   */
  private toResult(event: BookingHeld, payment: Payment): PaymentResult {
    if (payment.status === PaymentStatus.SUCCEEDED) {
      if (!payment.providerRef) {
        throw new Error(
          `Payment ${payment.id} is SUCCEEDED with no provider reference`,
        );
      }
      return {
        type: PAYMENT_SUCCEEDED,
        version: 1,
        reservationId: event.reservationId,
        idempotencyKey: event.idempotencyKey,
        amountCents: payment.amountCents,
        providerRef: payment.providerRef,
      };
    }

    return {
      type: PAYMENT_FAILED,
      version: 1,
      reservationId: event.reservationId,
      idempotencyKey: event.idempotencyKey,
      reason: payment.failureReason ?? 'Card declined',
    };
  }
}
