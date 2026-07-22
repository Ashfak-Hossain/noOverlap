-- Stop a listing from being deleted while reservations point at it.
--
-- The cascade this replaces meant deleting a listing silently deleted every booking made on it, along
-- with the payments and reviews hanging off those bookings. A host removing a property they no longer
-- rent would have erased a guest's paid stay with no warning and no record. Enforced here rather than
-- in application code so it holds for any caller, including one going straight at the API.
--
-- Withdrawing a listing from sale is a different operation: `listings.active` already does it, and
-- search already respects it.

-- DropForeignKey
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_listing_id_fkey";

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
