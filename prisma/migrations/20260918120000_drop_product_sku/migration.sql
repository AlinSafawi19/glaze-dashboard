-- Products no longer carry a SKU.
--
-- The codes came across in the Canopy import and were re-issued by the
-- dashboard from then on, but nothing reads them any more: the storefront does
-- not print one, the product list searches title and slug, and the import
-- sheet never offered the column. Dropping the column is catalogue-only work —
-- there was no index or constraint on it.

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "sku";
