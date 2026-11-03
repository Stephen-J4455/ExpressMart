import React from "react";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "ExpressMart Shopping Assistant | Find Products with AI",
    description:
      "Get help discovering products and independent sellers with the ExpressMart shopping assistant.",
    path: "/ai",
  });
}

export default function ShoppingAssistantPage() {
  return (
    <PageShell
      title="Find the right product with a little help"
      description="Explore ExpressMart products and independent sellers, or open the app to chat with the shopping assistant."
      eyebrow="ExpressMart shopping assistant"
    >
      <Section title="Explore the marketplace">
        <TextLink href="/products">Browse products</TextLink>
        <TextLink href="/stores">Discover stores</TextLink>
      </Section>
    </PageShell>
  );
}
