import { Pressable, StyleSheet, Text, View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../context/CartContext";
import { colors } from "../theme/colors";

const NAV_ITEMS = [
  { name: "Home", icon: "home-outline", iconFocused: "home" },
  { name: "Categories", icon: "grid-outline", iconFocused: "grid" },
  { name: "Feed", icon: "compass-outline", iconFocused: "compass" },
  { name: "Cart", icon: "cart-outline", iconFocused: "cart" },
  { name: "Account", icon: "person-outline", iconFocused: "person" },
];

const BOTTOM_ITEMS = [
  {
    name: "Stores",
    label: "Stores",
    icon: "storefront-outline",
    iconFocused: "storefront",
  },
  {
    name: "Chats",
    label: "Messages",
    icon: "chatbubbles-outline",
    iconFocused: "chatbubbles",
  },
  {
    name: "Terms",
    label: "Policy",
    icon: "document-text-outline",
    iconFocused: "document-text",
  },
];

export const WebSidebar = ({ state, navigation, sidebarWidth }) => {
  const insets = useSafeAreaInsets();
  const { items } = useCart();
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const activeRoute = state?.routes?.[state.index]?.name;

  const renderNavItem = (item, isActive) => (
    <Pressable
      key={item.name}
      style={[styles.navItem, isActive && styles.navItemActive]}
      onPress={() => navigation.navigate(item.name)}
    >
      {isActive && (
        <LinearGradient
          colors={[colors.primary + "15", colors.accent + "08"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      )}
      <View style={styles.navItemContent}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={isActive ? item.iconFocused : item.icon}
            size={22}
            color={isActive ? colors.primary : colors.muted}
          />
          {item.name === "Cart" && cartCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartCount}</Text>
            </View>
          )}
        </View>
        {sidebarWidth >= 200 && (
          <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
            {item.label ?? item.name}
          </Text>
        )}
      </View>
      {isActive && <View style={styles.activeIndicator} />}
    </Pressable>
  );

  return (
    <View
      style={[
        styles.container,
        { width: sidebarWidth, paddingTop: insets.top },
      ]}
    >
      {/* Brand */}
      <View style={styles.brandContainer}>
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          style={styles.brandIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="flash" size={22} color="#fff" />
        </LinearGradient>
        {sidebarWidth >= 200 && (
          <Text style={styles.brandText}>ExpressMart</Text>
        )}
      </View>

      {/* Nav Items */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.navList}
      >
        {NAV_ITEMS.map((item) =>
          renderNavItem(item, activeRoute === item.name),
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomSection}>
        <View style={styles.divider} />
        {BOTTOM_ITEMS.map((item) =>
          renderNavItem(item, activeRoute === item.name),
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: "#F1F5F9",
    paddingVertical: 16,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
    gap: 12,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.5,
  },
  navList: {
    paddingHorizontal: 10,
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    minHeight: 48,
  },
  navItemActive: {
    backgroundColor: colors.primary + "08",
  },
  navItemContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 14,
    flex: 1,
  },
  iconContainer: {
    position: "relative",
    width: 24,
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  navLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.muted,
  },
  navLabelActive: {
    fontWeight: "700",
    color: colors.primary,
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  bottomSection: {
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginHorizontal: 4,
    marginBottom: 8,
    marginTop: 4,
  },
});
