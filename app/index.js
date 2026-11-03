import React from "react";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "ExpressMart | Discover independent stores and products",
    description:
      "Shop products from independent stores, explore new finds, and connect with sellers on ExpressMart.",
    path: "/",
  });
}

export default function HomePage() {
  return (
    <PageShell
      title="Discover something different on ExpressMart"
      description="Shop products from independent stores, find new favourites, and connect directly with the people behind every business."
      eyebrow="A marketplace made for discovery"
    >
      <Section title="Shop independent">
        <TextLink href="/products">Browse products</TextLink>
        <TextLink href="/stores">Explore stores</TextLink>
      </Section>
      <Section title="More to explore">
        <TextLink href="/feed">Discover the latest</TextLink>
        <TextLink href="/storefront">Visit the ExpressMart storefront</TextLink>
        <TextLink href="/ai">Get help finding a product</TextLink>
      </Section>
    </PageShell>
  );
}
