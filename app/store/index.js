import React from "react";
import { PageShell, Section, TextLink } from "../../src/web/SeoPage";
import { createPageMetadata } from "../../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Find a Store in Ghana | Tagit",
    description:
      "Explore independent stores across Ghana and discover products from local sellers on Tagit.",
    path: "/stores",
    indexable: false,
  });
}

export default function StoreDirectoryPage() {
  return (
    <PageShell
      title="Find your next favourite store"
      description="Browse independent businesses and explore the products they bring to Tagit."
      eyebrow="Shop by seller"
    >
      <Section title="Start exploring">
        <TextLink href="/stores">View all stores</TextLink>
      </Section>
    </PageShell>
  );
}
