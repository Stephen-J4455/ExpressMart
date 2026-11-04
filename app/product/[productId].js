import { useLoaderData } from "expo-router";
import { ProductPageContent } from "../../src/web/MarketplacePages";
import {
  createPageMetadata,
  getPublicProduct,
  publicImageUrl,
  productPath,
} from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicProduct(String(params.productId || ""));
}

export async function generateMetadata(_request, params) {
  const product = await getPublicProduct(String(params.productId || ""));
  const name = product?.title || "Product";
  const description =
    product?.description ||
    `Discover ${name} from an independent seller on Tagit in Ghana.`;
  const image = publicImageUrl(
    product?.thumbnail || product?.thumbnails?.[0],
  );

  return createPageMetadata({
    title: `${name} | Tagit`,
    description,
    path: product
      ? productPath(product)
      : `/product/${encodeURIComponent(String(params.productId || ""))}`,
    image,
    type: "product",
    indexable: Boolean(product),
  });
}

export default function ProductPage() {
  const product = useLoaderData();
  return <ProductPageContent product={product} />;
}
