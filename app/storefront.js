import React from "react";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "ExpressMart Storefront | Shop Independent",
    description:
      "Visit the ExpressMart storefront to discover products and independent sellers in one marketplace.",
    path: "/storefront",
  });
}

export default function StorefrontPage() {
  return (
    <PageShell
      title="Welcome to the ExpressMart storefront"
      description="A marketplace for discovering products and connecting with independent stores."
      eyebrow="Shop ExpressMart"
    >
      <Section title="Start shopping">
        <TextLink href="/products">Shop products</TextLink>
        <TextLink href="/stores">Browse stores</TextLink>
        <TextLink href="/feed">See what's new</TextLink>
      </Section>
    </PageShell>
  );
}
