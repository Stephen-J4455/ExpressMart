import React from "react";
import { usePathname } from "expo-router";
import OriginalHomePage from "../src/web/OriginalHomePage";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Page not found | Tagit",
    description:
      "This Tagit page could not be found. Browse products and stores across Ghana.",
    path: "/404",
    indexable: false,
  });
}

export default function NotFoundPage() {
  const pathname = usePathname();

  if (pathname === "/") {
    return <OriginalHomePage />;
  }

  return (
    <PageShell
      title="Page not found"
      description="This page may have moved or is no longer available."
    >
      <Section title="Explore Tagit">
        <TextLink href="/products">Browse products</TextLink>
        <TextLink href="/stores">Browse stores</TextLink>
      </Section>
    </PageShell>
  );
}
