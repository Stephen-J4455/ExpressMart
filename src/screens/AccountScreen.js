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
  Alert,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useOrder } from "../context/OrderContext";
import { useAds } from "../context/AdsContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { AdRenderer } from "../components/AdBanner";
import { CustomerLoadingAnimation } from "../components/CustomerLoadingAnimation";
import { useResponsive } from "../hooks/useResponsive";
import { useAppStyles } from "../hooks/useAppStyles";
import {
  R2_FOLDERS,
  uploadToR2Presigned,
  deleteMediaByUrl,
} from "../services/r2Storage";
import { supabase } from "../lib/supabase";
import { SellerAdminScreen } from "./SellerAdminScreen";
import { radius } from "../theme/colors";

import { quickActions } from "../data/quickActions";

const menuSections = [
  {
    title: "Account Settings",
    items: [
      { icon: "person-outline", label: "Edit Profile", screen: "ProfileEdit" },
      {
        icon: "notifications-outline",
        label: "Notifications",
        screen: "Notifications",
      },
      {
        icon: "shield-checkmark-outline",
        label: "Privacy & Security",
        screen: "Security",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        icon: "help-circle-outline",
        label: "Help Center",
        screen: "HelpSupport",
      },
      {
        icon: "document-text-outline",
        label: "Terms & Policies",
        screen: "Terms",
      },
    ],
  },
];

export const AccountScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, profile, isAuthenticated, loading, signOut, updateProfile } =
    useAuth();
  const { orders } = useOrder();
  const { fetchAdsByPlacement } = useAds();
  const toast = useToast();
  const {
    theme: themeMode,
    setTheme: setThemeMode,
    colors: themeColors,
  } = useTheme();
  const styles = useAppStyles((c) => buildAccountStyles(c));
  const [showLoadingPreview, setShowLoadingPreview] = useState(false);
  const [profileAds, setProfileAds] = useState([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Profile picture upload (customer avatars) ────────────────────────────
  // Mirrors SellerProfileScreen's flow: pick from gallery → read as Blob →
  // upload to R2 via presigned URL → persist public URL on express_profiles.
  const handleChangeAvatar = async () => {
    if (uploadingAvatar) return;
    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          toast.error("Gallery permission is required");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      setUploadingAvatar(true);

      // Only hand over a Blob on web (where asset.file exists). On native we
      // MUST pass null so r2Storage's readAssetBody reads the file itself
      // (base64 → bytes) — pre-converting to a React Native Blob breaks the
      // presigned PUT and makes the upload fail.
      const pickedFile = asset.file instanceof Blob ? asset.file : null;

      // Best-effort cleanup of the previous avatar (R2 or legacy Supabase).
      if (profile?.avatar_url) {
        await deleteMediaByUrl(profile.avatar_url).catch(() => {});
      }

      const { publicUrl } = await uploadToR2Presigned({
        uri: asset.uri,
        pickedFile,
        folder: `${R2_FOLDERS.PROFILE}/${user.id}`,
      });

      const { error } = await updateProfile({ avatar_url: publicUrl });
      if (error) throw error;
      toast.success("Profile photo updated");
    } catch (e) {
      console.error("Avatar upload failed:", e);
      toast.error(e.message || "Could not update profile photo");
    } finally {
      setUploadingAvatar(false);
    }
  };
  const { isWide, contentMaxWidth } = useResponsive();

  const [sellerRecord, setSellerRecord] = useState(
    // If auth profile already indicates seller role, show seller UI immediately
    profile?.role === "seller" ? {} : undefined,
  ); // undefined=checking, null=not seller, object=seller

  useEffect(() => {
    fetchAdsByPlacement("profile").then((ads) => setProfileAds(ads || []));
  }, [fetchAdsByPlacement]);

  // Detect whether the signed-in user is also a seller
  useEffect(() => {
    // If profile indicates seller role we already opened seller UI synchronously.
    if (!isAuthenticated || !user) {
      setSellerRecord(null);
      return;
    }
    if (profile?.role === "seller") {
      if (sellerRecord === undefined || sellerRecord === null) {
        setSellerRecord({});
      }
      return;
    }

    // If profile explicitly says customer, always show customer UI.
    // The role in express_profiles is the source of truth — do NOT query express_sellers.
    if (profile?.role === "customer") {
      setSellerRecord(null);
      return;
    }

    // Only query DB when profile role is not yet loaded/known.
    if (sellerRecord !== undefined) return;

    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("express_sellers")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (active) setSellerRecord(data || null);
      } catch {
        if (active) setSellerRecord(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user, profile?.role, sellerRecord]);

  const totalOrders = orders.length;
  const activeOrders = orders.filter((o) =>
    ["processing", "packed", "shipped"].includes(o.status),
  ).length;
  const totalSpent = orders
    .filter((o) => o.payment_status === "success")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.guestContainer}>
          <View style={styles.guestIconWrap}>
            <LinearGradient
              colors={[themeColors.primary + "20", themeColors.accent + "20"]}
              style={styles.guestIconBg}
            >
              <Ionicons name="person" size={48} color={themeColors.primary} />
            </LinearGradient>
          </View>
          <Text style={styles.guestTitle}>Welcome to tagit</Text>
          <Text style={styles.guestSubtitle}>
            Sign in to track orders, save favorites,{"\n"}and enjoy personalized
            shopping.
          </Text>
          <Pressable
            style={styles.signInButton}
            onPress={() =>
              navigation.navigate("Auth", {
                redirectTo: "Account",
              })
            }
          >
            <LinearGradient
              colors={[themeColors.primary, themeColors.accent]}
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
            onPress={() =>
              navigation.navigate("Auth", {
                mode: "register",
                redirectTo: "Account",
              })
            }
          >
            <Text style={styles.createAccountText}>Create Account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // While we determine whether the user is a seller, show a loader
  // (prevents a flash of the normal customer account screen).
  if (sellerRecord === undefined) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  // Sellers get a dedicated seller admin page (Facebook-style)
  if (sellerRecord !== null) {
    return (
      <SellerAdminScreen
        navigation={navigation}
        seller={sellerRecord && sellerRecord.id ? sellerRecord : undefined}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Elastic-overscroll backdrop: iOS rubber-banding reveals whatever sits
          behind the scroll view, which flashed a blank gap above the hero
          header when flung hard. A hero-colored strip up top blends the
          bounce into the header; the rest stays the page background. */}
      <View pointerEvents="none" style={styles.bounceWrap}>
        <View style={[styles.bounceTop, { backgroundColor: themeColors.primary }]} />
      </View>
      <ScrollView
        // See SellerAdminScreen: prevents Android's stuck stretch-overscroll
        // leaving a blank gap above the hero after hard flings.
        overScrollMode="never"
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: 700, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => {}} />
        }
      >
        {/* Hero Profile Header */}
        <LinearGradient
          colors={[themeColors.primary, themeColors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroHeader, { paddingTop: insets.top + 24 }]}
        >
          <View style={styles.heroTopRow}>
            <Pressable
              style={styles.avatarContainer}
              onPress={handleChangeAvatar}
              disabled={uploadingAvatar}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImage}
                />
              ) : (
                <LinearGradient
                  colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0.12)"]}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarText}>
                    {(profile?.full_name || user?.email)?.[0]?.toUpperCase() ||
                      "?"}
                  </Text>
                </LinearGradient>
              )}
              {/* Camera badge — tap target hint; swaps to a spinner while the
                  upload is in flight. */}
              {uploadingAvatar ? (
                <View
                  style={[styles.avatarCameraBadge, styles.avatarCameraUploading]}
                >
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <View style={styles.avatarCameraBadge}>
                  <Ionicons name="camera" size={11} color="#fff" />
                </View>
              )}
            </Pressable>
            <View style={styles.heroText}>
              <Text style={styles.profileName}>
                {profile?.full_name || "tagit User"}
              </Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
            <Pressable
              style={styles.editButton}
              onPress={() => navigation.navigate("ProfileEdit")}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{totalOrders}</Text>
              <Text style={styles.heroStatLabel}>Orders</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{activeOrders}</Text>
              <Text style={styles.heroStatLabel}>Active</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>
                GH₵{Math.round(totalSpent).toLocaleString()}
              </Text>
              <Text style={styles.heroStatLabel}>Spent</Text>
            </View>
          </View>
        </LinearGradient>

        {profileAds.length > 0 && (
          <View style={styles.adSection}>
            <AdRenderer ads={profileAds} />
          </View>
        )}

        {/* Register a Store Banner */}
        <View style={styles.registerStoreSection}>
          <LinearGradient
            colors={[themeColors.primary, themeColors.accent]}
            style={styles.registerStoreGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.registerStoreTextWrap}>
              <Text style={styles.registerStoreTitle}>Sell on tagit</Text>
              <Text style={styles.registerStoreSubtitle}>
                Open your own store and reach thousands of customers.
              </Text>
            </View>
            <Pressable
              style={styles.registerStoreButton}
              onPress={() => navigation.navigate("StoreRegistration")}
            >
              <Ionicons
                name="storefront"
                size={18}
                color={themeColors.primary}
              />
              <Text style={styles.registerStoreButtonText}>
                Register a Store
              </Text>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsCard}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                style={styles.quickActionCard}
                onPress={() => navigation.navigate(action.screen)}
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: action.bg },
                  ]}
                >
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
                  onPress={() =>
                    item.screen && navigation.navigate(item.screen)
                  }
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconContainer}>
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={themeColors.primary}
                      />
                    </View>
                    <Text style={styles.menuItemLabel}>{item.label}</Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={themeColors.muted}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Appearance / Theme */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.menuCard}>
            {[
              { key: "light", label: "Light", icon: "sunny-outline" },
              { key: "dark", label: "Dark", icon: "moon-outline" },
              {
                key: "system",
                label: "System",
                icon: "phone-portrait-outline",
              },
            ].map((opt, index) => {
              const selected = themeMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.menuItem, index < 2 && styles.menuItemBorder]}
                  onPress={() => setThemeMode(opt.key)}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconContainer}>
                      <Ionicons
                        name={opt.icon}
                        size={20}
                        color={themeColors.primary}
                      />
                    </View>
                    <Text style={styles.menuItemLabel}>{opt.label}</Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={themeColors.primary}
                      />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={themeColors.muted}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sign Out Button */}
        <View style={styles.signOutSection}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* App Version - Clickable */}
        <Pressable onPress={() => setShowLoadingPreview(true)}>
          <Text style={styles.versionText}>tagit v1.0.1</Text>
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
              <Ionicons name="close" size={24} color={themeColors.dark} />
            </View>
          </Pressable>
          <CustomerLoadingAnimation />
        </View>
      </Modal>
    </View>
  );
};

const buildAccountStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingBottom: 60,
    },
    scrollContent: {
      flexGrow: 1,
      // Opaque so the bounce backdrop behind the scroll view only shows
      // during overscroll, never between sections while scrolling normally.
      backgroundColor: c.background,
    },
    // ── Elastic-overscroll backdrop (see return) ────────────────────────────
    bounceWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    bounceTop: { height: 600 },
    centerContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.light,
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
      color: c.dark,
      letterSpacing: -0.5,
    },
    guestSubtitle: {
      fontSize: 15,
      color: c.muted,
      textAlign: "center",
      marginTop: 10,
      lineHeight: 22,
    },
    signInButton: {
      marginTop: 32,
      borderRadius: radius.lg,
      overflow: "hidden",
      width: "100%",
      shadowColor: c.primary,
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
      color: c.light,
      fontSize: 16,
      fontWeight: "700",
    },
    createAccountButton: {
      marginTop: 16,
      paddingVertical: 14,
      paddingHorizontal: 24,
    },
    createAccountText: {
      color: c.primary,
      fontSize: 15,
      fontWeight: "600",
    },

    // Hero Profile Header
    heroHeader: {
      paddingHorizontal: 20,
      paddingBottom: 24,
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    adSection: {
      paddingTop: 8,
      paddingBottom: 6,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 22,
    },
    avatarContainer: {
      position: "relative",
      marginRight: 14,
    },
    avatarGradient: {
      width: 64,
      height: 64,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.45)",
    },
    avatarText: {
      fontSize: 26,
      fontWeight: "800",
      color: c.light,
    },
    avatarImage: {
      width: 64,
      height: 64,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.45)",
    },
    avatarCameraBadge: {
      position: "absolute",
      bottom: -3,
      right: -3,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.dark,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#fff",
    },
    avatarCameraUploading: {
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    onlineDot: {
      position: "absolute",
      bottom: 2,
      right: 2,
      width: 15,
      height: 15,
      borderRadius: 7.5,
      backgroundColor: "#22C55E",
      borderWidth: 2.5,
      borderColor: c.primary,
    },
    heroText: {
      flex: 1,
      justifyContent: "center",
    },
    profileName: {
      fontSize: 20,
      fontWeight: "800",
      color: c.light,
      letterSpacing: -0.3,
    },
    profileEmail: {
      fontSize: 13,
      color: "rgba(255,255,255,0.85)",
      marginTop: 3,
    },
    editButton: {
      width: 42,
      height: 42,
      borderRadius: radius.xl,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroStats: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
      borderRadius: 18,
      paddingVertical: 16,
    },
    heroStat: {
      flex: 1,
      alignItems: "center",
    },
    heroStatValue: {
      fontSize: 19,
      fontWeight: "800",
      color: c.light,
    },
    heroStatLabel: {
      fontSize: 11,
      color: "rgba(255,255,255,0.85)",
      marginTop: 4,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    heroStatDivider: {
      width: 1,
      height: 32,
      backgroundColor: "rgba(255,255,255,0.25)",
    },

    // Membership Card
    memberCard: {
      borderRadius: 20,
      padding: 18,
      backgroundColor: c.surface,
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
      color: c.dark,
      fontSize: 14,
      fontWeight: "600",
    },
    memberCardBottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      backgroundColor: c.light,
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
      color: c.dark,
    },
    memberStatLabel: {
      fontSize: 11,
      color: c.muted,
      marginTop: 4,
      fontWeight: "500",
    },
    memberStatDivider: {
      width: 1,
      height: 30,
      backgroundColor: c.border,
    },

    // Register a Store Banner
    registerStoreSection: {
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    registerStoreGradient: {
      borderRadius: 20,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    registerStoreTextWrap: {
      flex: 1,
      paddingRight: 12,
    },
    registerStoreTitle: {
      color: c.light,
      fontSize: 17,
      fontWeight: "800",
    },
    registerStoreSubtitle: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 12,
      marginTop: 4,
      lineHeight: 18,
    },
    registerStoreButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.light,
      borderRadius: radius.xl,
      paddingVertical: 11,
      paddingHorizontal: 16,
      gap: 6,
    },
    registerStoreButtonText: {
      color: c.primary,
      fontWeight: "800",
      fontSize: 13,
    },

    // Quick Actions
    quickActionsSection: {
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 14,
      letterSpacing: -0.3,
    },
    quickActionsCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      paddingVertical: 18,
      paddingHorizontal: 12,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    quickActionCard: {
      width: "23%",
      alignItems: "center",
    },
    quickActionIcon: {
      width: 54,
      height: 54,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    quickActionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: c.dark,
    },

    // Menu Sections
    menuSection: {
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    menuCard: {
      backgroundColor: c.surface,
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
      borderBottomColor: c.border,
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
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    menuItemLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: c.dark,
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
      backgroundColor: c.light,
      borderRadius: radius.xl,
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
      color: c.muted,
      fontSize: 12,
      marginTop: 24,
    },

    // Modal styles
    modalContainer: {
      flex: 1,
      backgroundColor: c.light,
    },
    closeButton: {
      position: "absolute",
      top: 60,
      right: 20,
      zIndex: 10,
    },
    closeButtonInner: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: c.light,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.dark,
      shadowOpacity: 0.1,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 4,
    },
  });
