import React from "react";
import { useLoaderData } from "expo-router";
import { JsonLd, PageShell, ProductGrid, Section } from "../src/web/SeoPage";
import {
  createPageMetadata,
  getItemListStructuredData,
  getPublicProducts,
  productPath,
} from "../src/web/seoData";

export function loader() {
  return getPublicProducts(24);
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Latest Products from Ghanaian Sellers | Tagit",
    description:
      "Explore recent products and discoveries from independent sellers across Ghana on Tagit.",
    path: "/feed",
    indexable: false,
  });
}

export default function FeedPage() {
  const products = useLoaderData();
  return (
    <>
      <JsonLd
        data={getItemListStructuredData(
          products,
          (product) => product.title,
          productPath,
        )}
      />
      <PageShell
        title="Discover what's new"
        description="Find recent products and fresh discoveries shared by independent sellers across Ghana."
        eyebrow="The Tagit feed"
      >
        <Section title="Recent finds">
          <ProductGrid products={products} />
        </Section>
      </PageShell>
    </>
  );
}
