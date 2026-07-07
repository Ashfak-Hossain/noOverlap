-- Enable equality operators inside GiST indexes (needed to combine listing_id = with range &&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- DB-generated range derived from the typed endpoints. '[)' = inclusive check-in, exclusive
-- check-out (a stay ending the same day another begins does NOT overlap).
ALTER TABLE "reservations"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("check_in", "check_out", '[)')) STORED;

-- The heart of the project: the database itself makes overlapping active reservations impossible.
-- Two concurrent inserts for overlapping ranges on the same listing -> exactly one commits, the
-- other is rejected with a constraint violation. EXPIRED/CANCELLED rows don't block (the WHERE).
ALTER TABLE "reservations"
  ADD CONSTRAINT "no_overlapping_active_reservations"
  EXCLUDE USING gist (
    "listing_id" WITH =,
    "during"     WITH &&
  )
  WHERE (status IN ('HELD', 'CONFIRMED'));
