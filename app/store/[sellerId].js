import { useLoaderData } from "expo-router";
import { StorePageContent } from "../../src/web/MarketplacePages";
import {
  createPageMetadata,
  getPublicStore,
  publicImageUrl,
  storePath,
} from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicStore(String(params.sellerId || ""));
}

export async function generateMetadata(_request, params) {
  const store = await getPublicStore(String(params.sellerId || ""));
  const name = store?.name || "Independent Store";
  const description =
    store?.store_description ||
    `Discover products and learn more about ${name} on Tagit.`;

  return createPageMetadata({
    title: `${name} | Tagit`,
    description,
    path: store
      ? storePath(store)
      : `/store/${encodeURIComponent(String(params.sellerId || ""))}`,
    image: publicImageUrl(store?.cover_image || store?.avatar, "profile"),
    indexable: Boolean(store?.products?.length),
  });
}

export default function StorePage() {
  const store = useLoaderData();
  return <StorePageContent store={store} />;
}
