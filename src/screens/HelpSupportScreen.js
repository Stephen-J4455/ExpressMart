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
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

export const HelpSupportScreen = ({ navigation }) => {
  const toast = useToast();
  const helpItems = [
    {
      icon: "help-circle-outline",
      label: "FAQ",
      description: "Find answers to common questions",
      action: () =>
        toast.info("FAQ section will be available soon!"),
    },
    {
      icon: "chatbubble-outline",
      label: "Contact Support",
      description: "Get help from our support team",
      action: () =>
        toast.info("Live chat support will be available soon!"),
    },
    {
      icon: "call-outline",
      label: "Call Us",
      description: "Speak with a representative",
      action: () => {
        const phoneNumber = "+233123456789"; // Replace with actual number
        Linking.openURL(`tel:${phoneNumber}`);
      },
    },
    {
      icon: "mail-outline",
      label: "Email Support",
      description: "Send us an email",
      action: () => {
        const email = "support@expressmart.com";
        Linking.openURL(`mailto:${email}?subject=Support Request`);
      },
    },
  ];

  const legalItems = [
    {
      icon: "document-text-outline",
      label: "Terms of Service",
      action: () =>
        toast.info("Terms of Service will be available soon!"),
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy Policy",
      action: () =>
        toast.info("Privacy Policy will be available soon!"),
    },
    {
      icon: "information-circle-outline",
      label: "About ExpressMart",
      action: () =>
        toast.info("ExpressMart - Your trusted online marketplace for quality products and fast delivery."),
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
      <View style={styles.header}>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get Help</Text>
          {helpItems.map(renderHelpItem)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal & About</Text>
          {legalItems.map(renderLegalItem)}
        </View>

        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Need immediate help?</Text>
          <Text style={styles.contactText}>
            Our support team is available Monday to Friday, 9 AM to 6 PM GMT.
          </Text>
          <View style={styles.contactInfo}>
            <View style={styles.contactItem}>
              <Ionicons name="call-outline" size={16} color={colors.primary} />
              <Text style={styles.contactDetail}>+233 12 345 6789</Text>
            </View>
            <View style={styles.contactItem}>
              <Ionicons name="mail-outline" size={16} color={colors.primary} />
              <Text style={styles.contactDetail}>support@expressmart.com</Text>
            </View>
            <View style={styles.contactItem}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={styles.contactDetail}>Mon-Fri 9AM-6PM GMT</Text>
            </View>
          </View>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
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
