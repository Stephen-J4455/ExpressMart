import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
    ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { useShop } from "../context/ShopContext";
import { useToast } from "../context/ToastContext";

export const SellerCard = ({ seller, onPress }) => {
    const { isFollowing, followSeller, unfollowSeller } = useShop();
    const toast = useToast();
    const [followLoading, setFollowLoading] = useState(false);
    const isVerified = seller.badges && seller.badges.includes("verified");
    const otherBadges = seller.badges?.filter((badge) => badge !== "verified") || [];

    const handleFollowPress = async (e) => {
        e.preventDefault();
        if (!seller.id) return;
        setFollowLoading(true);
        try {
            if (isFollowing(seller.id)) {
                await unfollowSeller(seller.id);
                toast.error('Unfollowed');
            } else {
                await followSeller(seller.id);
                toast.success('Following');
            }
        } catch (err) {
            console.error('Error toggling follow:', err);
            toast.error('Failed to update follow');
        } finally {
            setFollowLoading(false);
        }
    };

    return (
        <Pressable style={styles.card} onPress={onPress}>
            {/* Image Section */}
            <View style={styles.imageContainer}>
                <Image
                    source={{
                        uri: seller.avatar || "https://via.placeholder.com/180x180",
                    }}
                    style={styles.avatar}
                />
                {/* Gradient Overlay */}
                <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.4)"]}
                    style={styles.imageGradient}
                />
                {/* Verified Badge */}
                {isVerified && (
                    <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#fff" />
                        <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                )}
                {/* Rating on Image */}
                <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={12} color="#FBBF24" />
                    <Text style={styles.ratingBadgeText}>
                        {seller.rating?.toFixed(1) || "0.0"}
                    </Text>
                </View>
            </View>

            {/* Content Section */}
            <View style={styles.content}>
                <Text numberOfLines={1} style={styles.title}>
                    {seller.name}
                </Text>

                {/* Info Row */}
                <View style={styles.infoRow}>
                    {seller.total_ratings > 0 && (
                        <View style={styles.infoItem}>
                            <Ionicons name="people-outline" size={12} color={colors.muted} />
                            <Text style={styles.infoText}>
                                {seller.total_ratings} reviews
                            </Text>
                        </View>
                    )}
                    <Pressable
                        style={[
                            styles.followButtonThin,
                            isFollowing(seller.id) && styles.followButtonThinActive,
                        ]}
                        onPress={handleFollowPress}
                        disabled={followLoading}
                    >
                        {followLoading ? (
                            <ActivityIndicator
                                size="small"
                                color="#DC2626"
                            />
                        ) : (
                            <>
                                {!isFollowing(seller.id) && (
                                    <Ionicons
                                        name="add"
                                        size={14}
                                        color="#DC2626"
                                    />
                                )}
                                <Text style={styles.followButtonThinText}>
                                    {isFollowing(seller.id) ? "Following" : "Follow"}
                                </Text>
                            </>
                        )}
                    </Pressable>
                </View>

                {/* Badges Row */}
                {otherBadges.length > 0 && (
                    <View style={styles.badgeRow}>
                        {otherBadges.slice(0, 2).map((badge) => (
                            <View key={badge} style={styles.badge}>
                                <Text numberOfLines={1} style={styles.badgeText}>
                                    {badge.replace("_", " ")}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Action Button */}
                <View style={styles.actionRow}>
                    <View style={styles.visitButton}>
                        <Text style={styles.visitButtonText}>Visit Store</Text>
                        <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                    </View>
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 24,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    imageContainer: {
        width: "100%",
        height: 140,
        backgroundColor: "#F8FAFC",
        position: "relative",
    },
    avatar: {
        width: "100%",
        height: "100%",
    },
    imageGradient: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 60,
    },
    verifiedBadge: {
        position: "absolute",
        top: 10,
        left: 10,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#10B981",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        gap: 4,
    },
    verifiedText: {
        fontSize: 10,
        fontWeight: "700",
        color: "#fff",
    },
    ratingBadge: {
        position: "absolute",
        bottom: 10,
        right: 10,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.95)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    ratingBadgeText: {
        fontSize: 12,
        fontWeight: "800",
        color: colors.dark,
    },
    content: {
        padding: 14,
        gap: 8,
    },
    title: {
        fontSize: 15,
        fontWeight: "800",
        color: colors.dark,
        letterSpacing: -0.3,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    infoItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    infoText: {
        fontSize: 11,
        color: colors.muted,
        fontWeight: "500",
    },
    badgeRow: {
        flexDirection: "row",
        gap: 6,
        flexWrap: "wrap",
    },
    badge: {
        backgroundColor: "#EEF2FF",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: "600",
        color: colors.primary,
        textTransform: "capitalize",
    },
    actionRow: {
        marginTop: 4,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
    },
    visitButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#EEF2FF",
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    visitButtonText: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.primary,
    },
    followButtonThin: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: "transparent",
        borderWidth: 0,
        borderColor: "transparent",
    },
    followButtonThinActive: {
        backgroundColor: "transparent",
        borderColor: "transparent",
    },
    followButtonThinText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#DC2626",
    },
});
