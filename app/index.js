import React from "react";
import { NavigationIndependentTree } from "@react-navigation/native";
import App from "../App";
import { createPageMetadata } from "../src/web/seoData";

export function generateMetadata() {
  return createPageMetadata({
    title: "ExpressMart | Discover independent stores and products",
    description:
      "Shop products from independent stores, explore new finds, and connect with sellers on ExpressMart.",
    path: "/",
  });
}

export default function HomePage() {
  return (
    <NavigationIndependentTree>
      <App />
    </NavigationIndependentTree>
  );
}
