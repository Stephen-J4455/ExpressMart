import React from "react";
import { useRouter } from "expo-router";
import { PrivacyPolicyScreen } from "../src/screens/PrivacyPolicyScreen";
import { TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "Privacy Policy | Tagit",
    description:
      "Learn how Tagit collects, uses, and protects your personal information when you use our shopping platform.",
    path: "/privacy",
  });
}

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <PrivacyPolicyScreen
      accountDeletionLink={
        <TextLink href="/delete-account">Request account and data deletion</TextLink>
      }
      navigation={{
        goBack: () =>
          router.canGoBack() ? router.back() : router.replace("/"),
      }}
    />
  );
}
