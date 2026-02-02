import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export const PrivacySettingsScreen = ({ navigation }) => {
  const [profileVisibility, setProfileVisibility] = useState(true);
  const [orderHistoryVisible, setOrderHistoryVisible] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [dataSharing, setDataSharing] = useState(false);

  const privacySections = [
    {
      title: "Profile Privacy",
      items: [
        {
          icon: "eye-outline",
          label: "Profile Visibility",
          description: "Make your profile visible to other users",
          type: "switch",
          value: profileVisibility,
          onValueChange: setProfileVisibility,
        },
        {
          icon: "receipt-outline",
          label: "Order History Visibility",
          description: "Allow sellers to see your order history",
          type: "switch",
          value: orderHistoryVisible,
          onValueChange: setOrderHistoryVisible,
        },
      ],
    },
    {
      title: "Data & Analytics",
      items: [
        {
          icon: "analytics-outline",
          label: "Usage Analytics",
          description: "Help improve the app with anonymous usage data",
          type: "switch",
          value: analyticsEnabled,
          onValueChange: setAnalyticsEnabled,
        },
        {
          icon: "mail-outline",
          label: "Marketing Communications",
          description: "Receive promotional emails and offers",
          type: "switch",
          value: marketingEmails,
          onValueChange: setMarketingEmails,
        },
        {
          icon: "share-outline",
          label: "Data Sharing",
          description: "Share data with trusted partners",
          type: "switch",
          value: dataSharing,
          onValueChange: setDataSharing,
        },
      ],
    },
    {
      title: "Data Management",
      items: [
        {
          icon: "download-outline",
          label: "Download My Data",
          description: "Request a copy of all your data",
          action: () => {
            // TODO: Implement data download
            alert("Data download feature coming soon!");
          },
        },
        {
          icon: "trash-outline",
          label: "Delete My Account",
          description: "Permanently delete your account and data",
          action: () => {
            // TODO: Implement account deletion
            alert("Account deletion feature coming soon!");
          },
          danger: true,
        },
      ],
    },
  ];

  const renderPrivacyItem = (item, index, sectionIndex) => (
    <View
      key={`${sectionIndex}-${index}`}
      style={[
        styles.privacyItem,
        index === privacySections[sectionIndex].items.length - 1 &&
          styles.privacyItemLast,
      ]}
    >
      <View style={styles.privacyItemLeft}>
        <Ionicons
          name={item.icon}
          size={24}
          color={item.danger ? colors.accent : colors.primary}
        />
        <View style={styles.privacyItemContent}>
          <Text style={[styles.privacyLabel, item.danger && styles.dangerText]}>
            {item.label}
          </Text>
          <Text style={styles.privacyDescription}>{item.description}</Text>
        </View>
      </View>
      {item.type === "switch" ? (
        <Switch
          value={item.value}
          onValueChange={item.onValueChange}
          trackColor={{ false: colors.light, true: colors.primary }}
          thumbColor="#fff"
        />
      ) : (
        <Pressable style={styles.actionButton} onPress={item.action}>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={item.danger ? colors.accent : colors.muted}
          />
        </Pressable>
      )}
    </View>
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
        <Text style={styles.headerTitle}>Privacy Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {privacySections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) =>
              renderPrivacyItem(item, itemIndex, sectionIndex),
            )}
          </View>
        ))}

        <View style={styles.infoSection}>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={colors.success}
          />
          <Text style={styles.infoText}>
            Your privacy is important to us. We only collect data necessary to
            provide our services and improve your experience.
          </Text>
        </View>

        <View style={styles.policySection}>
          <Text style={styles.policyTitle}>Privacy Policy</Text>
          <Text style={styles.policyText}>
            For more information about how we collect, use, and protect your
            data, please read our full Privacy Policy.
          </Text>
          <Pressable style={styles.policyButton}>
            <Text style={styles.policyButtonText}>Read Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
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
  privacyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  privacyItemLast: {
    borderBottomWidth: 0,
  },
  privacyItemLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  privacyItemContent: {
    marginLeft: 12,
    flex: 1,
  },
  privacyLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 4,
  },
  privacyDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  dangerText: {
    color: colors.accent,
  },
  actionButton: {
    padding: 8,
  },
  infoSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    marginTop: 16,
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light,
  },
  infoText: {
    fontSize: 14,
    color: colors.muted,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  policySection: {
    backgroundColor: "#fff",
    marginTop: 16,
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light,
  },
  policyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 8,
  },
  policyText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  policyButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.light,
    borderRadius: 6,
  },
  policyButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
    marginRight: 4,
  },
  spacer: {
    height: 32,
  },
});
