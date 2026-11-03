import React from "react";
import { useLoaderData } from "expo-router";
import {
  PageShell,
  ProductGrid,
  Section,
  TextLink,
} from "../../src/web/SeoPage";
import { createPageMetadata, getPublicStore } from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicStore(String(params.sellerId || ""));
}

export async function generateMetadata(_request, params) {
  const store = await getPublicStore(String(params.sellerId || ""));
  const name = store?.name || "Independent Store";
  const description =
    store?.store_description ||
    `Discover products and learn more about ${name} on ExpressMart.`;

  return createPageMetadata({
    title: `${name} | ExpressMart`,
    description,
    path: `/store/${encodeURIComponent(String(params.sellerId || ""))}`,
    image: store?.cover_image,
  });
}

export default function StorePage() {
  const store = useLoaderData();

  if (!store) {
    return (
      <PageShell
        title="Store not found"
        description="This store may be unavailable. Explore other independent sellers on ExpressMart."
      />
    );
  }

  return (
    <PageShell
      title={store.name}
      description={
        store.store_description ||
        `Browse products from ${store.name}, an independent ExpressMart seller.`
      }
      eyebrow="Independent store"
    >
      <Section title={`Products from ${store.name}`}>
        <ProductGrid products={store.products} />
      </Section>
      <Section title="More stores">
        <TextLink href="/stores">Explore all stores</TextLink>
      </Section>
    </PageShell>
  );
}
