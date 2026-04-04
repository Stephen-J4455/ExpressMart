import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

const LAST_UPDATED = "March 1, 2026";

const sections = [
  {
    title: "1. Information We Collect",
    body: `When you use ExpressMart, we collect the following types of information:

• Account information: name, email address, phone number and delivery addresses you provide during registration or checkout.
• Order data: products purchased, order amounts, shipping details and payment references.
• Device information: device model, operating system version, unique device identifiers and push-notification tokens used to deliver order updates.
• Usage data: pages viewed, search queries, and interactions within the app, collected to improve your experience.

We do not collect or store your payment card details. All payment processing is handled securely by our third-party payment provider (Paystack).`,
  },
  {
    title: "2. How We Use Your Information",
    body: `We use the information we collect to:

• Process and fulfill your orders
• Send order status updates and delivery notifications
• Provide customer support and respond to your inquiries
• Personalize your shopping experience and show relevant product recommendations
• Communicate promotional offers (only with your consent)
• Detect and prevent fraud or unauthorized activity
• Improve and maintain the performance and security of our services`,
  },
  {
    title: "3. Information Sharing",
    body: `We share your information only in the following circumstances:

• With sellers on our platform — we share your name, delivery address and order details so that sellers can fulfill your orders.
• With payment processors — we share transaction references with Paystack for payment verification.
• With delivery partners — we share delivery addresses and order details to enable shipment.
• When required by law — we may disclose information in response to valid legal requests from authorities.

We never sell your personal information to third parties for marketing purposes.`,
  },
  {
    title: "4. Data Security",
    body: `We implement industry-standard security measures to protect your personal information, including:

• Encrypted data transmission (TLS/SSL)
• Secure database storage with row-level security policies
• Access controls limiting data access to authorized personnel only
• Regular security audits and monitoring

While we strive to protect your data, no method of electronic transmission or storage is 100% secure. We encourage you to use a strong, unique password for your account.`,
  },
  {
    title: "5. Your Rights",
    body: `You have the right to:

• Access and review the personal data we hold about you
• Update or correct inaccurate information via your Profile settings
• Request deletion of your account and associated data
• Opt out of promotional communications at any time
• Withdraw consent for data processing where consent is the legal basis

To exercise any of these rights, please contact us through the Help & Support section of the app or email us at expressmart233@gmail.com.`,
  },
  {
    title: "6. Data Retention",
    body: `We retain your personal information for as long as your account is active or as needed to provide you with our services. Order history is kept for a reasonable period to support returns, disputes and legal obligations. When you delete your account, we will remove your personal data within 30 days, except where retention is required by law.`,
  },
  {
    title: "7. Children's Privacy",
    body: `ExpressMart is not intended for use by individuals under the age of 13. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child under 13, we will take steps to delete such information promptly.`,
  },
  {
    title: "8. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. When we make changes, we will update the "Last Updated" date at the top of this page and, for significant changes, notify you via the app or email. We encourage you to review this policy periodically.`,
  },
  {
    title: "9. Contact Us",
    body: `If you have any questions or concerns about this Privacy Policy, please contact us:

• In-app: Account → Help & Support
• Email: expressmart233@gmail.com`,
  },
];

export const PrivacyPolicyScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</Text>
        <Text style={styles.intro}>
          Your privacy is important to us. This Privacy Policy explains how
          ExpressMart ("we", "us", or "our") collects, uses, and protects your
          personal information when you use our mobile application and services.
        </Text>

        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={{ height: 40 }} />
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
  scrollContent: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.dark,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
  },
});
