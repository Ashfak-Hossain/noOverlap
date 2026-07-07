-- This is an empty migration.-- Enable equality operators inside GiST indexes (so listing_id = can combine with range &&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- No-overlap guarantee enforced by the database itself (ADR-0003). The constraint indexes an
-- EXPRESSION over the typed endpoints -- no separate range column. '[)' = inclusive check-in,
-- exclusive check-out (same-day turnover does NOT overlap). EXPIRED/CANCELLED rows do not block.
ALTER TABLE "reservations"
  ADD CONSTRAINT "no_overlapping_active_reservations"
  EXCLUDE USING gist (
    "listing_id" WITH =,
    tstzrange("check_in", "check_out", '[)') WITH &&
  )
  WHERE (status IN ('HELD', 'CONFIRMED'));
