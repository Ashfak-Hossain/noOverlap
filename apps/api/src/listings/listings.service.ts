import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingResponseDto } from './dto/listing-response.dto';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a listing owned by the calling host. `hostId` comes from the token, never the body. */
  create(hostId: string, dto: CreateListingDto): Promise<ListingResponseDto> {
    return this.prisma.listing.create({ data: { ...dto, hostId } });
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
    return this.prisma.listing.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Deletes the caller's own listing.
   * @throws AppException `NOT_FOUND` / `FORBIDDEN` — see {@link assertOwner}.
   */
  async remove(hostId: string, id: string): Promise<void> {
    await this.assertOwner(id, hostId);
    await this.prisma.listing.delete({
      where: { id },
    });
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
