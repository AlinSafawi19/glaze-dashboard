import type { Metadata } from "next";

import { EMPTY_PRODUCT, ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { createProduct } from "@/lib/actions/products";
import { loadProductOptions } from "@/lib/product-queries";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const options = await loadProductOptions();

  return (
    <>
      <PageHeader
        title="New product"
        subtitle="It goes live on the storefront as soon as you save."
      />
      <ProductForm
        action={createProduct}
        values={EMPTY_PRODUCT}
        submitLabel="Create product"
        {...options}
      />
    </>
  );
}
