import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import { registerRootComponent } from "expo";

if (Platform.OS === "web") {
  require("expo-router/entry");
} else {
  const App = require("./App").default;
  registerRootComponent(App);
}
