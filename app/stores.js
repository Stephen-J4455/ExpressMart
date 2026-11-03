import React from "react";
import { useLoaderData } from "expo-router";
import { PageShell, Section, StoreLinks } from "../src/web/SeoPage";
import { createPageMetadata, getPublicStores } from "../src/web/seoData";

export function loader() {
  return getPublicStores();
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Discover Independent Stores | ExpressMart",
    description:
      "Find independent stores, browse their products, and connect with sellers on ExpressMart.",
    path: "/stores",
  });
}

export default function StoresPage() {
  const stores = useLoaderData();
  return (
    <PageShell
      title="Discover independent stores"
      description="Meet the people behind the products and shop directly from businesses on ExpressMart."
      eyebrow="Our sellers"
    >
      <Section title="Explore stores">
        <StoreLinks stores={stores} />
      </Section>
    </PageShell>
  );
}
