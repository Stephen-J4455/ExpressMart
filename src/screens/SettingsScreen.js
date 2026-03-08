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
import { useResponsive } from "../hooks/useResponsive";

export const SettingsScreen = ({ navigation }) => {
  const { user, profile } = useAuth();
  const toast = useToast();
  const { isWide, horizontalPadding } = useResponsive();
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [activeSection, setActiveSection] = useState(0);

  const settingsSections = [
    {
      title: "Account",
      icon: "person-circle-outline",
      items: [
        {
          icon: "person-outline",
          label: "Personal Information",
          description: "Update your name and contact details",
          action: () => navigation.navigate("ProfileEdit"),
        },
        {
          icon: "mail-outline",
          label: "Email Address",
          description: "Change your login email",
          value: user?.email,
          action: () => navigation.navigate("ChangeEmail"),
        },
        {
          icon: "key-outline",
          label: "Change Password",
          description: "Update your password",
          action: () => navigation.navigate("ChangePassword"),
        },
      ],
    },
    {
      title: "Preferences",
      icon: "options-outline",
      items: [
        {
          icon: "notifications-outline",
          label: "Push Notifications",
          description: "Receive order and promo alerts",
          type: "switch",
          value: notifications,
          onValueChange: setNotifications,
        },
        {
          icon: "mail-unread-outline",
          label: "Email Updates",
          description: "Weekly deals and newsletter",
          type: "switch",
          value: emailUpdates,
          onValueChange: setEmailUpdates,
        },
      ],
    },
    {
      title: "App",
      icon: "information-circle-outline",
      items: [
        {
          icon: "shield-checkmark-outline",
          label: "Privacy Policy",
          description: "How we handle your data",
          action: () => navigation.navigate("PrivacyPolicy"),
        },
        {
          icon: "code-slash-outline",
          label: "App Version",
          description: "ExpressMart v1.0.0",
          value: "1.0.0",
        },
      ],
    },
  ];

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          navigation.goBack();
        },
      },
    ]);
  };

  const renderSettingItem = (item, index, isLast) => (
    <Pressable
      key={index}
      style={[styles.settingItem, isLast && styles.settingItemLast]}
      onPress={item.action || (() => {})}
      disabled={item.type === "switch" || !item.action}
    >
      <View style={styles.settingItemIconWrap}>
        <Ionicons name={item.icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.settingItemBody}>
        <Text style={styles.settingLabel}>{item.label}</Text>
        {item.description && (
          <Text style={styles.settingDescription}>{item.description}</Text>
        )}
        {item.value && item.type !== "switch" && (
          <Text style={styles.settingValue}>{item.value}</Text>
        )}
      </View>
      <View style={styles.settingItemRight}>
        {item.type === "switch" ? (
          <Switch
            value={item.value}
            onValueChange={item.onValueChange}
            trackColor={{ false: "#E2E8F0", true: colors.primary }}
            thumbColor="#fff"
          />
        ) : (
          item.action && (
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          )
        )}
      </View>
    </Pressable>
  );

  if (isWide) {
    const section = settingsSections[activeSection];
    return (
      <SafeAreaView style={styles.container}>
        {/* Full-width header */}
        <View
          style={[styles.headerWide, { paddingHorizontal: horizontalPadding }]}
        >
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <View style={styles.wideBody}>
          {/* Left sidebar */}
          <View style={styles.sidebar}>
            {/* Profile card */}
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={28} color={colors.primary} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profile?.full_name || "User"}
                </Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
            </View>

            {/* Section nav */}
            {settingsSections.map((sec, i) => (
              <Pressable
                key={i}
                style={[
                  styles.sideNavItem,
                  activeSection === i && styles.sideNavItemActive,
                ]}
                onPress={() => setActiveSection(i)}
              >
                <View
                  style={[
                    styles.sideNavIcon,
                    activeSection === i && styles.sideNavIconActive,
                  ]}
                >
                  <Ionicons
                    name={sec.icon}
                    size={18}
                    color={activeSection === i ? "#fff" : colors.muted}
                  />
                </View>
                <Text
                  style={[
                    styles.sideNavLabel,
                    activeSection === i && styles.sideNavLabelActive,
                  ]}
                >
                  {sec.title}
                </Text>
              </Pressable>
            ))}

            <Pressable style={styles.signOutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>

          {/* Right content */}
          <View style={styles.contentPanel}>
            <Text style={styles.contentPanelTitle}>{section.title}</Text>
            <View style={styles.settingCard}>
              {section.items.map((item, index) =>
                renderSettingItem(
                  item,
                  index,
                  index === section.items.length - 1,
                ),
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) =>
              renderSettingItem(
                item,
                itemIndex,
                itemIndex === section.items.length - 1,
              ),
            )}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          <Pressable
            style={[styles.settingItem, styles.settingItemLast]}
            onPress={handleLogout}
          >
            <View style={styles.settingItemIconWrap}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            </View>
            <View style={styles.settingItemBody}>
              <Text style={[styles.settingLabel, { color: "#EF4444" }]}>
                Sign Out
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
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
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },
  headerWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.dark,
  },
  wideBody: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 260,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: "#EEF2F8",
    padding: 20,
    gap: 6,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F9FF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.dark,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sideNavItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  sideNavItemActive: {
    backgroundColor: "#EFF6FF",
  },
  sideNavIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  sideNavIconActive: {
    backgroundColor: colors.primary,
  },
  sideNavLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.muted,
  },
  sideNavLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginTop: "auto",
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EF4444",
  },
  contentPanel: {
    flex: 1,
    padding: 32,
  },
  contentPanelTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.dark,
    marginBottom: 20,
  },
  settingCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EEF2F8",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: "#fff",
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#EEF2F8",
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingVertical: 12,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 12,
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingItemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  settingItemBody: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    color: colors.dark,
    fontWeight: "600",
  },
  settingDescription: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  settingItemRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingValue: {
    fontSize: 13,
    color: colors.muted,
    marginRight: 4,
  },
});
