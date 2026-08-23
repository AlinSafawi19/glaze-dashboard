-- Stock tracking.
--
-- `stock` is deliberately nullable with no default: null means "not tracked",
-- so every product that exists today carries on selling exactly as before and
-- the shop opts each one in by typing a number. A `DEFAULT 0` here would have
-- marked the entire catalogue sold out the moment this ran.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "stock" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "stockTaken" BOOLEAN NOT NULL DEFAULT false;
