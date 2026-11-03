import React from "react";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { publicImageUrl } from "./seoData";

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#fff",
    color: "#172033",
  },
  banner: {
    width: "100%",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bannerInner: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  brand: { color: "#e83e62", fontSize: 22, fontWeight: "800" },
  nav: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    paddingTop: 16,
  },
  navText: { color: "#334155", fontSize: 15 },
  main: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  eyebrow: {
    color: "#e83e62",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  h1: {
    color: "#172033",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 50,
    maxWidth: 800,
  },
  description: {
    color: "#475569",
    fontSize: 18,
    lineHeight: 28,
    marginTop: 16,
    maxWidth: 760,
  },
  section: { marginTop: 40 },
  h2: {
    color: "#172033",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 18,
  },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  linkButton: {
    borderColor: "#e83e62",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  linkText: { color: "#c52649", fontSize: 15, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: {
    width: 240,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 14,
  },
  productImage: { width: "100%", height: 190, backgroundColor: "#f1f5f9" },
  cardText: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  cardDetail: { color: "#64748b", paddingHorizontal: 14, paddingTop: 6 },
  footer: {
    borderTopColor: "#e5e7eb",
    borderTopWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  footerText: { color: "#64748b", fontSize: 14 },
};

export function TextLink({ href, children }) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.linkButton}>
        <Text style={styles.linkText}>{children}</Text>
      </Pressable>
    </Link>
  );
}

export function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="heading" aria-level={2} style={styles.h2}>
        {title}
      </Text>
      <View style={styles.links}>{children}</View>
    </View>
  );
}

export function PageShell({ title, description, eyebrow, children }) {
  return (
    <View style={styles.page}>
      <View accessibilityRole="banner" style={styles.banner}>
        <View style={styles.bannerInner}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.brand}>ExpressMart</Text>
            </Pressable>
          </Link>
          <View accessibilityRole="navigation" style={styles.nav}>
            <Link href="/products" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.navText}>Products</Text>
              </Pressable>
            </Link>
            <Link href="/stores" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.navText}>Stores</Text>
              </Pressable>
            </Link>
            <Link href="/feed" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.navText}>Feed</Text>
              </Pressable>
            </Link>
            <Link href="/ai" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.navText}>Shopping assistant</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>

      <View role="main" style={styles.main}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="heading" aria-level={1} style={styles.h1}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
        {children}
      </View>

      <View accessibilityRole="contentinfo" style={styles.footer}>
        <Text style={styles.footerText}>
          © ExpressMart · Discover independent stores and products
        </Text>
      </View>
    </View>
  );
}

export function ProductGrid({ products = [] }) {
  if (!products.length) {
    return (
      <Text style={styles.description}>
        No products are available right now.
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
      {products.map((product, index) => {
        const image = publicImageUrl(
          product.thumbnail || product.thumbnails?.[0],
        );
        return (
          <Link key={product.id} href={`/product/${product.id}`} asChild>
            <Pressable style={styles.card}>
              {image ? (
                <Image
                  accessibilityLabel={product.title || "Product"}
                  source={{ uri: image }}
                  style={styles.productImage}
                  contentFit="cover"
                  priority={index === 0 ? "high" : "normal"}
                  loading={index === 0 ? "eager" : "lazy"}
                />
              ) : null}
              <Text style={styles.cardText}>{product.title}</Text>
              <Text style={styles.cardDetail}>
                {product.price == null
                  ? ""
                  : `₦${Number(product.price).toLocaleString()}`}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

export function StoreLinks({ stores = [] }) {
  if (!stores.length) {
    return (
      <Text style={styles.description}>
        No stores are available right now.
      </Text>
    );
  }

  return (
    <View style={styles.links}>
      {stores.map((store) => (
        <TextLink key={store.id} href={`/store/${store.id}`}>
          {store.name}
        </TextLink>
      ))}
    </View>
  );
}
