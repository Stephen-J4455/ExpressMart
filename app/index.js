import React from "react";
import { createPageMetadata } from "../src/web/seoData";
import OriginalHomePage from "../src/web/OriginalHomePage";

export function generateMetadata() {
  return createPageMetadata({
    title: "Tagit – Discover Stores, Shop Products & Connect with Sellers",
    description:
      "Discover products, explore independent stores, follow sellers and shop from multiple stores in one place with Tagit.",
    path: "/",
  });
}

export default function HomePage() {
  return <OriginalHomePage />;
}
