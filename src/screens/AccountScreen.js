import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useOrder } from "../context/OrderContext";
import { colors } from "../theme/colors";

const accountMenuItems = [
  { icon: "cube-outline", label: "Orders", screen: "Orders" },
  { icon: "heart-outline", label: "Wishlist", screen: "Wishlist" },
  { icon: "location-outline", label: "Addresses", screen: "Addresses" },
  { icon: "card-outline", label: "Payments", screen: "Payments" },
];

const settingsMenuItems = [
  { icon: "settings-outline", label: "Settings", screen: "Settings" },
  { icon: "shield-checkmark-outline", label: "Security", screen: "Security" },
  {
    icon: "notifications-outline",
    label: "Notifications",
    screen: "Notifications",
  },
  {
    icon: "help-circle-outline",
    label: "Help & Support",
    screen: "HelpSupport",
  },
];

export const AccountScreen = ({ navigation }) => {
  const { user, profile, isAuthenticated, loading, signOut } = useAuth();
  const { orders } = useOrder();

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
      <View style={styles.container}>
        <View style={styles.guestContainer}>
          <Ionicons
            name="person-circle-outline"
            size={80}
            color={colors.muted}
          />
          <Text style={styles.guestTitle}>Sign in to your account</Text>
          <Text style={styles.guestSubtitle}>
            Track orders, save favorites, and get personalized recommendations.
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
              <Text style={styles.signInText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleShortcutPress = (screen) => {
    if (screen) {
      navigation.navigate(screen);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => {}} />
        }
      >
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          style={styles.profileHeader}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {(profile?.full_name || user?.email)?.[0]?.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.profileName}>
            {profile?.full_name || "ExpressMart User"}
          </Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.memberBadge}>
            <Ionicons name="star" size={14} color="#FFD700" />
            <Text style={styles.memberText}>Premium Member</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>Total Orders</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{activeOrders}</Text>
              <Text style={styles.statLabel}>Active Orders</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                GH₵{(totalSpent / 1000).toFixed(0)}k
              </Text>
              <Text style={styles.statLabel}>Total Spent</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Account</Text>
            {accountMenuItems.map((item, index) => (
              <Pressable
                key={item.label}
                style={[
                  styles.menuItem,
                  index === accountMenuItems.length - 1 && styles.menuItemLast,
                ]}
                onPress={() => handleShortcutPress(item.screen)}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name={item.icon} size={20} color={colors.primary} />
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings & Support</Text>
            {settingsMenuItems.map((item, index) => (
              <Pressable
                key={item.label}
                style={[
                  styles.menuItem,
                  index === settingsMenuItems.length - 1 && styles.menuItemLast,
                ]}
                onPress={() => handleShortcutPress(item.screen)}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name={item.icon} size={20} color={colors.primary} />
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.spacer} />

          <Pressable style={styles.logoutButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={colors.accent} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
          <View style={styles.spacer} />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  scrollContent: {
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  guestContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  guestTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.dark,
    marginTop: 20,
  },
  guestSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  signInButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  signInGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  signInText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  profileHeader: {
    paddingTop: 100,
    paddingBottom: 30,
    alignItems: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginTop: -50,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
  },
  profileName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginTop: 12,
  },
  profileEmail: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  memberText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  content: {
    padding: 16,
    marginTop: -20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  menuItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.dark,
  },
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  shortcutCard: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  shortcutLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.dark,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  logoutText: {
    color: "#EF4444",
    fontWeight: "600",
    fontSize: 14,
  },
  spacer: {
    height: 20,
  },
});
