import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
  Alert,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

export const SettingsScreen = ({ navigation }) => {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [locationServices, setLocationServices] = useState(false);
  const [biometricAuth, setBiometricAuth] = useState(false);

  const settingsSections = [
    {
      title: "Account",
      items: [
        {
          icon: "person-outline",
          label: "Personal Information",
          action: () => navigation.navigate("ProfileEdit"),
        },
        {
          icon: "mail-outline",
          label: "Email",
          value: user?.email,
          action: () => navigation.navigate("ChangeEmail"),
        },
        {
          icon: "key-outline",
          label: "Change Password",
          action: () => navigation.navigate("ChangePassword"),
        },
      ],
    },
    {
      title: "Preferences",
      items: [
        {
          icon: "notifications-outline",
          label: "Push Notifications",
          type: "switch",
          value: notifications,
          onValueChange: setNotifications,
        },
        {
          icon: "mail-unread-outline",
          label: "Email Updates",
          type: "switch",
          value: emailUpdates,
          onValueChange: setEmailUpdates,
        },
        {
          icon: "location-outline",
          label: "Location Services",
          type: "switch",
          value: locationServices,
          onValueChange: setLocationServices,
        },
        {
          icon: "finger-print-outline",
          label: "Biometric Authentication",
          type: "switch",
          value: biometricAuth,
          onValueChange: setBiometricAuth,
        },
      ],
    },
    {
      title: "App",
      items: [
        {
          icon: "language-outline",
          label: "Language",
          value: "English",
          action: () =>
            toast.info("Language selection will be available soon!"),
        },
        {
          icon: "moon-outline",
          label: "Dark Mode",
          value: "Off",
          action: () =>
            toast.info("Dark mode will be available soon!"),
        },
        {
          icon: "information-circle-outline",
          label: "App Version",
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
          // This will be handled by the AuthContext
          navigation.goBack();
        },
      },
    ]);
  };

  const renderSettingItem = (item, index, sectionIndex) => (
    <Pressable
      key={`${sectionIndex}-${index}`}
      style={[
        styles.settingItem,
        index === settingsSections[sectionIndex].items.length - 1 &&
        styles.settingItemLast,
      ]}
      onPress={item.action || (() => { })}
      disabled={item.type === "switch" || !item.action}
    >
      <View style={styles.settingItemLeft}>
        <Ionicons name={item.icon} size={20} color={colors.primary} />
        <Text style={styles.settingLabel}>{item.label}</Text>
      </View>
      <View style={styles.settingItemRight}>
        {item.type === "switch" ? (
          <Switch
            value={item.value}
            onValueChange={item.onValueChange}
            trackColor={{ false: colors.light, true: colors.primary }}
            thumbColor="#fff"
          />
        ) : (
          <>
            {item.value && (
              <Text style={styles.settingValue}>{item.value}</Text>
            )}
            {item.action && (
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            )}
          </>
        )}
      </View>
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
              renderSettingItem(item, itemIndex, sectionIndex),
            )}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          <Pressable
            style={[styles.settingItem, styles.dangerItem]}
            onPress={handleLogout}
          >
            <View style={styles.settingItemLeft}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={colors.accent}
              />
              <Text style={styles.dangerText}>Sign Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: colors.dark,
    marginLeft: 12,
  },
  settingItemRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingValue: {
    fontSize: 14,
    color: colors.muted,
    marginRight: 8,
  },
  dangerItem: {
    borderBottomWidth: 0,
  },
  dangerText: {
    fontSize: 16,
    color: colors.accent,
    marginLeft: 12,
  },
  spacer: {
    height: 32,
  },
});
