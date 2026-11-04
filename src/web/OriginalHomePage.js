import React from "react";
import { NavigationIndependentTree } from "@react-navigation/native";
import App from "../../App";

export default function OriginalHomePage() {
  return (
    <NavigationIndependentTree>
      <App />
    </NavigationIndependentTree>
  );
}
