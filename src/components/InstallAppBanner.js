import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View, Linking } from "react-native";

const APP_STORE_URL = "https://apps.apple.com/app/tagit"; // TODO: real App Store ID
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.stephenj.expressmart";

/**
 * Mobile-web install prompt shown on the web fallback PDP. When a user taps a
 * WhatsApp catalog link without the app installed, they land here instead of
 * the native app — this banner nudges them to install.
 */
export const InstallAppBanner = () => {
  if (Platform.OS !== "web") return null;

  const store = useMemo(() => {
    if (typeof navigator === "undefined") return { label: "Get the app", url: PLAY_STORE_URL };
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return { label: "Download on the App Store", url: APP_STORE_URL };
    if (/Android/i.test(ua)) return { label: "Get it on Google Play", url: PLAY_STORE_URL };
    return null; // desktop web — no install prompt
  }, []);

  if (!store) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.textWrap}>
        <Text style={styles.title}>Get the full experience in the app</Text>
        <Text style={styles.subtitle}>
          Faster checkout, order tracking and exclusive deals.
        </Text>
      </View>
      <Pressable style={styles.button} onPress={() => Linking.openURL(store.url)}>
        <Text style={styles.buttonText}>{store.label}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: "#312E81" },
  subtitle: { fontSize: 12, color: "#4338CA", marginTop: 2 },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});

export default InstallAppBanner;
