-- Handing the box to the courier is where the shop's part ends, so "Delivered"
-- is no longer a step it records. Any order already sitting in it becomes
-- Shipped, which is now the finish line.
--
-- Postgres cannot drop a value from an enum in place, so the type is rebuilt
-- and the column moved across.

UPDATE "Order" SET "status" = 'Shipped' WHERE "status" = 'Delivered';

ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM ('Pending', 'Confirmed', 'Shipped', 'Cancelled');

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::text::"OrderStatus");
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'Pending';

DROP TYPE "OrderStatus_old";
