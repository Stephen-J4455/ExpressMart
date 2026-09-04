import "react-native-gesture-handler";
import {
  NavigationContainer,
  DefaultTheme,
  getStateFromPath as defaultGetStateFromPath,
} from "@react-navigation/native";
import { navigationRef } from "./src/utils/navigationRef";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  Text,
  View,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Octicons } from "@expo/vector-icons";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { subscribeTabBarVisibility } from "./src/utils/tabBarAutoHide";
import { radius } from "./src/theme/colors";
import * as Linking from "expo-linking";
import { useResponsive } from "./src/hooks/useResponsive";
import { useAppStyles } from "./src/hooks/useAppStyles";
import { WebSidebar } from "./src/components/WebSidebar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { CartProvider, useCart } from "./src/context/CartContext";
import { ShopProvider } from "./src/context/ShopContext";
import { OrderProvider } from "./src/context/OrderContext";
import { FeedPersonalizationBoot } from "./src/components/FeedPersonalizationBoot";
import { ToastProvider } from "./src/context/ToastContext";
import { ChatProvider } from "./src/context/ChatContext";
import { AdsProvider } from "./src/context/AdsContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import { TagAIAssistantProvider } from "./src/context/TagAIAssistantContext";
import { ScreenPointerOverlay } from "./src/components/tagai/ScreenPointerOverlay";
import { TagAIAssistantScreen } from "./src/screens/TagAIAssistantScreen";
import { FeedScreen } from "./src/screens/FeedScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { SearchResultsScreen } from "./src/screens/SearchResultsScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CheckoutScreen } from "./src/screens/CheckoutScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { OrderDetailScreen } from "./src/screens/OrderDetailScreen";
import { OrderSuccessScreen } from "./src/screens/OrderSuccessScreen";
import { CollectionsScreen } from "./src/screens/CollectionsScreen";
import { CollectionDetailScreen } from "./src/screens/CollectionDetailScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { AddressesScreen } from "./src/screens/AddressesScreen";
import { PaymentsScreen } from "./src/screens/PaymentsScreen";
import { FollowingScreen } from "./src/screens/FollowingScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SecurityScreen } from "./src/screens/SecurityScreen";
import { HelpSupportScreen } from "./src/screens/HelpSupportScreen";
import { CategoryProductsScreen } from "./src/screens/CategoryProductsScreen";
import { CategoriesScreen } from "./src/screens/CategoriesScreen";
import { StoreScreen } from "./src/screens/StoreScreen";
import { StoresScreen } from "./src/screens/StoresScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import PasswordResetScreen from "./src/screens/PasswordResetScreen";
import { ProfileEditScreen } from "./src/screens/ProfileEditScreen";
import { SellerProfileScreen } from "./src/screens/SellerProfileScreen";
import { ChangePasswordScreen } from "./src/screens/ChangePasswordScreen";
import { ChangeEmailScreen } from "./src/screens/ChangeEmailScreen";
import { PrivacySettingsScreen } from "./src/screens/PrivacySettingsScreen";
import { PrivacyPolicyScreen } from "./src/screens/PrivacyPolicyScreen";
import { TermsScreen } from "./src/screens/TermsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import {
  ChatsScreen,
  prefetchChatsScreenData,
} from "./src/screens/ChatsScreen";
import { useShop } from "./src/context/ShopContext";
import { useAds } from "./src/context/AdsContext";
import { SellerChatScreen } from "./src/screens/SellerChatScreen";
import { StatusViewer } from "./src/screens/StatusViewer";
import StatusCreatorScreen from "./src/screens/StatusCreatorScreen";
import { PaymentWebViewScreen } from "./src/screens/PaymentWebViewScreen";
import { StoreRegistrationScreen } from "./src/screens/StoreRegistrationScreen";

// PasswordResetScreen handles recovery links on both web and native.

import { supabase } from "./src/lib/supabase";
import React, { useEffect, useMemo, useRef } from "react";
import { syncPaystackVerification } from "./src/services/payment";
import UpdateModal from "./src/components/UpdateModal";
import { checkForUpdate } from "./src/services/updateService";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MOBILE_TAB_BAR_PADDING_BOTTOM = 10;

const TabNavigator = () => {
  const { items } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const { isWide, sidebarWidth } = useResponsive();
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarPosition: isWide ? "left" : "bottom",
        tabBarStyle: isWide
          ? { width: sidebarWidth, borderRightWidth: 0 }
          : {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 0,
              backgroundColor: "transparent",
              borderTopWidth: 0,
            },
      }}
      tabBar={(props) =>
        isWide ? (
          <WebSidebar {...props} sidebarWidth={sidebarWidth} />
        ) : (
          <DefaultTabBar {...props} cartCount={cartCount} />
        )
      }
    >
      <Tab.Screen
        name="Home"
        component={TransitionedHomeScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Chats"
        component={TransitionedChatsScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Feed"
        component={TransitionedFeedScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={TransitionedCartScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "cart" : "cart-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={TransitionedAccountScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

/**
 * AnimatedScreen — wraps tab screen content with a quick fade + subtle
 * upward-slide transition that plays when the tab mounts (first focus),
 * giving tab switches a polished entrance without a heavy animation library.
 */
const AnimatedScreen = ({ children }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/**
 * withTabTransition — HOC that keeps React Navigation's injected props
 * (navigation, route) intact while wrapping the screen in AnimatedScreen.
 * Using Tab.Screen's `children` prop instead would strip those props and
 * crash any screen that calls navigation.navigate.
 *
 * IMPORTANT: the wrapped screens below are created ONCE at module level.
 * Calling withTabTransition(...) inline inside the JSX would produce a new
 * component type on every TabNavigator render (e.g. whenever a toast shows),
 * causing React to unmount + remount the whole tab screen.
 */
const withTabTransition = (Wrapped) => {
  // Guard against undefined screens (e.g. a stale/hot-reloaded module or a
  // broken import resolving to undefined). Previously this line crashed the
  // whole app with "[TypeError: Cannot read property 'displayName' of
  // undefined]" before React could even render a helpful message.
  if (!Wrapped) {
    console.warn(
      "[App] withTabTransition received an undefined screen component. " +
        "Check the import for the screen passed to it.",
    );
  }
  const Transitioned = (props) => (
    <AnimatedScreen>{Wrapped ? <Wrapped {...props} /> : null}</AnimatedScreen>
  );
  Transitioned.displayName = `withTabTransition(${
    (Wrapped && (Wrapped.displayName || Wrapped.name)) || "Screen"
  })`;
  return Transitioned;
};

const TransitionedHomeScreen = withTabTransition(HomeScreen);
const TransitionedFeedScreen = withTabTransition(FeedScreen);
const TransitionedCartScreen = withTabTransition(CartScreen);
const TransitionedAccountScreen = withTabTransition(AccountScreen);

/** Floating pill bottom tab bar (mobile) — a rounded theme-aware pill with the
 *  main tabs (icon-only, active tab gets a soft primary-tint highlight like the
 *  header icon buttons) plus a detached circular TagAI button on the
 *  right.
 *  The Account tab lives in the Home header now (top-left), so it is filtered
 *  out of the bar — but its Tab.Screen stays registered so
 *  navigation.navigate("Main", { screen: "Account" }) deep-links keep working.
 *  Auto-hides when tab screens report upward scrolling and slides back in on
 *  downward scrolling (see src/utils/tabBarAutoHide.js). */
const DefaultTabBar = ({ state, descriptors, navigation, cartCount }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? insets.bottom : 0;
  const { colors, isDark } = useTheme();

  const [hidden, setHidden] = React.useState(false);
  // 1 = fully visible, 0 = fully hidden (drives slide + fade together)
  const visibility = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsubscribe = subscribeTabBarVisibility((shouldHide) => {
      setHidden(shouldHide);
      Animated.timing(visibility, {
        toValue: shouldHide ? 0 : 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    return unsubscribe;
  }, [visibility]);

  // Account is rendered in the Home header — keep the route, drop the tab.
  const tabs = state.routes.filter((route) => route.name !== "Account");
  const focusedKey = state.routes[state.index]?.key;
  // Theme-aware pill surface: near-white glass in light mode; in dark mode the
  // app theme's DARK BACKGROUND token (colors.background = #070B14) instead of
  // a hard-coded charcoal. Shared by the tab pill and the AI button.
  const pillSurface = isDark ? colors.background : "rgba(255, 255, 255, 0.98)";
  const pillBorder = isDark ? "rgba(255, 255, 255, 0.08)" : colors.border;
  const activeColor = colors.primary;
  const inactiveColor = colors.muted;

  return (
    <Animated.View
      pointerEvents={hidden ? "none" : "auto"}
      style={[
        tabStyles.dockedWrapper,
        {
          transform: [
            {
              // Fixed clearance (icon block + paddings + worst-case safe area)
              // guarantees the bar ends up entirely off-screen — no sliver left.
              translateY: visibility.interpolate({
                inputRange: [0, 1],
                outputRange: [130 + bottomInset, 0],
              }),
            },
          ],
          opacity: visibility,
        },
      ]}
    >
      <View
        style={[
          tabStyles.barRow,
          {
            paddingBottom: Math.max(bottomInset, MOBILE_TAB_BAR_PADDING_BOTTOM),
          },
        ]}
      >
        {/* Floating pill with the main tabs */}
        <View
          style={[
            tabStyles.pill,
            { backgroundColor: pillSurface, borderColor: pillBorder },
          ]}
        >
          {tabs.map((route) => {
            const { options } = descriptors[route.key];
            const isFocused = route.key === focusedKey;
            const color = isFocused ? activeColor : inactiveColor;
            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented)
                navigation.navigate(route.name);
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={({ pressed }) => [
                  tabStyles.tab,
                  // Active tab matches the header icon buttons: soft primary
                  // tint fill + primary border (same recipe as the FeedProduct
                  // "Add to Cart" pill).
                  isFocused && [
                    tabStyles.tabActive,
                    {
                      backgroundColor: colors.primary + "15",
                      borderColor: colors.primary + "30",
                    },
                  ],
                  pressed && tabStyles.tabPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={route.name}
              >
                <View style={tabStyles.iconWrap}>
                  {options.tabBarIcon({ color, size: 24, focused: isFocused })}
                  {route.name === "Cart" && cartCount > 0 && (
                    <View
                      style={[
                        tabStyles.badge,
                        {
                          backgroundColor: colors.primary,
                          // Ring matches the pill surface (light/dark aware).
                          borderColor: isDark ? "#1C1C1E" : "#fff",
                        },
                      ]}
                    >
                      <Text style={tabStyles.badgeText}>{cartCount}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Detached circular TagAI button */}
        <Pressable
          onPress={() => navigation.navigate("TagAI")}
          style={({ pressed }) => [
            tabStyles.aiButton,
            { backgroundColor: pillSurface, borderColor: pillBorder },
            pressed && tabStyles.tabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="TagAI"
        >
          <Ionicons name="sparkles" size={24} color={activeColor} />
        </Pressable>
      </View>
    </Animated.View>
  );
};

const tabStyles = StyleSheet.create({
  // Floating wrapper pinned to the bottom edge. Fully transparent — the pill
  // and AI button carry their own translucent surfaces + shadows.
  dockedWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.full,
    // Transparent border reserved on every tab so the active tab's primary
    // border doesn't shift layout when it appears.
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: {
    // backgroundColor applied inline from the theme (light/dark aware)
  },
  tabPressed: {
    opacity: 0.6,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  aiButton: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    // borderColor applied inline from the theme (matches the pill surface)
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});

// Build the navigation theme from the resolved, context-driven palette. The
// `colors` reference is stable per theme (memoized in ThemeProvider), so this
// produces a stable object unless the theme actually changes — which is exactly
// what React Navigation needs to re-style without remounting.
const createNavTheme = (palette, isDark) => ({
  ...DefaultTheme,
  dark: isDark,
  colors: {
    ...DefaultTheme.colors,
    background: palette.light,
    card: palette.surface,
    border: palette.border,
    text: palette.dark,
    primary: palette.primary,
  },
});

const LoginRequiredScreen = ({
  navigation,
  routeName,
  routeParams,
  title = "Login required",
  message = "Please sign in to use this feature.",
}) => {
  const { colors } = useTheme();
  const styles = useAppStyles((c) =>
    StyleSheet.create({
      container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: c.background,
      },
      title: {
        marginTop: 12,
        fontSize: 24,
        fontWeight: "800",
        color: c.dark,
      },
      message: {
        marginTop: 8,
        textAlign: "center",
        color: c.muted,
        fontSize: 15,
        lineHeight: 22,
        maxWidth: 360,
      },
      button: {
        borderRadius: 14,
        overflow: "hidden",
        marginTop: 24,
      },
      buttonGradient: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 14,
      },
      buttonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
      },
    }),
  );
  return (
    <View style={styles.container}>
      <Ionicons name="lock-closed-outline" size={52} color={colors.primary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={styles.button}
        onPress={() =>
          navigation.navigate("Auth", {
            redirectTo: routeName,
            redirectParams: routeParams,
          })
        }
      >
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          style={styles.buttonGradient}
        >
          <Ionicons name="log-in-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Login to continue</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
};

// only handle our custom URI schemes here; web links will stay in browser
const prefixes = [
  Linking.createURL("/"),
  "expressmart://",
  "https://www.expressmart.me",
  "https://expressmart.me",
];
if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
  prefixes.push(window.location.origin);
}

const getUrlParamsFromValue = (value) => {
  const raw = String(value || "");
  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");
  const hasQuery = queryIndex >= 0 && (hashIndex < 0 || queryIndex < hashIndex);
  const query = hasQuery
    ? raw.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
    : "";
  const hash = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
  return {
    queryParams: new URLSearchParams(query),
    hashParams: new URLSearchParams(hash),
  };
};

const isWebRecoveryResetLink = (value) => {
  if (Platform.OS !== "web") return false;

  const raw = String(value || "");
  const normalized = raw.toLowerCase();
  const hasWebResetScreen =
    normalized.includes("screen=reset-password") ||
    normalized.includes("screen=password-reset");
  const hasResetPath =
    normalized.includes("reset-password") ||
    normalized.includes("password-reset");
  const hasAppSource = normalized.includes("source=app");
  const isAuthCallback = normalized.includes("auth/callback");
  if (isAuthCallback) return false;

  const { queryParams, hashParams } = getUrlParamsFromValue(raw);
  const getParam = (name) =>
    hashParams.get(name) || queryParams.get(name) || "";

  const type = String(getParam("type")).toLowerCase();
  const tokenHash = getParam("token_hash");
  const oneTimeToken = getParam("token");
  const accessToken = getParam("access_token");
  const refreshToken = getParam("refresh_token");

  if (type === "recovery") return true;
  if (tokenHash || oneTimeToken) return true;
  if (
    (accessToken || refreshToken) &&
    (hasResetPath || hasWebResetScreen || hasAppSource)
  ) {
    return true;
  }

  return false;
};

const normalizeRecoveryDeepLink = (url) => {
  if (!url) return url;

  const raw = String(url);
  const normalized = raw.toLowerCase();
  const hasWebResetScreen =
    normalized.includes("screen=reset-password") ||
    normalized.includes("screen=password-reset");
  const hasResetPath =
    normalized.includes("reset-password") ||
    normalized.includes("password-reset");
  const hasAppSource = normalized.includes("source=app");
  const isNativeResetDeepLink =
    normalized.startsWith("expressmart://reset-password") ||
    normalized.startsWith("expressmart://password-reset");
  const hasRecoveryType = normalized.includes("type=recovery");
  const hasRecoveryToken =
    normalized.includes("access_token=") ||
    normalized.includes("refresh_token=") ||
    normalized.includes("token_hash=") ||
    normalized.includes("token=");
  const isAuthCallback = normalized.includes("auth/callback");
  const isNativeRecoveryDeepLink =
    hasRecoveryType || (hasRecoveryToken && !isAuthCallback);
  const isRecoveryDeepLink =
    Platform.OS === "web"
      ? isWebRecoveryResetLink(raw)
      : isNativeRecoveryDeepLink;

  if (Platform.OS === "web" && hasWebResetScreen) {
    const hashIndex = raw.indexOf("#");
    const queryIndex = raw.indexOf("?");
    const hasQuery =
      queryIndex >= 0 && (hashIndex < 0 || queryIndex < hashIndex);
    const query = hasQuery
      ? raw.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";
    const hash = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
    const queryPart = query ? `?${query}` : "";
    const hashPart = hash ? `#${hash}` : "";
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    return `${origin}/reset-password${queryPart}${hashPart}`;
  }
  if (hasResetPath && isNativeResetDeepLink) return raw;

  if ((hasResetPath && hasAppSource) || isRecoveryDeepLink) {
    const hashIndex = raw.indexOf("#");
    const queryIndex = raw.indexOf("?");
    const hasQuery =
      queryIndex >= 0 && (hashIndex < 0 || queryIndex < hashIndex);
    const query = hasQuery
      ? raw.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";
    const hash = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";
    const queryPart = query ? `?${query}` : "";
    const hashPart = hash ? `#${hash}` : "";

    if (Platform.OS === "web") {
      const origin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "";
      return `${origin}/reset-password${queryPart}${hashPart}`;
    }

    return `expressmart://reset-password${queryPart}${hashPart}`;
  }

  if (hasResetPath) return raw;

  return raw;
};

const isGoogleOAuthCallbackLink = (value) => {
  const normalized = String(value || "").toLowerCase();
  return normalized.includes("auth/callback");
};

const isRecoveryResetLink = (value) => {
  if (Platform.OS === "web") {
    return isWebRecoveryResetLink(value);
  }

  const normalized = String(value || "").toLowerCase();
  const hasRecoveryType = normalized.includes("type=recovery");
  const hasRecoveryToken =
    normalized.includes("access_token=") ||
    normalized.includes("refresh_token=") ||
    normalized.includes("token_hash=") ||
    normalized.includes("token=");
  return hasRecoveryType || hasRecoveryToken;
};

const isWebResetScreenUrl = (value) => {
  if (Platform.OS !== "web") return false;
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.includes("screen=reset-password") ||
    normalized.includes("screen=password-reset")
  );
};

const hasResetPasswordPath = (value) => {
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.includes("reset-password") ||
    normalized.includes("password-reset")
  );
};

const linking = {
  prefixes,
  getInitialURL: async () => {
    const initialUrl = await Linking.getInitialURL();
    return normalizeRecoveryDeepLink(initialUrl);
  },
  subscribe: (listener) => {
    const onReceiveUrl = ({ url }) => {
      listener(normalizeRecoveryDeepLink(url));
    };
    const subscription = Linking.addEventListener("url", onReceiveUrl);
    return () => subscription.remove();
  },
  getStateFromPath: (path, options) => {
    const normalizedPath = String(path || "");
    const webHref =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.href
        : "";

    if (
      webHref &&
      isRecoveryResetLink(webHref) &&
      !isGoogleOAuthCallbackLink(webHref)
    ) {
      return {
        index: 0,
        routes: [{ name: "ResetPassword", params: { initialUrl: webHref } }],
      };
    }

    if (isWebResetScreenUrl(normalizedPath)) {
      return {
        index: 0,
        routes: [{ name: "ResetPassword", params: { initialUrl: path } }],
      };
    }

    if (
      isRecoveryResetLink(normalizedPath) &&
      !isGoogleOAuthCallbackLink(normalizedPath)
    ) {
      return {
        index: 0,
        routes: [{ name: "ResetPassword", params: { initialUrl: path } }],
      };
    }

    const state = defaultGetStateFromPath(path, options);
    if (state) return state;

    if (hasResetPasswordPath(normalizedPath)) {
      return {
        index: 0,
        routes: [{ name: "ResetPassword", params: { initialUrl: path } }],
      };
    }

    return state;
  },
  config: {
    screens: {
      Main: {
        screens: {
          Home: "home",
          Chats: "messages",
          Feed: "feed",
          Cart: "cart",
          Account: "account",
        },
      },
      Stores: "stores",
      Auth: "login",
      ForgotPassword: "forgot-password",
      ResetPassword: "reset-password",
      Checkout: {
        path: "checkout",
        parse: {
          payment: (payment) => payment,
          reference: (reference) => reference,
          order_id: (order_id) => order_id,
        },
      },
      PaymentWebView: "payment",
      Orders: "orders",
      OrderDetail: {
        path: "orders/:orderId",
        parse: {
          orderId: (orderId) => orderId,
        },
      },
      ProductDetail: {
        path: "product/:productId",
        parse: {
          productId: (productId) => productId,
        },
      },
      // SKU-based deep links (tagit://product/[sku], /p/[sku]) route to the
      // same PDP; the screen resolves the SKU and handles ?action=add_to_cart.
      ProductDetailBySku: {
        path: "p/:sku",
        parse: {
          sku: (sku) => sku,
        },
      },
      Store: {
        path: "store/:sellerId",
        parse: {
          sellerId: (sellerId) => sellerId,
        },
      },
      CategoryProducts: {
        path: "category/:categoryId",
        parse: {
          categoryId: (categoryId) => categoryId,
        },
      },
      Categories: "categories",
      Chat: {
        path: "chat/:sellerId",
        parse: {
          sellerId: (sellerId) => sellerId,
        },
      },
      SearchResults: {
        path: "search",
        parse: {
          query: (query) => query,
        },
      },
      Notifications: "notifications",
      Collections: "collections",
      CollectionDetail: {
        path: "collections/:collectionId",
        parse: {
          collectionId: (collectionId) => collectionId,
        },
      },
      Addresses: "addresses",
      Payments: "payments",
      Following: "following",
      Settings: "settings",
      Security: "security",
      ProfileEdit: "profile/edit",
      SellerProfile: "seller/profile",
      StatusViewer: "status/:sellerId",
      StoreRegistration: "store-registration",
      HelpSupport: "help",
      Terms: "terms",
      PrivacyPolicy: "privacy",
      PrivacySettings: "privacy/settings",
      ChangePassword: "change-password",
      ChangeEmail: "change-email",
    },
  },
};

const guardedScreenCache = new Map();
const withAuthGate = (Component, title, message) => {
  if (!guardedScreenCache.has(Component)) {
    const GuardedScreen = (props) => {
      const { isAuthenticated } = useAuth();
      if (isAuthenticated) {
        return <Component {...props} />;
      }

      return (
        <LoginRequiredScreen
          navigation={props.navigation}
          routeName={props.route?.name}
          routeParams={props.route?.params}
          title={title}
          message={message}
        />
      );
    };
    guardedScreenCache.set(Component, GuardedScreen);
  }

  return guardedScreenCache.get(Component);
};

// Guarded + transitioned Chats for the bottom tab bar. Created ONCE at module
// level (like the other Transitioned* screens) so the tab never remounts when
// TabNavigator re-renders.
const TransitionedChatsScreen = withTabTransition(
  withAuthGate(
    ChatsScreen,
    "Login to view chats",
    "Please sign in to access your conversations.",
  ),
);

const AuthenticatedApp = () => {
  const { isAuthenticated, user } = useAuth();
  const [updateInfo, setUpdateInfo] = React.useState(null);
  const [updateVisible, setUpdateVisible] = React.useState(false);

  // ── Background warm-up for the Chats screen ───────────────────────────────
  // Kicks off every ChatsScreen fetch (seller conversations, followed-seller
  // statuses, story ads) as soon as the user is signed in — fire-and-forget.
  // By the time the user opens Messages, the data is already cached and the
  // list renders populated instead of empty/loading.
  const { followedSellers } = useShop();
  const { fetchAdsByPlacement } = useAds();
  React.useEffect(() => {
    if (!isAuthenticated || !user) return;
    prefetchChatsScreenData({ user, followedSellers, fetchAdsByPlacement });
  }, [isAuthenticated, user, followedSellers, fetchAdsByPlacement]);

  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const res = await checkForUpdate("customer");
        if (!mounted || !res) return;
        if (res.updateAvailable) {
          setUpdateInfo(res.updateRow);
          setUpdateVisible(true);
        }
      } catch (e) {
        console.warn("update check failed", e);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  // NOTE: Native splash hiding was moved to OnboardingGate. It used to live
  // here, but AuthenticatedApp only mounts once onboarding is finished, so on
  // a first launch preventAutoHideAsync() kept the splash up forever and the
  // onboarding screen stayed hidden behind it.

  const GuardedCheckout = withAuthGate(
    CheckoutScreen,
    "Login to checkout",
    "Please sign in to place your order and manage your payments.",
  );
  const GuardedOrders = withAuthGate(
    OrdersScreen,
    "Login to view orders",
    "Please sign in to see your order history.",
  );
  const GuardedOrderDetail = withAuthGate(
    OrderDetailScreen,
    "Login to view order details",
    "Please sign in to access this order information.",
  );
  const GuardedCollections = withAuthGate(
    CollectionsScreen,
    "Login to view your collections",
    "Please sign in to access your saved items.",
  );
  const GuardedCollectionDetail = withAuthGate(
    CollectionDetailScreen,
    "Login to view this collection",
    "Please sign in to access your saved items.",
  );
  const GuardedNotifications = withAuthGate(
    NotificationsScreen,
    "Login to view notifications",
    "Please sign in to see your account notifications.",
  );
  const GuardedAddresses = withAuthGate(
    AddressesScreen,
    "Login to manage addresses",
    "Please sign in to view and edit your delivery addresses.",
  );
  const GuardedPayments = withAuthGate(
    PaymentsScreen,
    "Login to manage payments",
    "Please sign in to manage your payment methods.",
  );
  const GuardedFollowing = withAuthGate(
    FollowingScreen,
    "Login to view following",
    "Please sign in to access the stores and sellers you follow.",
  );
  const GuardedSettings = withAuthGate(
    SettingsScreen,
    "Login to open settings",
    "Please sign in to manage your account settings.",
  );
  const GuardedSecurity = withAuthGate(
    SecurityScreen,
    "Login to manage security",
    "Please sign in to manage security and privacy options.",
  );
  const GuardedProfileEdit = withAuthGate(
    ProfileEditScreen,
    "Login to edit profile",
    "Please sign in to update your profile.",
  );
  const GuardedSellerProfile = withAuthGate(
    SellerProfileScreen,
    "Login to view store profile",
    "Please sign in to access your store profile.",
  );
  const GuardedChangePassword = withAuthGate(
    ChangePasswordScreen,
    "Login to change password",
    "Please sign in to update your password.",
  );
  const GuardedChangeEmail = withAuthGate(
    ChangeEmailScreen,
    "Login to change email",
    "Please sign in to update your email address.",
  );
  const GuardedPrivacySettings = withAuthGate(
    PrivacySettingsScreen,
    "Login to manage privacy",
    "Please sign in to manage your privacy settings.",
  );
  const GuardedChat = withAuthGate(
    ChatScreen,
    "Login to start chat",
    "Please sign in to message sellers and support.",
  );
  const GuardedChats = withAuthGate(
    ChatsScreen,
    "Login to view chats",
    "Please sign in to access your conversations.",
  );
  const GuardedStatusCreator = withAuthGate(
    StatusCreatorScreen,
    "Login to post status",
    "Please sign in to post a store status.",
  );

  return (
    <NotificationProvider userId={user?.id}>
      <UpdateModal
        visible={updateVisible}
        update={updateInfo}
        force={updateInfo?.force_update}
        onClose={() => setUpdateVisible(false)}
      />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          animationDuration: 0.3,
        }}
      >
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={PasswordResetScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        <Stack.Screen
          name="CategoryProducts"
          component={CategoryProductsScreen}
        />
        <Stack.Screen name="Categories" component={CategoriesScreen} />
        <Stack.Screen name="Store" component={StoreScreen} />
        <Stack.Screen name="Stores" component={StoresScreen} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen
          name="ProductDetailBySku"
          component={ProductDetailScreen}
        />
        <Stack.Screen name="Chat" component={GuardedChat} />
        <Stack.Screen name="Chats" component={GuardedChats} />
        <Stack.Screen name="SellerChat" component={SellerChatScreen} />
        <Stack.Screen name="StatusViewer" component={StatusViewer} />
        <Stack.Screen name="StatusCreator" component={GuardedStatusCreator} />
        <Stack.Screen name="Checkout" component={GuardedCheckout} />
        <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} />
        <Stack.Screen
          name="StoreRegistration"
          component={StoreRegistrationScreen}
        />
        <Stack.Screen name="Orders" component={GuardedOrders} />
        <Stack.Screen name="OrderDetail" component={GuardedOrderDetail} />
        <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} />
        <Stack.Screen name="Collections" component={GuardedCollections} />
        <Stack.Screen name="CollectionDetail" component={GuardedCollectionDetail} />
        <Stack.Screen name="Notifications" component={GuardedNotifications} />
        <Stack.Screen name="Addresses" component={GuardedAddresses} />
        <Stack.Screen name="Payments" component={GuardedPayments} />
        <Stack.Screen name="Following" component={GuardedFollowing} />
        <Stack.Screen name="Settings" component={GuardedSettings} />
        <Stack.Screen name="Security" component={GuardedSecurity} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="ProfileEdit" component={GuardedProfileEdit} />
        <Stack.Screen name="SellerProfile" component={GuardedSellerProfile} />
        <Stack.Screen name="ChangePassword" component={GuardedChangePassword} />
        <Stack.Screen name="ChangeEmail" component={GuardedChangeEmail} />
        <Stack.Screen
          name="PrivacySettings"
          component={GuardedPrivacySettings}
        />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="TagAI" component={TagAIAssistantScreen} />
      </Stack.Navigator>
    </NotificationProvider>
  );
};

const DeepLinkHandler = () => {
  const { setIsRecoveryMode } = useAuth();

  React.useEffect(() => {
    let mounted = true;

    const handleDeepLink = async (url) => {
      try {
        if (!url) return;
        if (Platform.OS === "web") return;
        if (hasResetPasswordPath(url)) return;

        // Extract params from hash or query
        let params = null;
        if (url.includes("#")) {
          const hash = url.split("#")[1];
          params = new URLSearchParams(hash);
        } else if (url.includes("?")) {
          const query = url.split("?")[1];
          params = new URLSearchParams(query);
        }

        if (!params) return;

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");
        const tokenHash = params.get("token_hash");

        const isRecovery =
          (accessToken && type === "recovery") ||
          tokenHash ||
          type === "recovery";

        if (isRecovery) {
          console.log("DeepLinkHandler: recovery link detected");
          if (setIsRecoveryMode) setIsRecoveryMode(true);

          // small delay to ensure recovery mode is set before session is applied
          await new Promise((r) => setTimeout(r, 100));

          if (accessToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || "",
            });
            if (error) {
              console.error("Error setting session from deep link:", error);
              if (setIsRecoveryMode) setIsRecoveryMode(false);
            } else {
              // give session a moment to persist
              await new Promise((r) => setTimeout(r, 500));
              console.log("DeepLinkHandler: session set from deep link");
            }
          }
        }
      } catch (e) {
        console.error("Error processing deep link:", e);
      }
    };

    Linking.getInitialURL().then((url) => {
      handleDeepLink(url);
    });

    const urlListener = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      mounted = false;
      try {
        urlListener?.remove?.();
      } catch (e) {
        // ignore
      }
    };
  }, [setIsRecoveryMode]);

  return null;
};

// ── First-run onboarding gate ───────────────────────────────────────────────
// Shows the animated onboarding carousel once per device. Completion is
// persisted in AsyncStorage. Renders EITHER onboarding OR its children —
// never both — so the main app stays fully hidden until onboarding finishes.
const ONBOARDING_SEEN_KEY = "expressmart.onboarding.completed";

const OnboardingGate = ({ children }) => {
  const [status, setStatus] = React.useState("loading"); // loading | show | done

  React.useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then((seen) => {
        if (mounted) setStatus(seen === "true" ? "done" : "show");
      })
      .catch(() => {
        // Fail open — never block the app over storage errors.
        if (mounted) setStatus("done");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Hide the native splash as soon as we know what to reveal (the onboarding
  // screen or the main app). preventAutoHideAsync() keeps it up until this
  // runs, so if we waited for AuthenticatedApp to mount (it only mounts after
  // onboarding completes) the splash would stay stuck on a first launch.
  React.useEffect(() => {
    if (Platform.OS === "web") return;
    if (status !== "loading") {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [status]);

  const handleComplete = React.useCallback(() => {
    setStatus("done");
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true").catch(() => {});
  }, []);

  // While checking storage or during onboarding, the main app is NOT mounted.
  if (status !== "done") {
    if (status === "show") {
      return <OnboardingScreen onComplete={handleComplete} />;
    }
    return null;
  }
  return children;
};

// Wraps the navigation container so it receives a FRESH theme object on every
// mode change. Without this, the module-level navTheme is stable across theme
// switches, React Navigation never re-renders its screens, and memoized
// children (e.g. FeedScreen's ReelItem) skip the re-render — leaving some
// parts stuck on the old theme.
const NavigationWithTheme = () => {
  const { colors, isDark } = useTheme();
  // The nav theme is derived from the context palette (stable reference per
  // theme). We do NOT set a `key` on NavigationContainer — that would remount
  // the whole navigation tree and reset navigation history, form state, and
  // scroll position. Toggling the theme only updates context, so the stack and
  // in-screen state are preserved.
  const theme = useMemo(() => createNavTheme(colors, isDark), [colors, isDark]);
  return (
    <NavigationContainer ref={navigationRef} theme={theme} linking={linking}>
      <StatusBar style={isDark ? "light" : "dark-content"} />
      <TagAIAssistantProvider>
        {/* Global AI grounding overlay — renders the pointer/spotlight above
            every screen when the assistant invokes point_to_element. */}
        <OnboardingGate>
          <AuthenticatedApp />
          <ScreenPointerOverlay />
        </OnboardingGate>
      </TagAIAssistantProvider>
    </NavigationContainer>
  );
};

// Silently pulls Paystack's verification state into the database when the app
// loads, so a newly verified subaccount is reflected across the whole app
// (dashboard badge, go-live gate) without the seller opening Payments and
// pressing Sync. Fire-and-forget — failures are logged, never surfaced.
function PaystackVerificationWatcher() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    syncPaystackVerification();
  }, [user?.id]);

  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <AuthProvider>
            <PaystackVerificationWatcher />
            <ToastProvider>
              <CartProvider>
                <ShopProvider>
                  <FeedPersonalizationBoot />
                  <OrderProvider>
                    <ChatProvider>
                      <AdsProvider>
                        <DeepLinkHandler />
                        <NavigationWithTheme />
                      </AdsProvider>
                    </ChatProvider>
                  </OrderProvider>
                </ShopProvider>
              </CartProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
