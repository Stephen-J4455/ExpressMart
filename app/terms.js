import React from "react";
import { useRouter } from "expo-router";
import { TermsScreen } from "../src/screens/TermsScreen";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Terms & Policies | Tagit",
    description:
      "Read the terms and policies for using Tagit to shop products and connect with independent sellers in Ghana.",
    path: "/terms",
  });
}

export default function TermsPage() {
  const router = useRouter();

  return (
    <TermsScreen
      navigation={{
        goBack: () =>
          router.canGoBack() ? router.back() : router.replace("/"),
      }}
    />
  );
}
