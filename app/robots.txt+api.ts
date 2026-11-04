export function GET() {
  return new Response(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /admin",
      "Disallow: /checkout",
      "Disallow: /account",
      "Disallow: /auth",
      "Disallow: /login",
      "Disallow: /signup",
      "Disallow: /profile",
      "Disallow: /seller",
      "Disallow: /cart",
      "Disallow: /orders",
      "Disallow: /chats",
      "Disallow: /notifications",
      "Disallow: /settings",
      "Sitemap: https://www.tagitshop.online/sitemap.xml",
      "",
    ].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
