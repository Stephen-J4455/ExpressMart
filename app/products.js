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
  return getPublicProducts();
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Shop Products Online in Ghana | Tagit",
    description:
      "Browse products from independent sellers across Ghana, from everyday essentials to unique local finds on Tagit.",
    path: "/products",
  });
}

export default function ProductsPage() {
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
        title="Shop products from independent stores"
        description="Explore products from local and independent sellers across Ghana on Tagit."
        eyebrow="The marketplace"
      >
        <Section title="Featured products">
          <ProductGrid products={products} />
        </Section>
      </PageShell>
    </>
  );
}
