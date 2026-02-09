import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    SafeAreaView,
    Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

export const OrderDetailScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { order: initialOrder } = route.params || {};
    const [order, setOrder] = useState(initialOrder);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(!initialOrder);

    // Fetch order items if needed
    useEffect(() => {
        if (order?.id && (!order.order_items || order.order_items.length === 0)) {
            fetchOrderItems();
        } else if (order?.order_items) {
            setItems(order.order_items);
        }
    }, [order?.id]);

    const fetchOrderItems = async () => {
        try {
            const { data, error } = await supabase
                .from("express_order_items")
                .select("*")
                .eq("order_id", order.id);

            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error("Error fetching order items:", err);
        } finally {
            setLoading(false);
        }
    };

    if (!order) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Pressable
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.dark} />
                    </Pressable>
                    <Text style={styles.headerTitle}>Order Details</Text>
                    <View style={{ width: 44 }} />
                </View>
                <View style={styles.centerContainer}>
                    <Text style={styles.errorText}>Order not found</Text>
                </View>
            </SafeAreaView>
        );
    }

    const getStatusColor = (status) => {
        const statusMap = {
            pending_payment: colors.warning,
            processing: colors.warning,
            packed: colors.info,
            shipped: colors.primary,
            delivered: colors.success,
            canceled: colors.error,
            refunded: colors.muted,
        };
        return statusMap[status] || colors.muted;
    };

    const getStatusIcon = (status) => {
        const iconMap = {
            pending_payment: "hourglass-outline",
            processing: "cog-outline",
            packed: "cube-outline",
            shipped: "airplane-outline",
            delivered: "checkmark-circle-outline",
            canceled: "close-circle-outline",
            refunded: "undo-outline",
        };
        return iconMap[status] || "ellipse-outline";
    };

    const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleDateString("en-GB", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const shippingAddr = order.shipping_address || {};
    const orderTotal = parseFloat(order.total) || 0;
    const shippingFee = parseFloat(order.service_fee) || 0;
    const subtotal = orderTotal - shippingFee;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.dark} />
                </Pressable>
                <Text style={styles.headerTitle}>Order Details</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 30 }}
            >
                {/* Status Card */}
                <View style={styles.statusCard}>
                    <View style={styles.statusHeader}>
                        <View
                            style={[
                                styles.statusIconContainer,
                                { backgroundColor: `${getStatusColor(order.status)}20` },
                            ]}
                        >
                            <Ionicons
                                name={getStatusIcon(order.status)}
                                size={28}
                                color={getStatusColor(order.status)}
                            />
                        </View>
                        <View style={styles.statusInfo}>
                            <Text style={styles.statusLabel}>
                                {order.status?.replace(/_/g, " ").toUpperCase()}
                            </Text>
                            <Text style={styles.orderNumber}>Order #{order.order_number}</Text>
                        </View>
                    </View>
                    <View style={styles.statusTimeline}>
                        <Text style={styles.timelineDate}>
                            {formatDate(order.created_at)}
                        </Text>
                        <Text style={styles.timelineTime}>
                            {formatTime(order.created_at)}
                        </Text>
                    </View>
                </View>

                {/* Order Items Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="bag-outline" size={20} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Order Items</Text>
                    </View>

                    {loading ? (
                        <View style={styles.centerContent}>
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : items.length > 0 ? (
                        items.map((item, index) => (
                            <View
                                key={item.id || index}
                                style={[
                                    styles.itemCard,
                                    index !== items.length - 1 && styles.itemCardBorder,
                                ]}
                            >
                                <View style={styles.itemContainer}>
                                    {/* Product Image */}
                                    {item.thumbnail && (
                                        <Image
                                            source={{ uri: item.thumbnail }}
                                            style={styles.itemImage}
                                            resizeMode="cover"
                                        />
                                    )}

                                    {/* Item Details */}
                                    <View style={styles.itemDetails}>
                                        <View style={styles.itemHeader}>
                                            <Text style={styles.itemTitle} numberOfLines={2}>
                                                {item.title}
                                            </Text>
                                            <Text style={styles.itemPrice}>
                                                GH₵{parseFloat(item.total || item.price).toLocaleString()}
                                            </Text>
                                        </View>
                                        <View style={styles.itemMeta}>
                                            <Text style={styles.itemMetaText}>
                                                Qty: <Text style={styles.itemMetaBold}>{item.quantity}</Text>
                                            </Text>
                                            {item.size && (
                                                <Text style={styles.itemMetaText}>
                                                    Size: <Text style={styles.itemMetaBold}>{item.size}</Text>
                                                </Text>
                                            )}
                                            {item.color && (
                                                <Text style={styles.itemMetaText}>
                                                    Color:{" "}
                                                    <Text style={styles.itemMetaBold}>{item.color}</Text>
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.emptyText}>No items in this order</Text>
                    )}
                </View>

                {/* Delivery Address Section */}
                {Object.keys(shippingAddr).length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons
                                name="location-outline"
                                size={20}
                                color={colors.primary}
                            />
                            <Text style={styles.sectionTitle}>Delivery Address</Text>
                        </View>

                        <View style={styles.addressCard}>
                            <Text style={styles.addressName}>{shippingAddr.full_name}</Text>
                            <Text style={styles.addressDetail}>
                                {shippingAddr.street_address}
                            </Text>
                            <Text style={styles.addressDetail}>
                                {shippingAddr.city}, {shippingAddr.state}
                            </Text>
                            {shippingAddr.postal_code && (
                                <Text style={styles.addressDetail}>
                                    {shippingAddr.postal_code}
                                </Text>
                            )}
                            {shippingAddr.phone && (
                                <Text style={styles.addressDetail}>📞 {shippingAddr.phone}</Text>
                            )}
                        </View>
                    </View>
                )}

                {/* Payment Summary Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons
                            name="receipt-outline"
                            size={20}
                            color={colors.primary}
                        />
                        <Text style={styles.sectionTitle}>Payment Summary</Text>
                    </View>

                    <View style={styles.paymentCard}>
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Subtotal</Text>
                            <Text style={styles.paymentValue}>
                                GH₵{subtotal.toLocaleString()}
                            </Text>
                        </View>

                        {shippingFee > 0 && (
                            <View style={styles.paymentRow}>
                                <Text style={styles.paymentLabel}>Service Fee</Text>
                                <Text style={styles.paymentValue}>
                                    GH₵{shippingFee.toLocaleString()}
                                </Text>
                            </View>
                        )}

                        <View style={styles.divider} />

                        <View style={[styles.paymentRow, styles.totalRow]}>
                            <Text style={styles.totalLabel}>Total Amount</Text>
                            <Text style={styles.totalValue}>
                                GH₵{orderTotal.toLocaleString()}
                            </Text>
                        </View>

                        {order.payment_method && (
                            <View style={styles.paymentMethodRow}>
                                <Text style={styles.paymentMethodLabel}>Payment Method</Text>
                                <Text style={styles.paymentMethodValue}>
                                    {order.payment_method === "paystack" ? "Paystack" : order.payment_method}
                                </Text>
                            </View>
                        )}

                        {order.payment_reference && (
                            <View style={styles.referenceRow}>
                                <Text style={styles.referenceLabel}>Reference</Text>
                                <Text style={styles.referenceValue} numberOfLines={1}>
                                    {order.payment_reference}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Tracking Section */}
                {order.tracking_number && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="navigate-outline" size={20} color={colors.primary} />
                            <Text style={styles.sectionTitle}>Tracking Info</Text>
                        </View>

                        <View style={styles.trackingCard}>
                            <Text style={styles.trackingLabel}>Tracking Number</Text>
                            <Text style={styles.trackingNumber}>{order.tracking_number}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.light,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingTop: 20,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: colors.light,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.dark,
    },
    content: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    centerContent: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 40,
    },
    errorText: {
        fontSize: 16,
        color: colors.error,
    },
    emptyText: {
        fontSize: 14,
        color: colors.muted,
        textAlign: "center",
        paddingVertical: 20,
    },

    /* Status Card */
    statusCard: {
        backgroundColor: "#fff",
        margin: 16,
        marginBottom: 12,
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
    },
    statusHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
    },
    statusIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    statusInfo: {
        flex: 1,
    },
    statusLabel: {
        fontSize: 12,
        color: colors.muted,
        fontWeight: "500",
        marginBottom: 2,
    },
    orderNumber: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.dark,
    },
    statusTimeline: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.light,
    },
    timelineDate: {
        fontSize: 12,
        color: colors.muted,
        marginBottom: 2,
    },
    timelineTime: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: "500",
    },

    /* Sections */
    section: {
        backgroundColor: "#fff",
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 12,
        padding: 16,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.dark,
        marginLeft: 10,
    },

    /* Items */
    itemCard: {
        paddingVertical: 12,
    },
    itemCardBorder: {
        borderBottomWidth: 1,
        borderBottomColor: colors.light,
    },
    itemContainer: {
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
    },
    itemImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: colors.light,
    },
    itemDetails: {
        flex: 1,
    },
    itemHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 8,
    },
    itemTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: "500",
        color: colors.dark,
        marginRight: 8,
    },
    itemPrice: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.primary,
    },
    itemMeta: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
    },
    itemMetaText: {
        fontSize: 12,
        color: colors.muted,
    },
    itemMetaBold: {
        fontWeight: "600",
        color: colors.dark,
    },

    /* Address */
    addressCard: {
        backgroundColor: colors.light,
        padding: 12,
        borderRadius: 8,
    },
    addressName: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.dark,
        marginBottom: 6,
    },
    addressDetail: {
        fontSize: 13,
        color: colors.muted,
        lineHeight: 18,
    },

    /* Payment */
    paymentCard: {
        backgroundColor: colors.light,
        padding: 12,
        borderRadius: 8,
    },
    paymentRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
    },
    paymentLabel: {
        fontSize: 13,
        color: colors.muted,
    },
    paymentValue: {
        fontSize: 13,
        fontWeight: "500",
        color: colors.dark,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 8,
    },
    totalRow: {
        paddingVertical: 10,
    },
    totalLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.dark,
    },
    totalValue: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.primary,
    },
    paymentMethodRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    paymentMethodLabel: {
        fontSize: 12,
        color: colors.muted,
    },
    paymentMethodValue: {
        fontSize: 12,
        fontWeight: "500",
        color: colors.dark,
        textTransform: "capitalize",
    },
    referenceRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 6,
    },
    referenceLabel: {
        fontSize: 11,
        color: colors.muted,
    },
    referenceValue: {
        fontSize: 11,
        color: colors.muted,
        fontFamily: "monospace",
        flex: 1,
        textAlign: "right",
        marginLeft: 8,
    },

    /* Tracking */
    trackingCard: {
        backgroundColor: colors.light,
        padding: 12,
        borderRadius: 8,
    },
    trackingLabel: {
        fontSize: 12,
        color: colors.muted,
        marginBottom: 6,
    },
    trackingNumber: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.dark,
        fontFamily: "monospace",
    },
});