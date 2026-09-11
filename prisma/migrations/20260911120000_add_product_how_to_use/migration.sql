-- One more editorial field on a product, sitting under "Benefits" on the
-- storefront: how to apply it.
--
-- Nullable with no default, like the copy fields beside it: the existing
-- catalogue has no directions written yet, and an empty string would render as
-- a heading with a blank under it rather than as a hidden section.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "howToUse" TEXT;
