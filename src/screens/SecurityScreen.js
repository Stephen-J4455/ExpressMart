import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
  Alert,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

export const SecurityScreen = ({ navigation }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);

  const securityItems = [
    {
      icon: "shield-checkmark-outline",
      label: "Two-Factor Authentication",
      description: "Add an extra layer of security to your account",
      type: "switch",
      value: twoFactorEnabled,
      onValueChange: (value) => {
        if (value) {
          Alert.alert(
            "Enable 2FA",
            "Two-factor authentication will be enabled. You'll need to set up an authenticator app.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Enable",
                onPress: () => {
                  setTwoFactorEnabled(true);
                  toast.success("Two-factor authentication enabled!");
                },
              },
            ],
          );
        } else {
          setTwoFactorEnabled(false);
        }
      },
    },
    {
      icon: "finger-print-outline",
      label: "Biometric Login",
      description: "Use fingerprint or face ID to sign in",
      type: "switch",
      value: biometricEnabled,
      onValueChange: setBiometricEnabled,
    },
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
      icon: "phone-portrait-outline",
      label: "Active Sessions",
      description: "Manage devices signed into your account",
      action: () =>
        toast.info("Session management will be available soon!"),
    },
    {
      icon: "document-text-outline",
      label: "Login History",
      description: "View recent account activity",
      action: () =>
        toast.info("Login history will be available soon!"),
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
      <View style={styles.header}>
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
