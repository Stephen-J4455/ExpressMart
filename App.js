import "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
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
  Image,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { useResponsive } from "./src/hooks/useResponsive";
import { WebSidebar } from "./src/components/WebSidebar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { CartProvider, useCart } from "./src/context/CartContext";
import { ShopProvider } from "./src/context/ShopContext";
import { OrderProvider } from "./src/context/OrderContext";
import { ToastProvider } from "./src/context/ToastContext";
import { ChatProvider } from "./src/context/ChatContext";
import { AdsProvider } from "./src/context/AdsContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CategoriesScreen } from "./src/screens/CategoriesScreen";
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
import { StoreScreen } from "./src/screens/StoreScreen";
import { StoresScreen } from "./src/screens/StoresScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import PasswordResetScreen from "./src/screens/PasswordResetScreen";
import { ProfileEditScreen } from "./src/screens/ProfileEditScreen";
import { ChangePasswordScreen } from "./src/screens/ChangePasswordScreen";
import { ChangeEmailScreen } from "./src/screens/ChangeEmailScreen";
import { PrivacySettingsScreen } from "./src/screens/PrivacySettingsScreen";
import { PrivacyPolicyScreen } from "./src/screens/PrivacyPolicyScreen";
import { TermsScreen } from "./src/screens/TermsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { StatusViewer } from "./src/screens/StatusViewer";
import { PaymentWebViewScreen } from "./src/screens/PaymentWebViewScreen";
import { CustomerLoadingAnimation } from "./src/components/CustomerLoadingAnimation";
import { colors, getTheme } from "./src/theme/colors";
// password reset handled exclusively via web; mobile screen no longer used

import { supabase } from "./src/lib/supabase";
import React from "react";
import UpdateModal from "./src/components/UpdateModal";
import { checkForUpdate } from "./src/services/updateService";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabIcon =
  (name) =>
  ({ color, size, focused }) => {
    return <Ionicons name={name} size={size} color={color} />;
  };

const TabNavigator = () => {
  const { items } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const defaultTheme = getTheme();
  const { isWide, sidebarWidth } = useResponsive();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelPosition: "below-icon",
        tabBarPosition: isWide ? "left" : "bottom",
        tabBarStyle: isWide
          ? { width: sidebarWidth, borderRightWidth: 0 }
          : {
              height: 70,
              paddingBottom: 10,
              paddingTop: 10,
              backgroundColor: "#fff",
            },
      }}
      tabBar={(props) =>
        isWide ? (
          <WebSidebar {...props} sidebarWidth={sidebarWidth} />
        ) : (
          <DefaultTabBar
            {...props}
            cartCount={cartCount}
            defaultTheme={defaultTheme}
          />
        )
      }
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <Image
                source={require("./assets/express.png")}
                style={{ width: size + 10, height: size + 10 }}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
        }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <Image
                source={require("./assets/express.png")}
                style={{ width: size + 10, height: size + 10 }}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name="grid-outline" size={size} color={color} />
            ),
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <Image
                source={require("./assets/express.png")}
                style={{ width: size + 10, height: size + 10 }}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name="compass-outline" size={size} color={color} />
            ),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              {focused ? (
                <Image
                  source={require("./assets/express.png")}
                  style={{ width: size + 10, height: size + 10 }}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="cart-outline" size={size} color={color} />
              )}
              {cartCount > 0 && (
                <View
                  style={[
                    tabStyles.badge,
                    { backgroundColor: defaultTheme.primary || "#0B6EFE" },
                  ]}
                >
                  <Text style={tabStyles.badgeText}>{cartCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) =>
            focused ? (
              <Image
                source={require("./assets/express.png")}
                style={{ width: size + 10, height: size + 10 }}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
        }}
      />
    </Tab.Navigator>
  );
};

/** Default mobile bottom tab bar */
const DefaultTabBar = ({
  state,
  descriptors,
  navigation,
  cartCount,
  defaultTheme,
}) => {
  return (
    <View style={tabStyles.mobileBar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const color = isFocused ? colors.primary : colors.muted;
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
            style={tabStyles.mobileTab}
          >
            {options.tabBarIcon({ color, size: 24, focused: isFocused })}
            <Text style={[tabStyles.mobileTabLabel, { color }]}>
              {route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const tabStyles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
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
  mobileBar: {
    flexDirection: "row",
    height: 70,
    paddingBottom: 10,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  mobileTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  mobileTabLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.light,
  },
};

const LoginRequiredScreen = ({
  navigation,
  routeName,
  routeParams,
  title = "Login required",
  message = "Please sign in to use this feature.",
}) => (
  <View style={authPromptStyles.container}>
    <Ionicons name="lock-closed-outline" size={52} color={colors.primary} />
    <Text style={authPromptStyles.title}>{title}</Text>
    <Text style={authPromptStyles.message}>{message}</Text>
    <Pressable
      style={authPromptStyles.button}
      onPress={() =>
        navigation.navigate("Auth", {
          redirectTo: routeName,
          redirectParams: routeParams,
        })
      }
    >
      <LinearGradient
        colors={[colors.primary, colors.accent]}
        style={authPromptStyles.buttonGradient}
      >
        <Ionicons name="log-in-outline" size={18} color="#fff" />
        <Text style={authPromptStyles.buttonText}>Login to continue</Text>
      </LinearGradient>
    </Pressable>
  </View>
);

// only handle our custom URI schemes here; web links will stay in browser
const prefixes = [Linking.createURL("/"), "expressmart://"];
if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
  prefixes.push(window.location.origin);
}

const linking = {
  prefixes,
  config: {
    screens: {
      Main: {
        screens: {
          Home: "home",
          Categories: "categories",
          // ...
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
    },
  },
};

const AuthenticatedApp = () => {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
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

  if (authLoading) {
    return <CustomerLoadingAnimation />;
  }

  const withAuthGate = (Component, title, message) => {
    const GuardedScreen = (props) => {
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

    return GuardedScreen;
  };

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
          animation: "fade",
          animationDuration: 100,
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
        <Stack.Screen name="Store" component={StoreScreen} />
        <Stack.Screen name="Stores" component={StoresScreen} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="Chat" component={GuardedChat} />
        <Stack.Screen name="Chats" component={GuardedChats} />
        <Stack.Screen name="StatusViewer" component={StatusViewer} />
        <Stack.Screen name="Checkout" component={GuardedCheckout} />
        <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} />
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

const authPromptStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "800",
    color: colors.dark,
  },
  message: {
    marginTop: 8,
    textAlign: "center",
    color: colors.muted,
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
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
            <ShopProvider>
              <OrderProvider>
                <ChatProvider>
                  <AdsProvider>
                    <NavigationContainer theme={navTheme} linking={linking}>
                      <StatusBar style="dark" />
                      <AuthenticatedApp />
                    </NavigationContainer>
                  </AdsProvider>
                </ChatProvider>
              </OrderProvider>
            </ShopProvider>
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
