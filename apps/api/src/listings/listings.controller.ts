import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@no-overlap/db';
import { Auth } from '../identity/decorators/auth.decorator';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import type { AuthUser } from '../identity/types/jwt-payload';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingResponseDto } from './dto/listing-response.dto';

/**
 * HTTP boundary for listings. Every mutation is host-only (`@Auth(Role.HOST)`) AND owner-scoped: the
 * owning `hostId` is taken from the token (`@CurrentUser`), never the request body, and
 * {@link ListingsService} rejects edits to another host's listing. Handlers stay thin — validation,
 * authorization, and error shaping happen in the DTOs, guards, and the global filter.
 */
@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post()
  @Auth(Role.HOST)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a listing (host-only)' })
  @ApiCreatedResponse({ type: ListingResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateListingDto,
  ): Promise<ListingResponseDto> {
    return this.listings.create(user.userId, dto);
  }

  @Patch(':id')
  @Auth(Role.HOST)
  @ApiOperation({ summary: 'Update a listing (host-only, owner)' })
  @ApiOkResponse({ type: ListingResponseDto })
  @ApiForbiddenResponse({ description: 'Not the owner of this listing.' })
  @ApiNotFoundResponse({ description: 'Listing not found.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ): Promise<ListingResponseDto> {
    return this.listings.update(user.userId, id, dto);
  }

  @Delete(':id')
  @Auth(Role.HOST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a listing (host-only, owner)' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiForbiddenResponse({ description: 'Not the owner of this listing.' })
  @ApiNotFoundResponse({ description: 'Listing not found.' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.listings.remove(user.userId, id);
  }
}
