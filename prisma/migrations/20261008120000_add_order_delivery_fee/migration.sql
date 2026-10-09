-- Orders carry the delivery fee they were charged.
--
-- `total` stays what the courier collects, so it now includes the fee; this
-- column is what lets an order be read back as lines + delivery. Orders placed
-- before the fee existed were charged nothing for delivery, hence the default.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0;
