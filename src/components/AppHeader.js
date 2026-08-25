import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, colors, resolveNeutrals } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";
import { useAppStyles } from "../hooks/useAppStyles";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export const AppHeader = ({
  onSearchPress,
  onStoresPress,
  onNotificationsPress,
  onAccountPress,
}) => {
  const { isWide, horizontalPadding } = useResponsive();
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const { user, profile } = useAuth();

  // Store accounts (profile.role === "seller") show the store logo from
  // express_sellers; everyone else falls back to the profile avatar_url.
  // The profile role is the source of truth for seller detection (same rule
  // as AccountScreen) — we only query express_sellers for the logo itself.
  const [storeLogo, setStoreLogo] = useState(null);
  const isStoreAccount = profile?.role === "seller";

  useEffect(() => {
    if (!supabase || !isStoreAccount || !user?.id) {
      setStoreLogo(null);
      return;
    }
    let active = true;
    supabase
      .from("express_sellers")
      .select("avatar")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (active) setStoreLogo(data?.avatar || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isStoreAccount, user?.id]);

  // Profile photo for customers, store logo for store accounts, null → icon.
  const avatarUri = isStoreAccount ? storeLogo : profile?.avatar_url || null;
  // The tagit logo always keeps its home (light) theme look — brand "tag" in
  // white, "it" in warm coral — regardless of light/dark mode. Only the
  // surrounding header adapts to the active theme.
  const logoNeutrals = resolveNeutrals("light");
  const styles = useAppStyles((c) =>
    StyleSheet.create({ 
      container: {
        paddingBottom: 16,
        backgroundColor: c.background,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      },
      containerWide: {
        // paddingTop handled dynamically via insets
      },
      topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      brandWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      },
      brandTag: {
        color: colors.light,
        fontSize: 30,
        fontWeight: "900",
        letterSpacing: 0.5,
        textShadowColor: logoNeutrals.overlay,
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      brandTagAccent: {
        color: colors.warmCoral,
        fontSize: 30,
        fontWeight: "900",
        letterSpacing: 0.5,
        textShadowColor: logoNeutrals.overlay,
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      iconButton: {
        width: 44,
        height: 44,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        // Match the FeedProductCard "Add to Cart" button: soft primary tint
        // fill + primary border, with primary-colored icons.
        backgroundColor: c.primary + "15",
        borderWidth: 1,
        borderColor: c.primary + "30",
      },
      iconRow: {
        flexDirection: "row",
        gap: 8,
      },
      // Profile photo / store logo rendered inside the account button — sized
      // to leave the tinted ring of the button visible around it.
      avatarImage: {
        width: 32,
        height: 32,
        borderRadius: radius.full,
      },
     }),
  );
  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: isWide ? horizontalPadding : 16,
          paddingTop: insets.top + 8,
        },
        isWide && styles.containerWide,
      ]}
    >
      <View style={styles.topRow}>
        {/* Account button — top-left corner (moved out of the bottom nav).
            Shows the profile photo when set; store logo for store accounts;
            person icon as the fallback. */}
        <Pressable
          style={styles.iconButton}
          onPress={onAccountPress}
          accessibilityRole="button"
          accessibilityLabel="Account"
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatarImage}
              accessibilityLabel="Account"
            />
          ) : (
            <Ionicons
              name="person-outline"
              size={20}
              color={themeColors.primary}
            />
          )}
        </Pressable>

        <View style={styles.brandWrap}>
          <Text style={styles.brandTag}>
            tag<Text style={styles.brandTagAccent}>it</Text>
          </Text>
        </View>

        {/* Search moved to the right, joining stores + notifications */}
        <View style={styles.iconRow}>
          <Pressable
            style={styles.iconButton}
            onPress={onSearchPress}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search-outline" size={20} color={themeColors.primary} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={onStoresPress}
            accessibilityRole="button"
            accessibilityLabel="Browse stores"
          >
            <Ionicons name="storefront-outline" size={20} color={themeColors.primary} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={onNotificationsPress}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={themeColors.primary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
};