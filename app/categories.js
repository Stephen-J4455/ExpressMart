import React from "react";
import { useLoaderData } from "expo-router";
import { JsonLd, PageShell, Section } from "../src/web/SeoPage";
import {
  categoryPath,
  createPageMetadata,
  getItemListStructuredData,
  getPublicCategories,
} from "../src/web/seoData";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export function loader() {
  return getPublicCategories();
}

export function generateMetadata() {
  return createPageMetadata({
    title: "Product Categories in Ghana | Tagit",
    description:
      "Explore product categories and find independent stores and products across Ghana on Tagit.",
    path: "/categories",
  });
}

export default function CategoriesPage() {
  const categories = useLoaderData();
  return (
    <>
      <JsonLd
        data={getItemListStructuredData(
          categories,
          (category) => category.name,
          categoryPath,
        )}
      />
      <PageShell
        title="Explore product categories"
        description="Browse products from independent stores by category across Ghana."
      >
        <Section title="Categories">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {(categories || []).map((category) => (
              <Link
                key={category.id}
                href={categoryPath(category)}
                asChild
              >
                <Pressable
                  accessibilityRole="link"
                  style={{
                    borderColor: "#e83e62",
                    borderRadius: 12,
                    borderWidth: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: "#c52649", fontWeight: "600" }}>
                    {category.name}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </Section>
      </PageShell>
    </>
  );
}
