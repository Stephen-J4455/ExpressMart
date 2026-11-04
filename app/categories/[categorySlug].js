import React from "react";
import { useLoaderData } from "expo-router";
import { JsonLd, PageShell, ProductGrid, Section } from "../../src/web/SeoPage";
import {
  categoryPath,
  createPageMetadata,
  getBreadcrumbStructuredData,
  getCategoryStructuredData,
  getItemListStructuredData,
  getPublicCategory,
  productPath,
  publicImageUrl,
} from "../../src/web/seoData";

export function loader(_request, params) {
  return getPublicCategory(String(params.categorySlug || ""));
}

export async function generateMetadata(_request, params) {
  const category = await getPublicCategory(
    String(params.categorySlug || ""),
  );
  const name = category?.name || "Category not found";
  return createPageMetadata({
    title: category ? `${name} Products in Ghana | Tagit` : `${name} | Tagit`,
    description: category
      ? `Browse ${name.toLowerCase()} from independent stores across Ghana on Tagit.`
      : "This product category is unavailable. Explore other categories on Tagit.",
    path: category
      ? categoryPath(category)
      : `/categories/${params.categorySlug}`,
    image: publicImageUrl(category?.image_url),
    indexable: Boolean(category?.products?.length),
  });
}

export default function CategoryPage() {
  const category = useLoaderData();
  if (!category) {
    return (
      <PageShell
        title="Category not found"
        description="This product category may be unavailable."
      />
    );
  }
  return (
    <>
      <JsonLd
        data={[
          getCategoryStructuredData(category),
          getBreadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Categories", path: "/categories" },
            { name: category.name, path: categoryPath(category) },
          ]),
          getItemListStructuredData(
            category.products,
            (product) => product.title,
            productPath,
          ),
        ]}
      />
      <PageShell
        title={`${category.name} in Ghana`}
        description={`Explore ${category.name.toLowerCase()} from independent stores across Ghana on Tagit.`}
        eyebrow="Product category"
      >
        <Section title={`${category.name} products`}>
          <ProductGrid products={category.products} />
        </Section>
      </PageShell>
    </>
  );
}
