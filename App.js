import "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import {
  Text,
  View,
  StyleSheet,
  Animated,
  Pressable,
  Image,
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
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SecurityScreen } from "./src/screens/SecurityScreen";
import { HelpSupportScreen } from "./src/screens/HelpSupportScreen";
import { CategoryProductsScreen } from "./src/screens/CategoryProductsScreen";
import { StoreScreen } from "./src/screens/StoreScreen";
import { StoresScreen } from "./src/screens/StoresScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
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
                style={{ width: size + 2, height: size + 2 }}
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
        options={{ tabBarIcon: tabIcon("grid-outline") }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ tabBarIcon: tabIcon("compass-outline") }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="cart-outline" size={size} color={color} />
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
        options={{ tabBarIcon: tabIcon("person-outline") }}
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

// only handle our custom URI schemes here; web links will stay in browser
const linking = {
  prefixes: ["expressmart://"],
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

  if (authLoading) {
    return <CustomerLoadingAnimation />;
  }

  return (
    <NotificationProvider userId={user?.id}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 100,
        }}
      >
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
            />
            {/* password reset screen present for legacy but navigation won't use it */}
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen
              name="SearchResults"
              component={SearchResultsScreen}
            />
            <Stack.Screen
              name="CategoryProducts"
              component={CategoryProductsScreen}
            />
            <Stack.Screen name="Store" component={StoreScreen} />
            <Stack.Screen name="Stores" component={StoresScreen} />
            <Stack.Screen
              name="ProductDetail"
              component={ProductDetailScreen}
            />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Chats" component={ChatsScreen} />
            <Stack.Screen name="StatusViewer" component={StatusViewer} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen
              name="PaymentWebView"
              component={PaymentWebViewScreen}
            />
            <Stack.Screen name="Orders" component={OrdersScreen} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
            />
            <Stack.Screen name="Addresses" component={AddressesScreen} />
            <Stack.Screen name="Payments" component={PaymentsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Security" component={SecurityScreen} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} />
            <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
            <Stack.Screen
              name="ChangePassword"
              component={ChangePasswordScreen}
            />
            <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} />
            <Stack.Screen
              name="PrivacySettings"
              component={PrivacySettingsScreen}
            />
            <Stack.Screen
              name="PrivacyPolicy"
              component={PrivacyPolicyScreen}
            />
          </>
        )}
      </Stack.Navigator>
    </NotificationProvider>
  );
};

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
