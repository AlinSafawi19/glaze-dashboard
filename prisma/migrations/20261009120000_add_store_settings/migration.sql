-- Shop-wide settings, starting with the delivery fee, which moves here from the
-- DELIVERY_FEE environment variable so the owner can change it from Settings
-- and the storefront reads the same value the server charges.

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'store',
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- The single row, at the fee the environment variable defaulted to.
INSERT INTO "StoreSettings" ("id", "deliveryFee", "updatedAt") VALUES ('store', 4, CURRENT_TIMESTAMP);
