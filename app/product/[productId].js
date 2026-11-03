import React from "react";
import { useLoaderData } from "expo-router";
import { Image } from "expo-image";
import { Text } from "react-native";
import { PageShell, Section, TextLink } from "../../src/web/SeoPage";
import {
  createPageMetadata,
  getPublicProduct,
  publicImageUrl,
} from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicProduct(String(params.productId || ""));
}

export async function generateMetadata(_request, params) {
  const product = await getPublicProduct(String(params.productId || ""));
  const name = product?.title || "Product";
  const description =
    product?.description ||
    `Discover ${name} from an independent seller on ExpressMart.`;
  const image = publicImageUrl(
    product?.thumbnail || product?.thumbnails?.[0],
  );

  return createPageMetadata({
    title: `${name} | ExpressMart`,
    description,
    path: `/product/${encodeURIComponent(String(params.productId || ""))}`,
    image,
  });
}

export default function ProductPage() {
  const product = useLoaderData();

  if (!product) {
    return (
      <PageShell
        title="Product not found"
        description="This product may be unavailable. Browse the ExpressMart marketplace to discover more."
      >
        <Section title="Continue browsing">
          <TextLink href="/products">Browse products</TextLink>
        </Section>
      </PageShell>
    );
  }

  const image = publicImageUrl(product.thumbnail || product.thumbnails?.[0]);
  return (
    <PageShell
      title={product.title}
      description={
        product.description ||
        `Shop ${product.title} from an independent ExpressMart seller.`
      }
      eyebrow="Product details"
    >
      {image ? (
        <Image
          accessibilityLabel={product.title}
          source={{ uri: image }}
          style={{ width: "100%", maxWidth: 640, height: 440, marginTop: 28 }}
          contentFit="contain"
          priority="high"
          loading="eager"
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
          ₦{Number(product.price).toLocaleString()}
        </Text>
      ) : null}
      {product.seller_id?.name ? (
        <Section title="Sold by">
          <TextLink href={`/store/${product.seller_id.id}`}>
            {product.seller_id.name}
          </TextLink>
        </Section>
      ) : null}
    </PageShell>
  );
}
