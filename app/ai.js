import React from "react";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Tagit Shopping Assistant | Find Products",
    description:
      "Get help discovering products and independent sellers across Ghana with the Tagit shopping assistant.",
    path: "/ai",
    indexable: false,
  });
}

export default function ShoppingAssistantPage() {
  return (
    <PageShell
      title="Find the right product with a little help"
      description="Explore Tagit products and independent sellers, or open the app to chat with the shopping assistant."
      eyebrow="Tagit shopping assistant"
    >
      <Section title="Explore the marketplace">
        <TextLink href="/products">Browse products</TextLink>
        <TextLink href="/stores">Discover stores</TextLink>
      </Section>
    </PageShell>
  );
}
