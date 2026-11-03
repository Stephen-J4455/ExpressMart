import React from "react";
import { useLoaderData } from "expo-router";
import { PageShell, ProductGrid, Section } from "../src/web/SeoPage";
import { createPageMetadata, getPublicProducts } from "../src/web/seoData";

export function loader() {
  return getPublicProducts(24);
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Discover the Latest Products | ExpressMart Feed",
    description:
      "Explore recent products and discoveries from independent sellers on the ExpressMart feed.",
    path: "/feed",
  });
}

export default function FeedPage() {
  const products = useLoaderData();
  return (
    <PageShell
      title="Discover what's new"
      description="Find recent products and fresh discoveries shared by independent sellers."
      eyebrow="The ExpressMart feed"
    >
      <Section title="Recent finds">
        <ProductGrid products={products} />
      </Section>
    </PageShell>
  );
}
