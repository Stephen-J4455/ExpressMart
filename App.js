import "react-native-gesture-handler";
import {
  NavigationContainer,
  DefaultTheme,
  getStateFromPath as defaultGetStateFromPath,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  Text,
  View,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as Linking from "expo-linking";
import { useResponsive } from "./src/hooks/useResponsive";
import { WebSidebar } from "./src/components/WebSidebar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { CartProvider, useCart } from "./src/context/CartContext";
import { ShopProvider } from "./src/context/ShopContext";
import { OrderProvider } from "./src/context/OrderContext";
import { ToastProvider } from "./src/context/ToastContext";
import { ChatProvider } from "./src/context/ChatContext";
import { AdsProvider } from "./src/context/AdsContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import { HomeScreen } from "./src/screens/HomeScreen";
import { FeedScreen } from "./src/screens/FeedScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { SearchResultsScreen } from "./src/screens/SearchResultsScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { CheckoutScreen } from "./src/screens/CheckoutScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { OrderDetailScreen } from "./src/screens/OrderDetailScreen";
import { WishlistScreen } from "./src/screens/WishlistScreen";
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
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { SellerChatScreen } from "./src/screens/SellerChatScreen";
import { StatusViewer } from "./src/screens/StatusViewer";
import StatusCreatorScreen from "./src/screens/StatusCreatorScreen";
import { PaymentWebViewScreen } from "./src/screens/PaymentWebViewScreen";
import { StoreRegistrationScreen } from "./src/screens/StoreRegistrationScreen";

// PasswordResetScreen handles recovery links on both web and native.

import { supabase } from "./src/lib/supabase";
import React, { useMemo } from "react";
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
        component={HomeScreen}
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
        name="Stores"
        component={StoresScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "storefront" : "storefront-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
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
        component={CartScreen}
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
        component={AccountScreen}
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

/** Floating, rounded, icon-only, theme-colored mobile bottom tab bar */
const DefaultTabBar = ({
  state,
  descriptors,
  navigation,
  cartCount,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? insets.bottom : 0;
  const { colors } = useTheme();

  const pill = (
    <View style={tabStyles.pill}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const color = isFocused ? colors.primary : "rgba(255,255,255,0.75)";
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
              tabStyles.mobileTab,
              pressed && tabStyles.mobileTabPressed,
            ]}
          >
            <View
              style={[
                tabStyles.iconWrap,
                isFocused && tabStyles.mobileTabIconBg,
              ]}
            >
              {options.tabBarIcon({ color, size: 24, focused: isFocused })}
              {route.name === "Cart" && cartCount > 0 && (
                <View
                  style={[
                    tabStyles.badge,
                    {
                      backgroundColor: colors.primary,
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
  );

  return (
    <View
      style={[
        tabStyles.floatingWrapper,
        { bottom: bottomInset + MOBILE_TAB_BAR_PADDING_BOTTOM },
      ]}
      pointerEvents="box-none"
    >
      <LinearGradient
        colors={[colors.primary, colors.gradientEnd || colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={tabStyles.blurContainer}
      >
        {pill}
      </LinearGradient>
    </View>
  );
};

const tabStyles = StyleSheet.create({
  floatingWrapper: {
    position: "absolute",
    left: 26,
    right: 26,
    alignItems: "center",
    zIndex: 1000,
  },
  blurContainer: {
    width: "100%",
    borderRadius: 40,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  mobileTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 40,
     
  },
  
  mobileTabIconBg: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 40,
    padding: 8,
  },
  mobileTabPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
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
    borderColor: "#fff",
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
  const getParam = (name) => hashParams.get(name) || queryParams.get(name) || "";

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
  const hasWebResetScreen = normalized.includes("screen=reset-password") ||
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
    Platform.OS === "web" ? isWebRecoveryResetLink(raw) : isNativeRecoveryDeepLink;

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
          Stores: "stores",
          Feed: "feed",
          Cart: "cart",
          Account: "account",
        },
      },
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
      Wishlist: "wishlist",
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

const AuthenticatedApp = () => {
  const { isAuthenticated, user } = useAuth();
  const [updateInfo, setUpdateInfo] = React.useState(null);
  const [updateVisible, setUpdateVisible] = React.useState(false);

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

  React.useEffect(() => {
    if (Platform.OS === "web") return;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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
  const GuardedWishlist = withAuthGate(
    WishlistScreen,
    "Login to view wishlist",
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
          animationDuration: .3
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
        <Stack.Screen name="Chat" component={GuardedChat} />
        <Stack.Screen name="Chats" component={GuardedChats} />
        <Stack.Screen name="SellerChat" component={SellerChatScreen} />
        <Stack.Screen name="StatusViewer" component={StatusViewer} />
        <Stack.Screen name="StatusCreator" component={GuardedStatusCreator} />
        <Stack.Screen name="Checkout" component={GuardedCheckout} />
        <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} />
        <Stack.Screen name="StoreRegistration" component={StoreRegistrationScreen} />
        <Stack.Screen name="Orders" component={GuardedOrders} />
        <Stack.Screen name="OrderDetail" component={GuardedOrderDetail} />
        <Stack.Screen name="Wishlist" component={GuardedWishlist} />
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
        <Stack.Screen
          name="ChangePassword"
          component={GuardedChangePassword}
        />
        <Stack.Screen name="ChangeEmail" component={GuardedChangeEmail} />
        <Stack.Screen
          name="PrivacySettings"
          component={GuardedPrivacySettings}
        />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
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
          (accessToken && type === "recovery") || tokenHash || type === "recovery";

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
    <NavigationContainer theme={theme} linking={linking}>
      <StatusBar style={isDark ? "light" : "dark-content"} />
      <AuthenticatedApp />
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <CartProvider>
                <ShopProvider>
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
