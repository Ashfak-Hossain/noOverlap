import { PrismaClient, ReservationStatus, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The headline Phase 1 proof: overlapping active reservations on one listing are rejected by the
 * database itself — the GiST exclusion constraint (ADR-0003), not application code. It runs directly
 * against Prisma because there is no reservation endpoint yet; the invariant is tested at the only
 * layer that enforces it. Phase 2 escalates this to a concurrent 10k-request storm.
 */
describe('reservations: no-overlap exclusion constraint', () => {
  let prisma: PrismaClient;
  let listingId: string;
  let guestId: string;

  const reservation = (
    checkIn: string,
    checkOut: string,
    status: ReservationStatus = ReservationStatus.HELD,
  ) => ({
    listingId,
    guestId,
    checkIn: new Date(checkIn),
    checkOut: new Date(checkOut),
    status,
    priceTotalCents: 5000,
    holdExpiresAt: new Date('2027-01-01T00:00:00Z'),
  });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });

    const host = await prisma.user.create({
      data: {
        email: `host-${Date.now()}@example.com`,
        passwordHash: 'x',
        role: Role.HOST,
      },
    });
    const guest = await prisma.user.create({
      data: {
        email: `guest-${Date.now()}@example.com`,
        passwordHash: 'x',
        role: Role.GUEST,
      },
    });
    guestId = guest.id;

    const listing = await prisma.listing.create({
      data: {
        hostId: host.id,
        title: 'Test',
        city: 'Berlin',
        nightlyPriceCents: 1000,
        maxGuests: 2,
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a second overlapping HELD reservation', async () => {
    await prisma.reservation.create({
      data: reservation('2026-09-01', '2026-09-05'),
    });
    await expect(
      prisma.reservation.create({
        data: reservation('2026-09-03', '2026-09-07'),
      }),
    ).rejects.toThrow();
  });

  it('allows same-day turnover (checkout == next check-in is not an overlap)', async () => {
    await prisma.reservation.create({
      data: reservation('2026-11-01', '2026-11-05'),
    });
    await expect(
      prisma.reservation.create({
        data: reservation('2026-11-05', '2026-11-08'),
      }),
    ).resolves.toBeDefined();
  });

  it('ignores CANCELLED reservations (the constraint WHERE excludes them)', async () => {
    await prisma.reservation.create({
      data: reservation(
        '2026-10-01',
        '2026-10-05',
        ReservationStatus.CANCELLED,
      ),
    });
    await expect(
      prisma.reservation.create({
        data: reservation('2026-10-02', '2026-10-06'),
      }),
    ).resolves.toBeDefined();
  });
});
