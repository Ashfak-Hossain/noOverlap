-- GiST indexes cannot test plain equality on their own. btree_gist teaches them to, which is what
-- lets a single constraint combine "same listing" (=) with "overlapping dates" (&&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The no-overlap guarantee, enforced by the database rather than by application code. A read-then-
-- write check in the app would leave a window between the read and the insert for a concurrent
-- booking to slip through; the constraint has no such window, so N racing callers always resolve to
-- exactly one winner and the losers get a rejection they must handle.
--
-- Indexes an EXPRESSION over the typed endpoints, so there is no range column on the table. The '[)'
-- bounds are half-open -- inclusive check-in, exclusive check-out -- which makes same-day turnover
-- legal: one guest checks out at the instant the next checks in. The WHERE clause scopes the
-- constraint to live bookings, so EXPIRED and CANCELLED rows stop blocking their slot.
ALTER TABLE "reservations"
  ADD CONSTRAINT "no_overlapping_active_reservations"
  EXCLUDE USING gist (
    "listing_id" WITH =,
    tstzrange("check_in", "check_out", '[)') WITH &&
  )
  WHERE (status IN ('HELD', 'CONFIRMED'));
