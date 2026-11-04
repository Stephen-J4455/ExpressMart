import React from "react";
import { useLoaderData } from "expo-router";
import { ProductPageContent } from "../../src/web/MarketplacePages";
import {
  createPageMetadata,
  getPublicProduct,
  productPath,
  publicImageUrl,
} from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicProduct(String(params.productSlug || ""));
}

export async function generateMetadata(_request, params) {
  const product = await getPublicProduct(String(params.productSlug || ""));
  const title = product?.title || "Product not found";
  return createPageMetadata({
    title: product ? `${title} | Tagit` : "Product not found | Tagit",
    description:
      product?.description ||
      `Discover ${title} from an independent seller on Tagit in Ghana.`,
    path: product
      ? productPath(product)
      : `/products/${encodeURIComponent(String(params.productSlug || ""))}`,
    image: publicImageUrl(product?.thumbnail || product?.thumbnails?.[0]),
    type: "product",
    indexable: Boolean(product),
  });
}

export default function ProductSlugPage() {
  return <ProductPageContent product={useLoaderData()} />;
}
