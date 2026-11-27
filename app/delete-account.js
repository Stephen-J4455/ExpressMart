import React from "react";
import { Text, View } from "react-native";
import { PageShell, Section, TextLink } from "../src/web/SeoPage";
import { createPageMetadata } from "../src/web/seoData";

const supportEmail = "expressmart233@gmail.com";
const requestEmail = `mailto:${supportEmail}?subject=${encodeURIComponent(
  "Tagit account and data deletion request",
)}&body=${encodeURIComponent(
  "Please delete my Tagit account and associated personal data.\n\nEmail address on my Tagit account: ",
)}`;

const body = { color: "#475569", fontSize: 16, lineHeight: 25, maxWidth: 700 };

export function generateMetadata() {
  return createPageMetadata({
    title: "Delete your Tagit account and data | Tagit",
    description: "Request deletion of your Tagit account and associated personal data.",
    path: "/delete-account",
  });
}

export default function DeleteAccountPage() {
  return (
    <PageShell
      title="Delete your Tagit account and data"
      description="You can request deletion of your account and associated personal data by emailing Tagit support."
    >
      <Section title="Request deletion">
        <View style={{ gap: 14, width: "100%" }}>
          <Text style={body}>
            Send your request to {supportEmail} and include the email address
            registered with your Tagit account. Keep your password and
            verification codes private. Support may ask you to verify account
            ownership before processing the request.
          </Text>
          <View style={{ alignItems: "flex-start" }}>
            <TextLink href={requestEmail}>Email a deletion request</TextLink>
          </View>
        </View>
      </Section>

      <Section title="What happens to your data">
        <View style={{ gap: 12, width: "100%" }}>
          <Text style={body}>
            Deletion permanently removes your account and associated personal
            data, such as your profile, contact details, and saved delivery
            addresses. Our privacy policy says personal data is removed within
            30 days of account deletion, except where retention is required
            by law.
          </Text>
          <Text style={body}>
            Order records may be kept for returns, disputes, and legal
            obligations, as described in the privacy policy.
          </Text>
          <View style={{ alignItems: "flex-start" }}>
            <TextLink href="/privacy">Read the privacy policy</TextLink>
          </View>
        </View>
      </Section>
    </PageShell>
  );
}
