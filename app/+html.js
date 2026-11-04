import React from "react";
import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";

export default function Root({ children }) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } =
    useServerDocumentContext();

  return (
    <html lang="en-GH" {...htmlAttributes}>
      <head>
        {headNodes}
        <ScrollViewStyleReset />
      </head>
      <body {...bodyAttributes}>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Tagit",
              url: "https://www.tagitshop.online/",
              logo: "https://www.tagitshop.online/favicon.ico",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Tagit",
              url: "https://www.tagitshop.online/",
              inLanguage: "en-GH",
            }),
          }}
        />
        {bodyNodes}
      </body>
    </html>
  );
}
