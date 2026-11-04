import React from "react";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "About Tagit | Online Marketplace in Ghana",
    description:
      "Tagit helps people discover independent stores, shop products, and connect with sellers across Ghana.",
    path: "/about",
  });
}

export default function AboutPage() {
  return (
    <PageShell
      title="Discover stores, shop products, and connect with sellers"
      description="Tagit brings independent stores and shoppers together in one social marketplace. Explore products, discover sellers, and shop across Ghana."
      eyebrow="About Tagit"
    >
      <Section title="Explore the marketplace">
        <TextLink href="/products">Browse products</TextLink>
        <TextLink href="/stores">Discover stores</TextLink>
        <TextLink href="/categories">Browse categories</TextLink>
      </Section>
    </PageShell>
  );
}
