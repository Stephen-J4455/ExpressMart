import React from "react";
import { useLoaderData } from "expo-router";
import { PageShell, ProductGrid, Section } from "../src/web/SeoPage";
import { createPageMetadata, getPublicProducts } from "../src/web/seoData";

export function loader() {
  return getPublicProducts();
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Shop Products from Independent Stores | ExpressMart",
    description:
      "Browse products from independent sellers on ExpressMart, from everyday essentials to unique local finds.",
    path: "/products",
  });
}

export default function ProductsPage() {
  const products = useLoaderData();
  return (
    <PageShell
      title="Shop products from independent stores"
      description="Explore products from local and independent sellers across ExpressMart."
      eyebrow="The marketplace"
    >
      <Section title="Featured products">
        <ProductGrid products={products} />
      </Section>
    </PageShell>
  );
}
