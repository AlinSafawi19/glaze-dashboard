import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { updateProduct } from "@/lib/actions/products";
import { loadProduct, loadProductOptions } from "@/lib/product-queries";
import { CopyableText } from "@/components/text";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, options] = await Promise.all([loadProduct(id), loadProductOptions()]);

  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={product.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CopyableText value={`/products/${product.slug}`} label="storefront path" />
            {product.sku && (
              <CopyableText
                value={`SKU ${product.sku}`}
                copyValue={product.sku}
                label="SKU"
              />
            )}
          </span>
        }
      />
      <ProductForm
        action={updateProduct.bind(null, id)}
        values={product}
        submitLabel="Save changes"
        {...options}
      />
    </>
  );
}
