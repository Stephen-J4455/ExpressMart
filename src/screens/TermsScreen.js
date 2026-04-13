import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

const LAST_UPDATED = "March 1, 2026";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: `By downloading, installing, or using the ExpressMart app, you agree to be bound by these Terms & Policies. If you do not agree to these terms, please do not use our services.

These terms apply to all users of the platform, including buyers and sellers. We reserve the right to update these terms at any time, and your continued use of the app constitutes acceptance of any changes.`,
  },
  {
    title: "2. Use of the Platform",
    body: `ExpressMart is an e-commerce marketplace connecting buyers and sellers. You agree to:

• Provide accurate, current and complete information when creating an account
• Maintain the security of your account credentials
• Use the platform only for lawful purposes
• Not attempt to manipulate prices, reviews, or any other platform feature
• Not engage in fraudulent transactions or impersonate other users

We reserve the right to suspend or terminate accounts that violate these terms without prior notice.`,
  },
  {
    title: "3. Orders & Payments",
    body: `When you place an order on ExpressMart:

• You enter into a direct contract with the seller for the supply of the item
• Prices displayed include applicable taxes unless stated otherwise
• Payment is processed securely through Paystack; we do not store your card details
• A service fee may be applied to cover platform costs — this will always be shown before you confirm payment
• Orders are confirmed only after successful payment authorization

ExpressMart acts as an intermediary and is not responsible for disputes arising directly between buyers and sellers, though we will assist in resolution where possible.`,
  },
  {
    title: "4. Delivery & Shipping",
    body: `Delivery timelines and shipping fees are set by individual sellers and displayed at checkout. ExpressMart is not liable for:

• Delays caused by third-party logistics providers
• Loss or damage during transit beyond our reasonable control
• Incorrect delivery addresses provided by the buyer

If an order is not delivered within the estimated timeframe, please contact the seller or our support team for assistance.`,
  },
  {
    title: "5. Returns & Refunds",
    body: `Return and refund eligibility depends on the seller's individual policy, which is displayed on their store page. Generally:

• Items may be returned within 7 days of delivery if they are faulty, damaged, or significantly different from the description
• Items must be unused, in original packaging, and accompanied by proof of purchase
• Refunds are processed to your original payment method within 5–10 business days after the return is verified

ExpressMart reserves the right to mediate disputes between buyers and sellers and may issue platform credits where appropriate.`,
  },
  {
    title: "6. Seller Responsibilities",
    body: `Sellers on ExpressMart agree to:

• List only products they have the right to sell
• Provide accurate descriptions, images and pricing
• Fulfill orders promptly and in good faith
• Comply with all applicable laws regarding the sale of goods
• Not list counterfeit, prohibited, or illegal items

Violation of these obligations may result in removal of listings, account suspension, or legal action.`,
  },
  {
    title: "7. Intellectual Property",
    body: `All content on the ExpressMart platform — including the logo, app design, graphics, text and software — is the property of ExpressMart or its licensors and is protected by intellectual property laws.

You may not reproduce, distribute, or create derivative works from our content without express written permission. Product images and descriptions uploaded by sellers remain their property; by uploading them, sellers grant ExpressMart a license to display them on the platform.`,
  },
  {
    title: "8. Limitation of Liability",
    body: `To the fullest extent permitted by law, ExpressMart shall not be liable for:

• Indirect, incidental, or consequential damages arising from use of the platform
• Loss of profit, data, or business opportunities
• Actions or omissions of third-party sellers or delivery partners

Our total liability in any circumstances shall not exceed the amount you paid for the specific transaction giving rise to the claim.`,
  },
  {
    title: "9. Governing Law",
    body: `These terms are governed by the laws of the Federal Republic of Ghana. Any disputes arising from the use of ExpressMart that cannot be resolved through our support process will be subject to the exclusive jurisdiction of Ghanan courts.`,
  },
  {
    title: "10. Contact Us",
    body: `If you have questions about these Terms & Policies, please reach out:

Email: expressmart233@gmail.com
In-app: Account → Help Center → Chat with Us

We aim to respond to all inquiries within 24 hours on business days.`,
  },
];

export const TermsScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Terms & Policies</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</Text>
        <Text style={styles.intro}>
          Please read these Terms & Policies carefully before using ExpressMart.
          By using our services you agree to be bound by these terms.
        </Text>

        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} ExpressMart. All rights reserved.
          </Text>
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
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  lastUpdated: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  intro: {
    fontSize: 15,
    color: colors.dark,
    lineHeight: 24,
    marginBottom: 28,
    padding: 16,
    backgroundColor: colors.primary + "0D",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 23,
  },
  footer: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: colors.muted,
  },
});
