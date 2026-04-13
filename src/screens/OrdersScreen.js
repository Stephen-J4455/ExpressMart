import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useOrder } from "../context/OrderContext";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

const statusColors = {
  pending_payment: "#F59E0B",
  processing: "#3B82F6",
  packed: "#06B6D4",
  shipped: "#8B5CF6",
  delivered: "#10B981",
  canceled: "#EF4444",
  refunded: "#64748B",
};

const statusIcons = {
  pending_payment: "time",
  processing: "reload",
  packed: "cube",
  shipped: "airplane",
  delivered: "checkmark-circle",
  canceled: "close-circle",
  refunded: "return-down-back",
};

const OrderCard = ({ order, onPress, cardWidth }) => {
  const statusColor = statusColors[order.status] || colors.muted;
  const statusIcon = statusIcons[order.status] || "ellipse";
  const statusLabel = order.status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Pressable
      style={[styles.orderCard, cardWidth && { width: cardWidth }]}
      onPress={onPress}
    >
      {/* Top: order number + status */}
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
          <Text style={styles.orderDate}>
            {new Date(order.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}
        >
          <Ionicons name={statusIcon} size={14} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Footer: items + total */}
      <View style={styles.orderFooter}>
        <View style={styles.itemCountWrap}>
          <Ionicons name="cube-outline" size={15} color={colors.muted} />
          <Text style={styles.itemCount}>
            {order.items?.length || 0} item(s)
          </Text>
        </View>
        <Text style={styles.orderTotal}>
          GH₵{Number(order.total).toLocaleString()}
        </Text>
      </View>
    </Pressable>
  );
};

export const OrdersScreen = ({ navigation }) => {
  const { isAuthenticated } = useAuth();
  const { orders, loading, fetchOrders } = useOrder();
  const { cardColumns, horizontalPadding, getItemWidth } = useResponsive();
  const cardItemWidth = getItemWidth(cardColumns);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.replace("Auth");
    }
  }, [isAuthenticated, navigation]);

  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "active")
      return ["processing", "packed", "shipped"].includes(order.status);
    if (filter === "completed") return order.status === "delivered";
    return true;
  });

  const filterCounts = {
    all: orders.length,
    active: orders.filter((o) =>
      ["processing", "packed", "shipped"].includes(o.status),
    ).length,
    completed: orders.filter((o) => o.status === "delivered").length,
  };

  const renderOrder = useCallback(
    ({ item }) => (
      <OrderCard
        order={item}
        cardWidth={cardColumns > 1 ? cardItemWidth : undefined}
        onPress={() => navigation.navigate("OrderDetail", { order: item })}
      />
    ),
    [navigation, cardColumns, cardItemWidth],
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingHorizontal: cardColumns > 1 ? horizontalPadding : 16 },
        ]}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>My Orders</Text>
          <Text style={styles.headerSubtitle}>
            {orders.length} order{orders.length !== 1 ? "s" : ""} total
          </Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View
        style={[
          styles.filters,
          { paddingHorizontal: cardColumns > 1 ? horizontalPadding : 16 },
        ]}
      >
        {["all", "active", "completed"].map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
            <View
              style={[
                styles.filterCount,
                filter === f && styles.filterCountActive,
              ]}
            >
              <Text
                style={[
                  styles.filterCountText,
                  filter === f && styles.filterCountTextActive,
                ]}
              >
                {filterCounts[f]}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        key={`orders-${cardColumns}`}
        numColumns={cardColumns}
        contentContainerStyle={[
          styles.list,
          { paddingHorizontal: cardColumns > 1 ? horizontalPadding : 16 },
        ]}
        columnWrapperStyle={cardColumns > 1 ? styles.columnWrapper : undefined}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchOrders}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cube-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubtitle}>
              {filter === "all"
                ? "Your orders will appear here once you make a purchase."
                : `No ${filter} orders found.`}
            </Text>
            {filter === "all" && (
              <Pressable
                style={styles.shopButton}
                onPress={() => navigation.navigate("Main")}
              >
                <Text style={styles.shopButtonText}>Start Shopping</Text>
              </Pressable>
            )}
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF2F8",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.dark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 1,
  },
  filters: {
    flexDirection: "row",
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  filterTextActive: {
    color: "#fff",
  },
  filterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterCountActive: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  filterCountTextActive: {
    color: "#fff",
  },
  list: {
    paddingTop: 20,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: 16,
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EEF2F8",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.dark,
  },
  orderDate: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginBottom: 12,
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemCount: {
    fontSize: 14,
    color: colors.muted,
  },
  orderTotal: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.primary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.dark,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  shopButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: 25,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  shopButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
