import React from "react";
import { PageShell, Section, TextLink } from "../../src/web/SeoPage";
import { createPageMetadata } from "../../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Find a Store | ExpressMart",
    description:
      "Explore independent stores on ExpressMart and discover products from sellers you can trust.",
    path: "/store",
  });
}

export default function StoreDirectoryPage() {
  return (
    <PageShell
      title="Find your next favourite store"
      description="Browse independent businesses and explore the products they bring to ExpressMart."
      eyebrow="Shop by seller"
    >
      <Section title="Start exploring">
        <TextLink href="/stores">View all stores</TextLink>
      </Section>
    </PageShell>
  );
}
