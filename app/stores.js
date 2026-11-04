import React from "react";
import { useLoaderData } from "expo-router";
import { JsonLd, PageShell, Section, StoreLinks } from "../src/web/SeoPage";
import {
  createPageMetadata,
  getItemListStructuredData,
  getPublicStores,
  storePath,
} from "../src/web/seoData";

export function loader() {
  return getPublicStores();
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Stores in Ghana | Shop Independent Sellers on Tagit",
    description:
      "Discover stores in Ghana, browse their products, and connect with independent sellers on Tagit.",
    path: "/stores",
  });
}

export default function StoresPage() {
  const stores = useLoaderData();
  return (
    <>
      <JsonLd
        data={getItemListStructuredData(
          stores,
          (store) => store.name,
          storePath,
        )}
      />
      <PageShell
        title="Discover independent stores"
        description="Meet the people behind the products and shop directly from businesses across Ghana on Tagit."
        eyebrow="Our sellers"
      >
        <Section title="Explore stores">
          <StoreLinks stores={stores} />
        </Section>
      </PageShell>
    </>
  );
}
