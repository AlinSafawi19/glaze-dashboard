-- Two more editorial fields on a product, sitting under the description on the
-- storefront: who it is for, and what it does.
--
-- Both are nullable with no default, like every other copy field on this table:
-- the existing catalogue has nothing to say here yet, and an empty string would
-- render as a heading with a blank under it rather than as a hidden section.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "bestFor" VARCHAR(500);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "benefits" TEXT;
