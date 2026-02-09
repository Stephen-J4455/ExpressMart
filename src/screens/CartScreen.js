import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useShop } from "../context/ShopContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

// Map color names to hex values
const colorMap = {
  red: "#EF4444",
  blue: "#3B82F6",
  green: "#22C55E",
  yellow: "#EAB308",
  orange: "#F97316",
  purple: "#A855F7",
  pink: "#EC4899",
  black: "#1F2937",
  white: "#E5E7EB",
  gray: "#6B7280",
  grey: "#6B7280",
  brown: "#92400E",
  navy: "#1E3A5A",
  "navy blue": "#1E3A5A",
  "sky blue": "#38BDF8",
  "light blue": "#7DD3FC",
  "dark blue": "#1E40AF",
  teal: "#14B8A6",
  cyan: "#06B6D4",
  maroon: "#7F1D1D",
  beige: "#D4B896",
  cream: "#FFFDD0",
  gold: "#CA8A04",
  silver: "#A8A29E",
  olive: "#65A30D",
  coral: "#F87171",
  mint: "#86EFAC",
  lavender: "#C4B5FD",
  burgundy: "#881337",
  turquoise: "#2DD4BF",
  khaki: "#BEA77F",
  charcoal: "#374151",
  ivory: "#FFFFF0",
  peach: "#FDBA74",
  rose: "#FB7185",
  wine: "#7F1D1D",
  tan: "#D2B48C",
  nude: "#E8C4A2",
  multicolor: "linear-gradient(90deg, #EF4444, #F97316, #EAB308, #22C55E, #3B82F6, #A855F7)",
  multi: "#CBD5E1",
};

const getColorHex = (colorName) => {
  if (!colorName) return "#CBD5E1";
  const lowerColor = colorName.toLowerCase().trim();
  return colorMap[lowerColor] || "#CBD5E1";
};

export const CartScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const { items, total, updateQuantity, removeFromCart, clearCart } = useCart();
  const { settings } = useShop();
  const toast = useToast();

  const handleCheckout = () => {
    if (!isAuthenticated) {
      navigation.navigate("Auth");
    } else {
      navigation.navigate("Checkout");
    }
  };

  if (!items.length) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="cart-outline" size={56} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Add items from Home or Feed{"\n"}to see them here.
        </Text>
        <Pressable
          style={styles.shopButton}
          onPress={() => navigation.navigate("Home")}
        >
          <Text style={styles.shopButtonText}>Start Shopping</Text>
        </Pressable>
      </View>
    );
  }

  // Service fee calculation from settings
  const defaultFee = parseInt(settings?.service_fee || "500");
  const serviceFee = total >= 10000 ? 0 : defaultFee;
  const grandTotal = total + serviceFee;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Shopping Cart</Text>
          <View style={styles.itemCountBadge}>
            <Text style={styles.itemCountText}>{items.length}</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>Review your items before checkout</Text>
      </View>

      <ScrollView style={styles.itemList} showsVerticalScrollIndicator={false}>
        {items.map(({ id, product, quantity, size, color, price }) => (
          <View key={id} style={styles.itemCard}>
            <Pressable
              style={styles.itemRow}
              onPress={() => navigation.navigate("ProductDetail", { product })}
            >
              <View style={styles.thumbnailContainer}>
                <Image
                  source={{ uri: product.thumbnail || product.thumbnails?.[0] }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
                {product.discount > 0 && (
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>-{product.discount}%</Text>
                  </View>
                )}
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.title} numberOfLines={2}>
                  {product.title}
                </Text>
                {(size || color) && (
                  <View style={styles.specsRow}>
                    {size && (
                      <View style={styles.specBadge}>
                        <Ionicons name="resize" size={10} color={colors.primary} />
                        <Text style={styles.specText}>{size}</Text>
                      </View>
                    )}
                    {color && (
                      <View style={styles.specBadge}>
                        <View style={[styles.colorDot, { backgroundColor: getColorHex(color) }]} />
                        <Text style={styles.specText}>{color}</Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    GH₵{Number(price || product.price).toLocaleString()}
                  </Text>
                  {product.original_price && product.original_price > (price || product.price) && (
                    <Text style={styles.originalPrice}>
                      GH₵{Number(product.original_price).toLocaleString()}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
            <View style={styles.itemActions}>
              <Pressable
                style={styles.removeButton}
                onPress={() => removeFromCart(product.id, size, color, id)}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
              <View style={styles.quantityRow}>
                <Pressable
                  style={[styles.qtyButton, quantity <= 1 && styles.qtyButtonDisabled]}
                  onPress={() =>
                    updateQuantity(product.id, Math.max(1, quantity - 1))
                  }
                >
                  <Ionicons name="remove" size={18} color={quantity <= 1 ? '#CBD5E1' : colors.dark} />
                </Pressable>
                <View style={styles.qtyValueContainer}>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                </View>
                <Pressable
                  style={[styles.qtyButton, styles.qtyButtonAdd]}
                  onPress={() => updateQuantity(product.id, quantity + 1)}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>GH₵{total.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Service Fee</Text>
          <Text
            style={[
              styles.summaryValue,
              serviceFee === 0 && styles.freeShipping,
            ]}
          >
            {serviceFee === 0
              ? "FREE"
              : `GH₵${serviceFee.toLocaleString()}`}
          </Text>
        </View>
        {serviceFee > 0 && (
          <View style={styles.shippingHintContainer}>
            <Ionicons name="gift-outline" size={14} color={colors.primary} />
            <Text style={styles.shippingHint}>
              Add GH₵{(10000 - total).toLocaleString()} more for free shipping
            </Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            GH₵{grandTotal.toLocaleString()}
          </Text>
        </View>
        <Pressable style={styles.checkout} onPress={handleCheckout}>
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            style={styles.checkoutGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="lock-closed" size={18} color="#fff" />
            <Text style={styles.checkoutText}>Proceed to Checkout</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.5,
  },
  itemCountBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#F8FAFC",
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 40,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.dark,
  },
  emptySubtitle: {
    marginTop: 8,
    color: colors.muted,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  shopButton: {
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: 20,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  shopButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  itemList: {
    flex: 1,
    padding: 16,
    paddingTop: 20,
  },
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    padding: 12,
    paddingBottom: 10,
  },
  thumbnailContainer: {
    width: 90,
    height: 90,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  discountBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#EF4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  itemContent: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: "center",
  },
  title: {
    fontWeight: "700",
    fontSize: 15,
    color: colors.dark,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  specsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  specBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  specText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "600",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  price: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.primary,
  },
  originalPrice: {
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FAFBFC",
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  removeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
  },
  qtyButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonDisabled: {
    backgroundColor: "#F8FAFC",
  },
  qtyButtonAdd: {
    backgroundColor: colors.primary,
  },
  qtyValueContainer: {
    minWidth: 36,
    alignItems: "center",
  },
  qtyValue: {
    fontWeight: "700",
    fontSize: 16,
    color: colors.dark,
  },
  summary: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 16,
    elevation: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.dark,
  },
  freeShipping: {
    color: "#10B981",
  },
  shippingHintContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  shippingHint: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 8,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.dark,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  checkout: {
    borderRadius: 18,
    overflow: "hidden",
  },
  checkoutGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
  },
  checkoutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
  },
});
