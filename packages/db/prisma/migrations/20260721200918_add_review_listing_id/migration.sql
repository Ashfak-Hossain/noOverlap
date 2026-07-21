-- Carry the listing onto the review itself, so reviews and their average can be read with one
-- indexed query instead of a join through the reservations table.
--
-- Added nullable, backfilled from the reservation each review already points at, and only then made
-- NOT NULL. Adding it NOT NULL in one step would fail against any table that already holds rows,
-- which is the difference between a migration that works on an empty development database and one
-- that works in production.

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "listing_id" UUID;

-- Backfill: every existing review inherits the listing of the stay it reviewed.
UPDATE "reviews" AS r
SET "listing_id" = res."listing_id"
FROM "reservations" AS res
WHERE res."id" = r."reservation_id";

ALTER TABLE "reviews" ALTER COLUMN "listing_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "reviews_listing_id_idx" ON "reviews"("listing_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
