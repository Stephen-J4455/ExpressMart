import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

// This screen is no longer used by the mobile apps.  It remains
// in the repo purely as a fallback, showing a helpful message that
// password resets must be performed on the web.

export default function PasswordResetScreen() {
  const openWeb = () => {
    const url =
      "https://stephen-j4455.github.io/express-password-reset/password-reset.html";
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.messageBox}>
        <Text style={styles.title}>Reset via Web</Text>
        <Text style={styles.text}>
          Password resets are now performed exclusively on the website. Please
          open the link from your email in a browser or tap the button below to
          go there.
        </Text>
        <TouchableOpacity style={styles.button} onPress={openWeb}>
          <Text style={styles.buttonText}>Open Web Password Reset</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.background,
  },
  messageBox: { alignItems: "center" },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.primary,
  },
  text: {
    fontSize: 16,
    color: colors.dark,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
