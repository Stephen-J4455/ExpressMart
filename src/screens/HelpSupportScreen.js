import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

export const HelpSupportScreen = ({ navigation }) => {
  const { isWide, horizontalPadding } = useResponsive();
  const helpItems = [
    {
      icon: "call-outline",
      label: "Call Us",
      description: "Speak with a representative",
      action: () => {
        const phoneNumber = "+233532973455";
        Linking.openURL(`tel:${phoneNumber}`);
      },
    },
    {
      icon: "mail-outline",
      label: "Email Support",
      description: "Send us an email",
      action: () => {
        const email = "expressmart233@gmail.com";
        Linking.openURL(`mailto:${email}?subject=Support Request`);
      },
    },
  ];

  const legalItems = [
    {
      icon: "document-text-outline",
      label: "Terms & Policies",
      action: () => navigation.navigate("Terms"),
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy Policy",
      action: () => navigation.navigate("PrivacyPolicy"),
    },
  ];

  const renderHelpItem = (item) => (
    <Pressable key={item.label} style={styles.helpItem} onPress={item.action}>
      <View style={styles.helpItemLeft}>
        <Ionicons name={item.icon} size={24} color={colors.primary} />
        <View style={styles.helpItemContent}>
          <Text style={styles.helpLabel}>{item.label}</Text>
          <Text style={styles.helpDescription}>{item.description}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );

  const renderLegalItem = (item) => (
    <Pressable key={item.label} style={styles.legalItem} onPress={item.action}>
      <View style={styles.legalItemLeft}>
        <Ionicons name={item.icon} size={20} color={colors.primary} />
        <Text style={styles.legalLabel}>{item.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
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
          <View
            style={{
              flexDirection: isWide ? "row" : "column",
              gap: isWide ? 24 : 0,
              alignItems: "flex-start",
            }}
          >
            <View style={[styles.section, isWide && { flex: 1 }]}>
              <Text style={styles.sectionTitle}>Get Help</Text>
              {helpItems.map(renderHelpItem)}
            </View>

            <View style={[styles.section, isWide && { flex: 1 }]}>
              <Text style={styles.sectionTitle}>Legal & About</Text>
              {legalItems.map(renderLegalItem)}
            </View>
          </View>

          <View style={styles.contactSection}>
            <Text style={styles.contactTitle}>Need immediate help?</Text>
            <Text style={styles.contactText}>
              Our support team is available Monday to Friday, 9 AM to 6 PM GMT.
            </Text>
            <View style={styles.contactInfo}>
              <View style={styles.contactItem}>
                <Ionicons
                  name="call-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.contactDetail}>+233 53 297 3455</Text>
              </View>
              <View style={styles.contactItem}>
                <Ionicons
                  name="mail-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.contactDetail}>
                  expressmart233@gmail.com
                </Text>
              </View>
              <View style={styles.contactItem}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.contactDetail}>Mon-Fri 9AM-6PM GMT</Text>
              </View>
            </View>
          </View>

          <View style={styles.spacer} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: "#fff",
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingVertical: 12,
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  helpItemLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  helpItemContent: {
    marginLeft: 12,
    flex: 1,
  },
  helpLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 4,
  },
  helpDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  legalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  legalItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  legalLabel: {
    fontSize: 16,
    color: colors.dark,
    marginLeft: 12,
  },
  contactSection: {
    backgroundColor: "#fff",
    marginTop: 16,
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  contactInfo: {
    gap: 12,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  contactDetail: {
    fontSize: 14,
    color: colors.dark,
    marginLeft: 8,
  },
  spacer: {
    height: 32,
  },
});
