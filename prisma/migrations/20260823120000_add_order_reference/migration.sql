-- Order references: what the shopper is given, in place of the sequential
-- number. Added in three steps so existing orders survive the change.

-- 1. Nullable to begin with, because every existing row needs a value first.
ALTER TABLE "Order" ADD COLUMN "reference" VARCHAR(20);

-- 2. Backfill. The alphabet matches src/lib/order-reference.ts: 32 characters
--    with no 0/O or 1/I, so a reference read down the phone survives the trip.
--    `gen_random_uuid()` seeds the randomness (pgcrypto ships with Postgres 13+
--    as a built-in), and the loop retries until the value is unique.
DO $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  row_id   TEXT;
  candidate TEXT;
  i        INT;
BEGIN
  FOR row_id IN SELECT "id" FROM "Order" WHERE "reference" IS NULL LOOP
    LOOP
      candidate := 'GLZ-';
      FOR i IN 1..8 LOOP
        IF i = 5 THEN candidate := candidate || '-'; END IF;
        candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Order" WHERE "reference" = candidate);
    END LOOP;
    UPDATE "Order" SET "reference" = candidate WHERE "id" = row_id;
  END LOOP;
END $$;

-- 3. Now that every row has one, make it required and unique.
ALTER TABLE "Order" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");
