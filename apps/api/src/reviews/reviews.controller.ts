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
import { Auth } from 'src/identity/decorators/auth.decorator';
import { CurrentUser } from 'src/identity/decorators/current-user.decorator';
import type { AuthUser } from 'src/identity/types/jwt-payload';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListingReviewsDto } from './dto/listing-reviews.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

/**
 * HTTP boundary for reviews. The author is taken from the token, never the body — a guest id in the
 * request would let anyone write a review under someone else's name.
 */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @Auth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Review a stay you have completed' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiNotFoundResponse({ description: 'No such reservation (or not yours).' })
  @ApiConflictResponse({
    description:
      'The stay has not finished (REVIEW_STAY_NOT_FINISHED), or it was already reviewed (REVIEW_ALREADY_EXISTS).',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviews.create(user.userId, dto);
  }
}

/**
 * A listing's reviews, read from the listing's own URL because that is where a client asking "what do
 * people say about this place" arrives.
 *
 * Deliberately public: reviews are what a guest reads while deciding whether to book, so requiring an
 * account to see them would hide the thing that helps most before sign-up.
 */
@ApiTags('reviews')
@Controller('listings/:listingId/reviews')
export class ListingReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Reviews and average rating for a listing' })
  @ApiOkResponse({ type: ListingReviewsDto })
  forListing(
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ): Promise<ListingReviewsDto> {
    return this.reviews.forListing(listingId);
  }
}
