import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useOrder } from "../context/OrderContext";
import { colors } from "../theme/colors";
import { CustomerLoadingAnimation } from "../components/CustomerLoadingAnimation";

const quickActions = [
  { icon: "cube", label: "Orders", screen: "Orders", color: "#3B82F6", bg: "#EFF6FF" },
  { icon: "heart", label: "Wishlist", screen: "Wishlist", color: "#EF4444", bg: "#FEF2F2" },
  { icon: "location", label: "Addresses", screen: "Addresses", color: "#22C55E", bg: "#F0FDF4" },
  { icon: "card", label: "Payments", screen: "Payments", color: "#A855F7", bg: "#FAF5FF" },
];

const menuSections = [
  {
    title: "Account Settings",
    items: [
      { icon: "person-outline", label: "Edit Profile", screen: "ProfileEdit" },
      { icon: "notifications-outline", label: "Notifications", screen: "Notifications" },
      { icon: "shield-checkmark-outline", label: "Privacy & Security", screen: "Security" },
    ],
  },
  {
    title: "Support",
    items: [
      { icon: "chatbubble-ellipses-outline", label: "Chat with Us", screen: "Chat" },
      { icon: "help-circle-outline", label: "Help Center", screen: "HelpSupport" },
      { icon: "document-text-outline", label: "Terms & Policies", screen: "Terms" },
    ],
  },
];

export const AccountScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, profile, isAuthenticated, loading, signOut } = useAuth();
  const { orders } = useOrder();
  const [showLoadingPreview, setShowLoadingPreview] = useState(false);

  const activeOrders = orders.filter((o) =>
    ["processing", "packed", "shipped"].includes(o.status),
  ).length;
  const totalSpent = orders
    .filter((o) => o.payment_status === "success")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.guestContainer}>
          <View style={styles.guestIconWrap}>
            <LinearGradient
              colors={[colors.primary + "20", colors.accent + "20"]}
              style={styles.guestIconBg}
            >
              <Ionicons name="person" size={48} color={colors.primary} />
            </LinearGradient>
          </View>
          <Text style={styles.guestTitle}>Welcome to ExpressMart</Text>
          <Text style={styles.guestSubtitle}>
            Sign in to track orders, save favorites,{"\n"}and enjoy personalized shopping.
          </Text>
          <Pressable
            style={styles.signInButton}
            onPress={() => navigation.navigate("Auth")}
          >
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              style={styles.signInGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={styles.signInText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={styles.createAccountButton}
            onPress={() => navigation.navigate("Auth", { mode: "register" })}
          >
            <Text style={styles.createAccountText}>Create Account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => { }} />
        }
      >
        {/* Profile Header */}
        <View style={[styles.profileHeader, { paddingTop: insets.top + 20 }]}>
          <View style={styles.profileTopRow}>
            <View style={styles.profileInfo}>
              <View style={styles.avatarContainer}>
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarText}>
                    {(profile?.full_name || user?.email)?.[0]?.toUpperCase()}
                  </Text>
                </LinearGradient>
                <View style={styles.onlineDot} />
              </View>
              <View style={styles.profileText}>
                <Text style={styles.profileName}>
                  {profile?.full_name || "ExpressMart User"}
                </Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
            </View>
            <Pressable
              style={styles.editButton}
              onPress={() => navigation.navigate("ProfileEdit")}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>

          {/* Membership Card */}
          <View style={styles.memberCard}>
            <View style={styles.memberCardTop}>
              <View style={styles.memberBadge}>
                <Ionicons name="diamond" size={14} color="#F59E0B" />
                <Text style={styles.memberText}>Premium</Text>
              </View>
              <View style={styles.pointsBadge}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.memberPoints}>2,450 pts</Text>
              </View>
            </View>
            <View style={styles.memberCardBottom}>
              <View style={styles.memberStat}>
                <Text style={styles.memberStatValue}>{orders.length}</Text>
                <Text style={styles.memberStatLabel}>Orders</Text>
              </View>
              <View style={styles.memberStatDivider} />
              <View style={styles.memberStat}>
                <Text style={styles.memberStatValue}>{activeOrders}</Text>
                <Text style={styles.memberStatLabel}>Active</Text>
              </View>
              <View style={styles.memberStatDivider} />
              <View style={styles.memberStat}>
                <Text style={styles.memberStatValue}>
                  GH₵{totalSpent >= 1000 ? `${(totalSpent / 1000).toFixed(1)}k` : totalSpent}
                </Text>
                <Text style={styles.memberStatLabel}>Spent</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                style={styles.quickActionCard}
                onPress={() => navigation.navigate(action.screen)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: action.bg }]}>
                  <Ionicons name={action.icon} size={22} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, index) => (
                <Pressable
                  key={item.label}
                  style={[
                    styles.menuItem,
                    index < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => item.screen && navigation.navigate(item.screen)}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconContainer}>
                      <Ionicons name={item.icon} size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.menuItemLabel}>{item.label}</Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Sign Out Button */}
        <View style={styles.signOutSection}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* App Version - Clickable */}
        <Pressable onPress={() => setShowLoadingPreview(true)}>
          <Text style={styles.versionText}>ExpressMart v1.0.0</Text>
        </Pressable>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Loading Animation Preview Modal */}
      <Modal
        visible={showLoadingPreview}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setShowLoadingPreview(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={styles.closeButton}
            onPress={() => setShowLoadingPreview(false)}
          >
            <View style={styles.closeButtonInner}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </View>
          </Pressable>
          <CustomerLoadingAnimation />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },

  // Guest State
  guestContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  guestIconWrap: {
    marginBottom: 24,
  },
  guestIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  guestTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.5,
  },
  guestSubtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
  signInButton: {
    marginTop: 32,
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  signInGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  signInText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  createAccountButton: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  createAccountText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },

  // Profile Header
  profileHeader: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  avatarGradient: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileText: {
    justifyContent: "center",
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },

  // Membership Card
  memberCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  memberCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  memberText: {
    color: "#B45309",
    fontSize: 13,
    fontWeight: "700",
  },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  memberPoints: {
    color: colors.dark,
    fontSize: 14,
    fontWeight: "600",
  },
  memberCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
  },
  memberStat: {
    alignItems: "center",
    flex: 1,
  },
  memberStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  memberStatLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    fontWeight: "500",
  },
  memberStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#E2E8F0",
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  quickActionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickActionCard: {
    width: "23%",
    alignItems: "center",
  },
  quickActionIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.dark,
  },

  // Menu Sections
  menuSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  menuIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.dark,
  },
  menuItemRight: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Sign Out
  signOutSection: {
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#FEE2E2",
  },
  signOutText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 15,
  },

  // Version
  versionText: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    marginTop: 24,
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.light,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.dark,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
});
