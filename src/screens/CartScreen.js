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
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

export const CartScreen = ({ navigation }) => {
  const { items, total, updateQuantity, removeFromCart, clearCart } = useCart();
  const { isAuthenticated } = useAuth();

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
        <Ionicons name="cart-outline" size={80} color={colors.muted} />
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Add items from Home or Feed to see them here.
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

  const shippingFee = total >= 10000 ? 0 : 500;
  const grandTotal = total + shippingFee;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shopping Cart</Text>
        <Text style={styles.headerSubtitle}>{items.length} item(s)</Text>
      </View>

      <ScrollView style={styles.itemList} showsVerticalScrollIndicator={false}>
        {items.map(({ id, product, quantity, size, color, price }) => (
          <Pressable
            key={product.id}
            style={styles.itemRow}
            onPress={() => navigation.navigate("ProductDetail", { product })}
          >
            <Image
              source={{ uri: product.thumbnail || product.thumbnails?.[0] }}
              style={styles.thumbnail}
            />
            <View style={styles.itemContent}>
              <Text style={styles.title} numberOfLines={2}>
                {product.title}
              </Text>
              <Text style={styles.price}>
                GH₵{Number(price || product.price).toLocaleString()}
              </Text>
              {(size || color) && (
                <View style={styles.specsRow}>
                  {size && <Text style={styles.specText}>Size: {size}</Text>}
                  {color && <Text style={styles.specText}>Color: {color}</Text>}
                </View>
              )}
              <View style={styles.quantityRow}>
                <Pressable
                  style={styles.qtyButton}
                  onPress={() =>
                    updateQuantity(product.id, Math.max(0, quantity - 1))
                  }
                >
                  <Ionicons name="remove" size={16} color={colors.dark} />
                </Pressable>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <Pressable
                  style={styles.qtyButton}
                  onPress={() => updateQuantity(product.id, quantity + 1)}
                >
                  <Ionicons name="add" size={16} color={colors.dark} />
                </Pressable>
                <Pressable
                  style={styles.remove}
                  onPress={() => removeFromCart(product.id, size, color, id)}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.accent}
                  />
                </Pressable>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>GH₵{total.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <Text
            style={[
              styles.summaryValue,
              shippingFee === 0 && styles.freeShipping,
            ]}
          >
            {shippingFee === 0 ? "FREE" : `GH₵${shippingFee.toLocaleString()}`}
          </Text>
        </View>
        {shippingFee > 0 && (
          <Text style={styles.shippingHint}>
            Add GH₵{(10000 - total).toLocaleString()} more for free shipping
          </Text>
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
    backgroundColor: colors.light,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#fff",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.dark,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
    marginTop: 16,
  },
  emptySubtitle: {
    marginTop: 8,
    color: colors.muted,
    textAlign: "center",
  },
  shopButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  shopButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  itemList: {
    flex: 1,
    padding: 10,
    paddingBottom: 100,
  },
  itemRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: "hidden",
  },
  thumbnail: {
    width: 100,
    height: 120,
    backgroundColor: "#f0f0f0",
  },
  itemContent: {
    flex: 1,
    padding: 12,
  },
  title: {
    fontWeight: "600",
    fontSize: 14,
    color: colors.dark,
    marginBottom: 6,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  specsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  specText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: {
    fontWeight: "600",
    fontSize: 16,
    minWidth: 24,
    textAlign: "center",
  },
  remove: {
    marginLeft: "auto",
    padding: 8,
  },
  summary: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
  },
  freeShipping: {
    color: colors.primary,
  },
  shippingHint: {
    fontSize: 12,
    color: colors.primary,
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E4E8F0",
    marginTop: 8,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  checkout: {
    borderRadius: 16,
    overflow: "hidden",
  },
  checkoutGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  checkoutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
