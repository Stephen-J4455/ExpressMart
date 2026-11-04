import React from "react";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Tagit Marketplace | Shop Independent Stores in Ghana",
    description:
      "Discover products and independent sellers from across Ghana in one marketplace with Tagit.",
    path: "/storefront",
    indexable: false,
  });
}

export default function StorefrontPage() {
  return (
    <PageShell
      title="Welcome to Tagit"
      description="A marketplace for discovering products and connecting with independent stores across Ghana."
      eyebrow="Shop Tagit"
    >
      <Section title="Start shopping">
        <TextLink href="/products">Shop products</TextLink>
        <TextLink href="/stores">Browse stores</TextLink>
        <TextLink href="/feed">See what's new</TextLink>
      </Section>
    </PageShell>
  );
}
