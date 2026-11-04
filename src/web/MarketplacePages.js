import React from "react";
import { Text } from "react-native";
import {
  getBreadcrumbStructuredData,
  getProductStructuredData,
  getStoreStructuredData,
  plainText,
  productPath,
  publicImageUrl,
  storePath,
} from "./seoData";
import {
  JsonLd,
  PageShell,
  ProductGrid,
  Section,
  SeoImage,
  TextLink,
} from "./SeoPage";

export function ProductPageContent({ product }) {
  if (!product) {
    return (
      <PageShell
        title="Product not found"
        description="This product may be unavailable. Browse Tagit to discover more products from independent stores in Ghana."
      >
        <Section title="Continue browsing">
          <TextLink href="/products">Browse products</TextLink>
        </Section>
      </PageShell>
    );
  }

  const image = publicImageUrl(
    product.thumbnail || product.thumbnails?.[0],
  );
  const canonicalPath = productPath(product);

  return (
    <>
      <JsonLd
        data={[
          getProductStructuredData(product),
          getBreadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Products", path: "/products" },
            { name: product.title, path: canonicalPath },
          ]),
        ]}
      />
      <PageShell
        title={product.title}
        description={
          plainText(product.description) ||
          `Shop ${product.title} from an independent seller on Tagit in Ghana.`
        }
        eyebrow="Product details"
      >
        {image ? (
          <SeoImage
            alt={product.title}
            uri={image}
            style={{
              width: "100%",
              maxWidth: 640,
              height: 440,
              marginTop: 28,
              backgroundColor: "#f1f5f9",
            }}
            resizeMode="contain"
            width={640}
            height={440}
            loading="eager"
            fetchPriority="high"
          />
        ) : null}
        {product.price != null ? (
          <Text
            style={{
              color: "#172033",
              fontSize: 24,
              fontWeight: "700",
              marginTop: 20,
            }}
          >
            GH₵{Number(product.price).toLocaleString()}
          </Text>
        ) : null}
        {product.seller_id?.name ? (
          <Section title="Sold by">
            <TextLink href={storePath(product.seller_id)}>
              {product.seller_id.name}
            </TextLink>
          </Section>
        ) : null}
        {product.category ? (
          <Section title="Category">
            <TextLink href="/categories">{product.category}</TextLink>
          </Section>
        ) : null}
        <Section title="Availability">
          <Text style={{ color: "#475569", fontSize: 16 }}>
            {product.track_inventory !== true ||
            product.quantity == null ||
            !Number.isFinite(Number(product.quantity))
              ? "Check with the seller for availability"
              : Number(product.quantity) > 0
                ? "In stock"
                : product.allow_backorder
                  ? "Available for backorder"
                  : "Out of stock"}
          </Text>
        </Section>
      </PageShell>
    </>
  );
}

export function StorePageContent({ store }) {
  if (!store) {
    return (
      <PageShell
        title="Store not found"
        description="This store may be unavailable. Explore active independent stores on Tagit."
      >
        <Section title="Continue browsing">
          <TextLink href="/stores">Browse stores</TextLink>
        </Section>
      </PageShell>
    );
  }

  const image = publicImageUrl(
    store.cover_image || store.avatar,
    "profile",
  );
  const description =
    plainText(store.store_description || store.description) ||
    `Discover products from ${store.name}, an independent store on Tagit.`;
  const canonicalPath = storePath(store);

  return (
    <>
      <JsonLd
        data={[
          getStoreStructuredData(store),
          getBreadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Stores", path: "/stores" },
            { name: store.name, path: canonicalPath },
          ]),
        ]}
      />
      <PageShell
        title={store.name}
        description={description}
        eyebrow="Independent store"
      >
        {image ? (
          <SeoImage
            alt={`${store.name} store`}
            uri={image}
            style={{
              width: "100%",
              maxWidth: 720,
              height: 260,
              marginTop: 28,
              backgroundColor: "#f1f5f9",
            }}
            resizeMode="cover"
            width={720}
            height={260}
            loading="eager"
            fetchPriority="high"
          />
        ) : null}
        {store.location ? (
          <Text style={{ color: "#64748b", marginTop: 16 }}>
            {store.location}
          </Text>
        ) : null}
        <Section title={`Products from ${store.name}`}>
          <ProductGrid products={store.products} />
        </Section>
        <Section title="More stores">
          <TextLink href="/stores">Explore all stores</TextLink>
        </Section>
      </PageShell>
    </>
  );
}
