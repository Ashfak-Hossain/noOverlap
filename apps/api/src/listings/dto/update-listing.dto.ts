import { PartialType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';

/** PATCH semantics: every field optional. `PartialType` carries over the validators + Swagger docs. */
export class UpdateListingDto extends PartialType(CreateListingDto) {}
