import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingResponseDto } from './dto/listing-response.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a listing owned by the calling host. `hostId` comes from the token, never the body. */
  create(hostId: string, dto: CreateListingDto): Promise<ListingResponseDto> {
    return this.prisma.listing.create({ data: { ...dto, hostId } });
  }

  /** Public browse: only active listings, newest first, optionally narrowed to one city. */
  listActive(city?: string): Promise<ListingResponseDto[]> {
    return this.prisma.listing.findMany({
      where: { active: true, ...(city ? { city } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Every listing owned by a host, active or not — their management view. */
  listOwnedBy(hostId: string): Promise<ListingResponseDto[]> {
    return this.prisma.listing.findMany({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * A single listing by id.
   * @throws AppException `NOT_FOUND` when no listing has that id.
   */
  async getById(id: string): Promise<ListingResponseDto> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new AppException('NOT_FOUND');
    }
    return listing;
  }

  /**
   * Updates the caller's own listing.
   * @throws AppException `NOT_FOUND` / `FORBIDDEN` — see {@link assertOwner}.
   */
  async update(
    hostId: string,
    id: string,
    dto: UpdateListingDto,
  ): Promise<ListingResponseDto> {
    await this.assertOwner(id, hostId);
    return this.prisma.listing.update({ where: { id }, data: dto });
  }

  /**
   * Deletes the caller's own listing.
   * @throws AppException `NOT_FOUND` / `FORBIDDEN` — see {@link assertOwner}.
   */
  async remove(hostId: string, id: string): Promise<void> {
    await this.assertOwner(id, hostId);
    await this.prisma.listing.delete({ where: { id } });
  }

  /**
   * Adds an availability window to the caller's own listing.
   *
   * @throws AppException `NOT_FOUND` / `FORBIDDEN` when the listing is unknown or another host's.
   * @throws AppException `VALIDATION_FAILED` when the range is empty or inverted.
   */
  async addAvailability(
    hostId: string,
    listingId: string,
    dto: CreateAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    await this.assertOwner(listingId, hostId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    // A window must cover real time — the half-open interval [startsAt, endsAt) requires start < end.
    if (startsAt >= endsAt) {
      throw new AppException(
        'VALIDATION_FAILED',
        'startsAt must be before endsAt.',
      );
    }

    return this.prisma.availabilityBlock.create({
      data: { listingId, startsAt, endsAt, kind: dto.kind },
    });
  }

  /**
   * Availability windows for a listing, earliest first (public read).
   * @throws AppException `NOT_FOUND` when the listing does not exist.
   */
  async listAvailability(
    listingId: string,
  ): Promise<AvailabilityResponseDto[]> {
    await this.getById(listingId); // surface 404 for an unknown listing before querying its blocks
    return this.prisma.availabilityBlock.findMany({
      where: { listingId },
      orderBy: { startsAt: 'asc' },
    });
  }

  /**
   * Removes an availability window from the caller's own listing.
   *
   * The delete is scoped to `{ id, listingId }` so a valid block id from a *different* listing can
   * never be removed through this listing's owner.
   *
   * @throws AppException `NOT_FOUND` / `FORBIDDEN` for the listing; `NOT_FOUND` for the block.
   */
  async removeAvailability(
    hostId: string,
    listingId: string,
    blockId: string,
  ): Promise<void> {
    await this.assertOwner(listingId, hostId);
    const { count } = await this.prisma.availabilityBlock.deleteMany({
      where: { id: blockId, listingId },
    });
    if (count === 0) throw new AppException('NOT_FOUND');
  }

  /**
   * Ownership scoping: role alone (`@Roles(HOST)`) says "a host", but a host may act only on their
   * OWN listings. This instance-level check is the defense for OWASP A01 (Broken Access Control).
   *
   * @throws AppException `NOT_FOUND` when the listing does not exist.
   * @throws AppException `FORBIDDEN` when it exists but belongs to another host.
   */
  private async assertOwner(id: string, hostId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { hostId: true },
    });
    if (!listing) {
      throw new AppException('NOT_FOUND');
    }
    if (listing.hostId !== hostId) {
      throw new AppException('FORBIDDEN');
    }
  }
}
