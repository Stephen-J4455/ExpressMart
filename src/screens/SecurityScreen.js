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
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

export const SecurityScreen = ({ navigation }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [loginAlerts, setLoginAlerts] = useState(true);
  const { isWide, horizontalPadding } = useResponsive();

  const securityItems = [
    {
      icon: "notifications-outline",
      label: "Login Alerts",
      description: "Get notified of new sign-ins to your account",
      type: "switch",
      value: loginAlerts,
      onValueChange: setLoginAlerts,
    },
  ];

  const actionItems = [
    {
      icon: "key-outline",
      label: "Change Password",
      description: "Update your account password",
      action: () => navigation.navigate("ChangePassword"),
    },
    {
      icon: "shield-outline",
      label: "Privacy Settings",
      description: "Control your data and privacy preferences",
      action: () => navigation.navigate("PrivacySettings"),
    },
  ];

  const renderSecurityItem = (item) => (
    <View key={item.label} style={styles.securityItem}>
      <View style={styles.securityItemLeft}>
        <Ionicons name={item.icon} size={24} color={colors.primary} />
        <View style={styles.securityItemContent}>
          <Text style={styles.securityLabel}>{item.label}</Text>
          <Text style={styles.securityDescription}>{item.description}</Text>
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
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      )}
    </View>
  );

  const renderActionItem = (item) => (
    <Pressable key={item.label} style={styles.actionItem} onPress={item.action}>
      <View style={styles.actionItemLeft}>
        <Ionicons name={item.icon} size={20} color={colors.primary} />
        <View style={styles.actionItemContent}>
          <Text style={styles.actionLabel}>{item.label}</Text>
          <Text style={styles.actionDescription}>{item.description}</Text>
        </View>
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
        <Text style={styles.headerTitle}>Security</Text>
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security Features</Text>
            {securityItems.map(renderSecurityItem)}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Security</Text>
            {actionItems.map(renderActionItem)}
          </View>

          <View style={styles.infoSection}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={colors.primary}
            />
            <Text style={styles.infoText}>
              Your account security is our top priority. Enable additional
              security features to protect your data.
            </Text>
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
  securityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  securityItemLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  securityItemContent: {
    marginLeft: 12,
    flex: 1,
  },
  securityLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 4,
  },
  securityDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  actionItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  actionItemContent: {
    marginLeft: 12,
    flex: 1,
  },
  actionLabel: {
    fontSize: 16,
    color: colors.dark,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 14,
    color: colors.muted,
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
  spacer: {
    height: 32,
  },
});
