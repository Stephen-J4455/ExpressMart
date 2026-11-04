import {
  SITE_URL,
  categoryPath,
  getPublicSitemapEntries,
  productPath,
  storePath,
} from "../src/web/seoData";

const MAX_SITEMAP_URLS = 50_000;

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function renderUrlSet(entries: Array<{ path: string; lastModified?: string }>) {
  const urls = entries
    .map(({ path, lastModified }) => {
      const lastmod = lastModified ? `<lastmod>${lastModified}</lastmod>` : "";
      return `<url><loc>${escapeXml(`${SITE_URL}${path}`)}</loc>${lastmod}</url>`;
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  );
}

function getLastModified(entry: unknown) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    !("updated_at" in entry) ||
    typeof entry.updated_at !== "string"
  ) {
    return undefined;
  }

  const date = new Date(entry.updated_at);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function GET(request: Request) {
  const { products, stores, categories } = await getPublicSitemapEntries();
  const entries = [
    { path: "/" },
    { path: "/about" },
    { path: "/products" },
    { path: "/stores" },
    { path: "/categories" },
    ...products.map((product) => ({
      path: productPath(product),
      lastModified: getLastModified(product),
    })),
    ...stores.map((store) => ({
      path: storePath(store),
      lastModified: getLastModified(store),
    })),
    ...categories.map((category) => ({
      path: categoryPath(category),
    })),
  ];

  const startValue = new URL(request.url).searchParams.get("start");
  if (startValue !== null) {
    const start = Number(startValue);
    if (!Number.isSafeInteger(start) || start < 0 || start % MAX_SITEMAP_URLS) {
      return new Response("Invalid sitemap shard.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(
      renderUrlSet(entries.slice(start, start + MAX_SITEMAP_URLS)),
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control":
            "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  }

  let xml: string;
  if (entries.length > MAX_SITEMAP_URLS) {
    const sitemaps = [];
    for (let start = 0; start < entries.length; start += MAX_SITEMAP_URLS) {
      sitemaps.push(
        `<sitemap><loc>${escapeXml(
          `${SITE_URL}/sitemap.xml?start=${start}`,
        )}</loc></sitemap>`,
      );
    }
    xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join("")}</sitemapindex>`;
  } else {
    xml = renderUrlSet(entries);
  }

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
