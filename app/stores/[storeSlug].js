import React from "react";
import { useLoaderData } from "expo-router";
import { StorePageContent } from "../../src/web/MarketplacePages";
import {
  createPageMetadata,
  getPublicStore,
  publicImageUrl,
  storePath,
} from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicStore(String(params.storeSlug || ""));
}

export async function generateMetadata(_request, params) {
  const store = await getPublicStore(String(params.storeSlug || ""));
  const title = store?.name || "Store not found";
  return createPageMetadata({
    title: store ? `${title} | Tagit` : "Store not found | Tagit",
    description:
      store?.store_description ||
      `Discover products and learn more about ${title} on Tagit.`,
    path: store
      ? storePath(store)
      : `/stores/${encodeURIComponent(String(params.storeSlug || ""))}`,
    image: publicImageUrl(
      store?.cover_image || store?.avatar,
      "profile",
    ),
    indexable: Boolean(store?.products?.length),
  });
}

export default function StoreSlugPage() {
  return <StorePageContent store={useLoaderData()} />;
}
