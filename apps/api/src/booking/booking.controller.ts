import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@no-overlap/db';
import { Auth } from 'src/identity/decorators/auth.decorator';
import { CurrentUser } from 'src/identity/decorators/current-user.decorator';
import type { AuthUser } from 'src/identity/types/jwt-payload';
import { BookingService } from './booking.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';

/**
 * HTTP boundary for reservations. Every route requires an authenticated user; the acting `guestId`
 * comes from the token (`@CurrentUser`), never the request body, and reads are scoped to the caller so
 * one guest cannot see another's reservations. Handlers stay thin — validation and error shaping live
 * in the DTOs and the global filter.
 *
 * Route order matters: the static `mine` path is declared before the dynamic `:id` so the UUID param
 * pipe does not capture and reject it.
 */
@ApiTags('reservations')
@Controller('reservations')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Post()
  @Auth() // any authenticated user
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a hold on a date range' })
  @ApiCreatedResponse({ type: ReservationResponseDto })
  @ApiConflictResponse({
    description: 'The slot was just taken (RESERVATION_SLOT_TAKEN).',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    return this.booking.hold(user.userId, dto);
  }

  @Get('mine')
  @Auth()
  @ApiOkResponse({ type: ReservationResponseDto, isArray: true })
  listMine(@CurrentUser() user: AuthUser): Promise<ReservationResponseDto[]> {
    return this.booking.listOwnedBy(user.userId);
  }

  // Declared before `:id` for the same reason as `mine`: otherwise the UUID pipe captures the literal
  // path segment and rejects it.
  @Get('received')
  @Auth(Role.HOST)
  @ApiOperation({
    summary: 'Reservations made against the host’s own listings',
  })
  @ApiOkResponse({ type: ReservationResponseDto, isArray: true })
  listReceived(
    @CurrentUser() user: AuthUser,
  ): Promise<ReservationResponseDto[]> {
    return this.booking.listReceivedBy(user.userId);
  }

  @Get(':id')
  @Auth()
  @ApiOkResponse({ type: ReservationResponseDto })
  @ApiNotFoundResponse({ description: 'Not found (or not yours).' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReservationResponseDto> {
    return this.booking.getOwned(user.userId, id);
  }

  // No manual confirm endpoint: a reservation is confirmed only by a successful payment flowing back
  // through the saga (PaymentSucceeded -> CONFIRMED). A guest-triggered confirm would bypass payment.
  @Post(':id/cancel')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReservationResponseDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReservationResponseDto> {
    return this.booking.cancel(user.userId, id);
  }
}
