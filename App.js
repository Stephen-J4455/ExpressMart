import "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Text, View, StyleSheet, Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { CartProvider, useCart } from "./src/context/CartContext";
import { ShopProvider } from "./src/context/ShopContext";
import { OrderProvider } from "./src/context/OrderContext";
import { ToastProvider } from "./src/context/ToastContext";
import { ChatProvider } from "./src/context/ChatContext";
import { AdsProvider } from "./src/context/AdsContext";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CategoriesScreen } from "./src/screens/CategoriesScreen";
import { FeedScreen } from "./src/screens/FeedScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
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
import { ChatScreen } from "./src/screens/ChatScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { PaymentWebViewScreen } from "./src/screens/PaymentWebViewScreen";
import { colors } from "./src/theme/colors";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabIcon =
  (name) =>
    ({ color, size, focused }) => {
      return (
        <Ionicons name={name} size={size} color={color} />
      );
    };

const TabNavigator = () => {
  const { items } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: "#fff",
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: tabIcon("home-outline") }}
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
                <View style={tabStyles.badge}>
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

const tabStyles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: colors.accent,
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
});

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.light,
  },
};

const linking = {
  prefixes: [Linking.createURL("/"), "expressmart://"],
  config: {
    screens: {
      Main: "",
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
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.light,
        }}
      >
        <Text style={{ color: colors.primary, fontSize: 18 }}>Loading...</Text>
      </View>
    );
  }

  return (
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
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen
            name="CategoryProducts"
            component={CategoryProductsScreen}
          />
          <Stack.Screen name="Store" component={StoreScreen} />
          <Stack.Screen name="Stores" component={StoresScreen} />
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Chats" component={ChatsScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen
            name="PaymentWebView"
            component={PaymentWebViewScreen}
          />
          <Stack.Screen name="Orders" component={OrdersScreen} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
          <Stack.Screen name="Wishlist" component={WishlistScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Addresses" component={AddressesScreen} />
          <Stack.Screen name="Payments" component={PaymentsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Security" component={SecurityScreen} />
          <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
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
        </>
      )}
    </Stack.Navigator>
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
