import "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { CartProvider, useCart } from "./src/context/CartContext";
import { ShopProvider } from "./src/context/ShopContext";
import { OrderProvider } from "./src/context/OrderContext";
import { ToastProvider } from "./src/context/ToastContext";
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
import { WishlistScreen } from "./src/screens/WishlistScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { colors } from "./src/theme/colors";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabIcon =
  (name) =>
  ({ color, size }) =>
    <Ionicons name={name} size={size} color={color} />;

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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="Orders" component={OrdersScreen} />
          <Stack.Screen name="Wishlist" component={WishlistScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
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
                <NavigationContainer theme={navTheme}>
                  <StatusBar style="dark" />
                  <AuthenticatedApp />
                </NavigationContainer>
              </OrderProvider>
            </ShopProvider>
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
