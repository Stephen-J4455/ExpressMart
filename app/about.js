import React, { useState } from "react";
import { Text, View, Pressable, ScrollView, TextInput } from "react-native";
import { PageShell, Section, TextLink, JsonLd, SeoImage } from "../src/web/SeoPage";
import {
  createPageMetadata,
  getOrganizationStructuredData,
  getWebsiteStructuredData,
} from "../src/web/seoData";
import { useTheme } from "../src/context/ThemeContext";
import { useAppStyles } from "../src/hooks/useAppStyles";
import { StyleSheet } from "react-native";

// Tagit brand palette — matches the app theme (src/theme/colors.js)
const BRAND = {
  primary: "#FF5A79",
  primaryDark: "#F03A70",
  accent: "#00E2C8",
  dark: "#0F172A",
  light: "#ffffff",
  surface: "#F8FAFC",
  border: "#E2E8F0",
  muted: "#64748B",
  text: "#172033",
};

export function generateMetadata() {
  return createPageMetadata({
    title: "About Tagit | Ghana's Social Marketplace for Independent Stores",
    description:
      "Tagit is Ghana's social marketplace connecting shoppers with independent stores and sellers. Discover products, follow sellers, and shop from local businesses across Ghana.",
    path: "/about",
    image: "/assets/icon.png",
  });
}

export default function AboutPage() {
  const { colors } = useTheme();
  const styles = useAppStyles((c) =>
    StyleSheet.create({
      page: {
        minHeight: "100vh",
        backgroundColor: c.background,
        color: c.dark,
      },
      hero: {
        backgroundColor: c.primary,
        borderRadius: 24,
        padding: 40,
        marginBottom: 40,
        overflow: "hidden",
      },
      heroEyebrow: {
        color: c.accent,
        fontSize: 13,
        fontWeight: "800",
        marginBottom: 12,
        textTransform: "uppercase",
        letterSpacing: 1,
      },
      heroTitle: {
        color: c.light,
        fontSize: 48,
        fontWeight: "800",
        lineHeight: 56,
        maxWidth: 700,
        marginBottom: 16,
      },
      heroSubtitle: {
        color: "rgba(255, 255, 255, 0.9)",
        fontSize: 18,
        lineHeight: 28,
        maxWidth: 600,
        marginBottom: 28,
      },
      heroImage: {
        width: "100%",
        maxWidth: 560,
        height: 320,
        borderRadius: 20,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        marginTop: 32,
      },
      section: { marginTop: 64 },
      sectionHead: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 24,
      },
      sectionNumber: {
        color: c.primary,
        fontSize: 20,
        fontWeight: "800",
      },
      h2: {
        color: c.dark,
        fontSize: 32,
        fontWeight: "800",
        lineHeight: 40,
      },
      p: {
        color: c.muted,
        fontSize: 16,
        lineHeight: 26,
        marginBottom: 16,
        maxWidth: 700,
      },
      grid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
      card: {
        flex: 1,
        minWidth: 260,
        backgroundColor: c.surface,
        borderColor: c.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 24,
      },
      cardIcon: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: c.primary + "15",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
      },
      cardTitle: {
        color: c.dark,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 8,
      },
      cardText: {
        color: c.muted,
        fontSize: 15,
        lineHeight: 22,
      },
      statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
      statCard: {
        flex: 1,
        minWidth: 160,
        backgroundColor: c.surface,
        borderColor: c.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 24,
        alignItems: "center",
      },
      statValue: {
        color: c.dark,
        fontSize: 32,
        fontWeight: "800",
        lineHeight: 40,
      },
      statLabel: {
        color: c.muted,
        fontSize: 14,
        lineHeight: 20,
        marginTop: 8,
        textAlign: "center",
      },
      divider: {
        height: 1,
        backgroundColor: c.border,
        marginVertical: 40,
      },
      trustGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
      trustBadge: {
        flex: 1,
        minWidth: 150,
        backgroundColor: c.light,
        borderColor: c.border,
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        alignItems: "center",
      },
      trustBadgeTitle: {
        color: c.dark,
        fontSize: 15,
        fontWeight: "700",
        marginBottom: 4,
      },
      trustBadgeText: {
        color: c.muted,
        fontSize: 13,
        lineHeight: 18,
        textAlign: "center",
      },
      highlight: {
        backgroundColor: c.accent + "10",
        borderLeftWidth: 4,
        borderLeftColor: c.accent,
        borderRadius: 0,
        padding: 24,
        marginTop: 32,
      },
      highlightTitle: {
        color: c.dark,
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 8,
      },
      highlightText: {
        color: c.muted,
        fontSize: 15,
        lineHeight: 22,
      },
      cta: {
        backgroundColor: c.primary,
        borderRadius: 24,
        padding: 40,
        alignItems: "center",
        textAlign: "center",
      },
      ctaTitle: {
        color: c.light,
        fontSize: 32,
        fontWeight: "800",
        lineHeight: 40,
        marginBottom: 16,
        maxWidth: 600,
        textAlign: "center",
      },
      ctaText: {
        color: "rgba(255, 255, 255, 0.9)",
        fontSize: 17,
        lineHeight: 26,
        marginBottom: 28,
        maxWidth: 500,
        textAlign: "center",
      },
      ctaButton: {
        backgroundColor: c.accent,
        borderRadius: 14,
        paddingHorizontal: 28,
        paddingVertical: 14,
        alignItems: "center",
      },
      ctaButtonText: {
        color: c.dark,
        fontSize: 16,
        fontWeight: "800",
      },
      faqGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
      faqCard: {
        flex: 1,
        minWidth: 280,
        backgroundColor: c.surface,
        borderColor: c.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 24,
      },
      faqQuestion: {
        color: c.dark,
        fontSize: 17,
        fontWeight: "700",
        marginBottom: 8,
      },
      faqAnswer: {
        color: c.muted,
        fontSize: 15,
        lineHeight: 22,
      },
      footer: {
        borderTopColor: c.border,
        borderTopWidth: 1,
        padding: 40,
        alignItems: "center",
        backgroundColor: c.surface,
      },
      footerText: { color: c.muted, fontSize: 14 },
      footerLinks: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 24,
        marginBottom: 20,
      },
      footerLink: {
        color: c.muted,
        fontSize: 14,
        fontWeight: "600",
      },
      newsletter: {
        backgroundColor: c.surface,
        borderColor: c.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 32,
        marginTop: 40,
      },
      newsletterTitle: {
        color: c.dark,
        fontSize: 24,
        fontWeight: "800",
        marginBottom: 8,
      },
      newsletterText: {
        color: c.muted,
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 20,
        maxWidth: 500,
      },
      newsletterInput: {
        flex: 1,
        minWidth: 200,
        backgroundColor: c.light,
        borderColor: c.border,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: c.dark,
      },
      newsletterButton: {
        backgroundColor: c.primary,
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        marginLeft: 12,
        alignItems: "center",
      },
      newsletterButtonText: {
        color: c.light,
        fontSize: 15,
        fontWeight: "700",
      },
    }),
  );

  const [expandedFaq, setExpandedFaq] = useState(null);

  const faqs = [
    {
      question: "What is Tagit?",
      answer:
        "Tagit is Ghana's social marketplace that connects shoppers with independent stores and sellers. Discover products, follow your favorite sellers, and shop from local businesses across Ghana.",
    },
    {
      question: "Where is Tagit available?",
      answer:
        "Tagit operates across Ghana, connecting shoppers with independent stores and sellers in Accra, Kumasi, Takoradi, Cape Coast, Tamale, and beyond.",
    },
    {
      question: "How do I sell on Tagit?",
      answer:
        "Independent sellers can register their store on Tagit and start listing products. Visit our store registration page to get started selling to shoppers across Ghana.",
    },
    {
      question: "Is Tagit safe to use?",
      answer:
        "Yes. Tagit connects you directly with verified independent sellers. All stores on the platform are reviewed, and we provide secure payment processing through trusted providers.",
    },
  ];

  return (
    <>
      <JsonLd data={getOrganizationStructuredData()} />
      <JsonLd data={getWebsiteStructuredData()} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About Tagit",
          url: "https://www.tagitshop.online/about",
          description:
            "Tagit is Ghana's social marketplace connecting shoppers with independent stores and sellers.",
          publisher: getOrganizationStructuredData(),
          inLanguage: "en-GH",
          isPartOf: {
            "@type": "WebSite",
            name: "Tagit",
            url: "https://www.tagitshop.online",
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer,
            },
          })),
        }}
      />

      <ScrollView style={styles.page}>
        <PageShell
          title="About Tagit"
          description=
            "Tagit is Ghana's social marketplace connecting shoppers with independent stores and sellers. Discover products, follow sellers, and shop from local businesses across Ghana."
          eyebrow="About Tagit"
        >
          {/* Hero section */}
          <View style={styles.hero}>
            <View>
              <Text style={styles.heroEyebrow}>Ghana's Social Marketplace</Text>
              <Text style={styles.heroTitle}>
                Shop local. Follow sellers. Live better.
              </Text>
              <Text style={styles.heroSubtitle}>
                Tagit connects you with independent stores and sellers across
                Ghana. Discover unique products, follow the brands you love, and
                shop from your community — all in one place.
              </Text>
              <Pressable style={styles.ctaButton}>
                <Text style={styles.newsletterButtonText}>
                  Browse stores →
                </Text>
              </Pressable>
            </View>
            <SeoImage
              alt="Tagit marketplace"
              uri="/assets/tagit_horizontal_tight.png"
              style={styles.heroImage}
              resizeMode="contain"
              loading="eager"
              fetchPriority="high"
            />
          </View>

          {/* Our story */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionNumber}>01</Text>
              <Text style={styles.h2}>Our story</Text>
            </View>
            <Text style={styles.p}>
              Tagit was built to give independent stores and sellers in Ghana a
              digital home — a place where shoppers can discover unique
              products, follow the sellers they love, and shop from local
              businesses across the country.
            </Text>
            <Text style={styles.p}>
              We believe shopping should be social, personal, and
              community-led. That's why Tagit lets you follow sellers, see
              their latest products in your feed, and connect directly with the
              people behind the brands you love.
            </Text>
          </View>

          {/* What you can do */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionNumber}>02</Text>
              <Text style={styles.h2}>What you can do on Tagit</Text>
            </View>
            <View style={styles.grid}>
              <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={{ color: BRAND.primary, fontSize: 28 }}>
                    🛍️
                  </Text>
                </View>
                <Text style={styles.cardTitle}>Discover products</Text>
                <Text style={styles.cardText}>
                  Browse thousands of products from independent stores across
                  Ghana, from fashion and beauty to home goods and electronics.
                </Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={{ color: BRAND.accent, fontSize: 28 }}>🤝</Text>
                </View>
                <Text style={styles.cardTitle}>Follow sellers</Text>
                <Text style={styles.cardText}>
                  Follow your favorite sellers and see their newest products in
                  your personalized feed every time you open the app.
                </Text>
              </View>
              <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={{ color: BRAND.primaryDark, fontSize: 28 }}>
                    💬
                  </Text>
                </View>
                <Text style={styles.cardTitle}>Connect directly</Text>
                <Text style={styles.cardText}>
                  Message sellers, ask questions about products, and get
                  personalized recommendations from the people who make them.
                </Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.section}>
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>1000+</Text>
                <Text style={styles.statLabel}>Independent stores</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>10000+</Text>
                <Text style={styles.statLabel}>Products to discover</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>16</Text>
                <Text style={styles.statLabel}>Regions of Ghana</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Trust */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionNumber}>03</Text>
              <Text style={styles.h2}>Trusted by shoppers and sellers</Text>
            </View>
            <View style={styles.trustGrid}>
              <View style={styles.trustBadge}>
                <Text style={styles.trustBadgeTitle}>Independent stores</Text>
                <Text style={styles.trustBadgeText}>
                  Local sellers from every region of Ghana
                </Text>
              </View>
              <View style={styles.trustBadge}>
                <Text style={styles.trustBadgeTitle}>Secure payments</Text>
                <Text style={styles.trustBadgeText}>
                  Trusted payment processing for every order
                </Text>
              </View>
              <View style={styles.trustBadge}>
                <Text style={styles.trustBadgeTitle}>Social shopping</Text>
                <Text style={styles.trustBadgeText}>
                  Follow sellers and discover products through your feed
                </Text>
              </View>
            </View>
          </View>

          {/* For sellers */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionNumber}>04</Text>
              <Text style={styles.h2}>For sellers</Text>
            </View>
            <Text style={styles.p}>
              Tagit gives independent sellers the tools to reach shoppers
              across Ghana without needing their own website or physical
              storefront. List your products, manage orders, and build a
              following — all from one place.
            </Text>
            <TextLink href="/store-registration" style={styles.ctaButton}>
              Register your store →
            </TextLink>
          </View>

          {/* FAQ */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionNumber}>05</Text>
              <Text style={styles.h2}>Frequently asked questions</Text>
            </View>
            <View style={styles.faqGrid}>
              {faqs.map((faq, index) => (
                <View key={faq.question} style={styles.faqCard}>
                  <Pressable
                    onPress={() =>
                      setExpandedFaq(expandedFaq === index ? null : index)
                    }
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <Text style={{ color: BRAND.primary, fontWeight: "700" }}>
                      {expandedFaq === index ? "▲" : "▼"}
                    </Text>
                  </Pressable>
                  {expandedFaq === index && (
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Newsletter */}
          <View style={styles.newsletter}>
            <Text style={styles.newsletterTitle}>Stay in the loop</Text>
            <Text style={styles.newsletterText}>
              Subscribe to hear about new stores, products, and features from
              Tagit.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <TextInput
                style={styles.newsletterInput}
                placeholder="Enter your email"
                placeholderTextColor="#94A3B8"
              />
              <Pressable style={styles.newsletterButton}>
                <Text style={styles.newsletterButtonText}>Subscribe</Text>
              </Pressable>
            </View>
          </View>

          {/* CTA */}
          <View style={styles.cta}>
            <Text style={styles.ctaTitle}>Ready to start shopping?</Text>
            <Text style={styles.ctaText}>
              Download the Tagit app and discover independent stores near you.
            </Text>
            <Pressable style={styles.ctaButton}>
              <Text style={styles.newsletterButtonText}>
                Browse stores →
              </Text>
            </Pressable>
          </View>

          {/* Explore links */}
          <Section title="Explore Tagit">
            <TextLink href="/products">Browse products</TextLink>
            <TextLink href="/stores">Discover stores</TextLink>
            <TextLink href="/categories">Browse categories</TextLink>
            <TextLink href="/feed">See the feed</TextLink>
          </Section>
        </PageShell>

        <View accessibilityRole="contentinfo" style={styles.footer}>
          <View style={styles.footerLinks}>
            <TextLink href="/products" style={styles.footerLink}>
              Products
            </TextLink>
            <TextLink href="/stores" style={styles.footerLink}>
              Stores
            </TextLink>
            <TextLink href="/categories" style={styles.footerLink}>
              Categories
            </TextLink>
            <TextLink href="/feed" style={styles.footerLink}>
              Feed
            </TextLink>
            <TextLink href="/ai" style={styles.footerLink}>
              Shopping assistant
            </TextLink>
          </View>
          <Text style={styles.footerText}>
            © Tagit · Discover stores and shop products across Ghana
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
