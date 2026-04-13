import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

const isNewArchitectureEnabled = global?.nativeFabricUIManager != null;

if (
  Platform.OS === "android" &&
  !isNewArchitectureEnabled &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const HelpSupportScreen = ({ navigation }) => {
  const { isWide, horizontalPadding } = useResponsive();
  const [expandedFaq, setExpandedFaq] = useState(null);

  const toggleFaq = (idx) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaq(expandedFaq === idx ? null : idx);
  };

  const contactItems = [
    {
      icon: "call-outline",
      label: "Call Us",
      value: "+233 53 297 3455",
      bg: "#EFF6FF",
      iconColor: "#3B82F6",
      action: () => Linking.openURL("tel:+233532973455"),
    },
    {
      icon: "mail-outline",
      label: "Email Support",
      value: "expressmart233@gmail.com",
      bg: "#F0FDF4",
      iconColor: "#22C55E",
      action: () =>
        Linking.openURL(
          "mailto:expressmart233@gmail.com?subject=Support Request",
        ),
    },
    {
      icon: "logo-whatsapp",
      label: "WhatsApp",
      value: "Chat with us",
      bg: "#F0FDF4",
      iconColor: "#16A34A",
      action: () => Linking.openURL("https://wa.me/233532973455"),
    },
  ];

  const legalItems = [
    {
      icon: "document-text-outline",
      label: "Terms & Policies",
      sub: "Our terms of service",
      action: () => navigation.navigate("Terms"),
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy Policy",
      sub: "How we protect your data",
      action: () => navigation.navigate("PrivacyPolicy"),
    },
  ];

  const faqs = [
    {
      q: "How do I track my order?",
      a: "Go to the Orders tab and tap on any order to see real-time tracking updates and status.",
    },
    {
      q: "Can I cancel or return an order?",
      a: "You can request a cancellation within 1 hour of placing your order. Returns are accepted within 7 days for most items. Contact support for help.",
    },
    {
      q: "How do I add or change my delivery address?",
      a: "Head to Account → Addresses to add new addresses or edit existing ones. You can set a default address for faster checkout.",
    },
    {
      q: "Why was my payment declined?",
      a: "Payments can fail due to insufficient funds, wrong card details, or network issues. Check your details and try again, or use a different payment method.",
    },
    {
      q: "How do I become a seller?",
      a: "Download the ExpressMart Seller app or visit our seller portal at expressmart.com/sell to register your store.",
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingHorizontal: isWide ? horizontalPadding : 16 },
        ]}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            maxWidth: isWide ? 800 : undefined,
            alignSelf: isWide ? "center" : undefined,
            width: "100%",
          }}
        >
          {/* Hero */}
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroIconWrap}>
              <Ionicons name="headset" size={36} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle}>How can we help?</Text>
            <Text style={styles.heroSub}>
              Our team is available Mon–Fri, 9 AM–6 PM GMT.
            </Text>
          </LinearGradient>

          {/* Contact cards */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="chatbubbles-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.cardTitle}>Contact Us</Text>
            </View>
            {contactItems.map((item, i) => (
              <Pressable
                key={item.label}
                style={[styles.contactRow, i > 0 && styles.contactRowBorder]}
                onPress={item.action}
              >
                <View
                  style={[styles.contactIconWrap, { backgroundColor: item.bg }]}
                >
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View style={styles.contactText}>
                  <Text style={styles.contactLabel}>{item.label}</Text>
                  <Text style={styles.contactValue}>{item.value}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </Pressable>
            ))}
          </View>

          {/* FAQ accordion */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="help-circle-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.cardTitle}>Frequently Asked Questions</Text>
            </View>
            {faqs.map((faq, i) => (
              <View key={i} style={i > 0 && styles.faqBorder}>
                <Pressable style={styles.faqRow} onPress={() => toggleFaq(i)}>
                  <Text style={styles.faqQuestion}>{faq.q}</Text>
                  <Ionicons
                    name={expandedFaq === i ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
                {expandedFaq === i && (
                  <Text style={styles.faqAnswer}>{faq.a}</Text>
                )}
              </View>
            ))}
          </View>

          {/* Legal */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="shield-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.cardTitle}>Legal & Policies</Text>
            </View>
            {legalItems.map((item, i) => (
              <Pressable
                key={item.label}
                style={[styles.legalRow, i > 0 && styles.legalRowBorder]}
                onPress={item.action}
              >
                <View style={styles.legalLeft}>
                  <View style={styles.legalIconWrap}>
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View>
                    <Text style={styles.legalLabel}>{item.label}</Text>
                    <Text style={styles.legalSub}>{item.sub}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </Pressable>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.dark },
  scrollView: { flex: 1 },
  hero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  heroIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.dark },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  contactRowBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  contactIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contactText: { flex: 1 },
  contactLabel: { fontSize: 14, fontWeight: "700", color: colors.dark },
  contactValue: { fontSize: 13, color: colors.muted, marginTop: 2 },
  faqBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  faqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 22,
    paddingBottom: 14,
    paddingRight: 8,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  legalRowBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  legalLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  legalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryLight || "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  legalLabel: { fontSize: 15, fontWeight: "600", color: colors.dark },
  legalSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
