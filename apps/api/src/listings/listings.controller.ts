import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';

/**
 * HTTP boundary for listings. Mutations are host-only (`@Auth(Role.HOST)`) AND owner-scoped: the
 * owning `hostId` comes from the token (`@CurrentUser`), never the request body, and
 * {@link ListingsService} rejects acting on another host's listing. Reads of active listings are
 * public. Handlers stay thin — validation, authorization, and error shaping live in the DTOs,
 * guards, and the global filter.
 *
 * Route order matters: the static `mine` path is declared before the dynamic `:id` so the UUID param
 * pipe does not capture and reject it.
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

  @Get()
  @ApiOperation({ summary: 'Browse active listings (public)' })
  @ApiQuery({ name: 'city', required: false })
  @ApiOkResponse({ type: ListingResponseDto, isArray: true })
  listActive(@Query('city') city?: string): Promise<ListingResponseDto[]> {
    return this.listings.listActive(city);
  }

  @Get('mine')
  @Auth(Role.HOST)
  @ApiOperation({ summary: 'The host’s own listings (host-only)' })
  @ApiOkResponse({ type: ListingResponseDto, isArray: true })
  listMine(@CurrentUser() user: AuthUser): Promise<ListingResponseDto[]> {
    return this.listings.listOwnedBy(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a listing by id (public)' })
  @ApiOkResponse({ type: ListingResponseDto })
  @ApiNotFoundResponse({ description: 'Listing not found.' })
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<ListingResponseDto> {
    return this.listings.getById(id);
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

  @Post(':id/availability')
  @Auth(Role.HOST)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an availability window (host-only, owner)' })
  @ApiCreatedResponse({ type: AvailabilityResponseDto })
  @ApiForbiddenResponse({ description: 'Not the owner of this listing.' })
  @ApiNotFoundResponse({ description: 'Listing not found.' })
  addAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    return this.listings.addAvailability(user.userId, id, dto);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'List availability for a listing (public)' })
  @ApiOkResponse({ type: AvailabilityResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Listing not found.' })
  listAvailability(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AvailabilityResponseDto[]> {
    return this.listings.listAvailability(id);
  }

  @Delete(':id/availability/:blockId')
  @Auth(Role.HOST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an availability window (host-only, owner)' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiForbiddenResponse({ description: 'Not the owner of this listing.' })
  @ApiNotFoundResponse({ description: 'Listing or block not found.' })
  removeAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<void> {
    return this.listings.removeAvailability(user.userId, id, blockId);
  }
}
