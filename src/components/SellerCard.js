import { Ionicons } from "@expo/vector-icons";
import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { colors } from "../theme/colors";

export const SellerCard = ({ seller, onPress }) => {
    return (
        <Pressable style={styles.card} onPress={onPress} disabled={false}>
            <View style={styles.imageContainer}>
                <Image
                    source={{
                        uri: seller.avatar || "https://via.placeholder.com/120x120",
                    }}
                    style={styles.avatar}
                />
                {seller.badges && seller.badges.includes("verified") && (
                    <View style={styles.verifiedBadge}>
                        <Ionicons name="shield-checkmark" size={14} color="#fff" />
                    </View>
                )}
            </View>
            <View style={styles.content}>
                <Text numberOfLines={2} style={styles.title}>
                    {seller.name}
                </Text>
                <View style={styles.badgeRow}>
                    {seller.badges && seller.badges.length > 0 && (
                        <>
                            {seller.badges.includes("verified") && (
                                <View style={[styles.badge, styles.verifiedStoreBadge]}>
                                    <Text numberOfLines={1} style={styles.badgeText}>
                                        VERIFIED
                                    </Text>
                                </View>
                            )}
                            {seller.badges
                                .filter((badge) => badge !== "verified")
                                .slice(0, 1)
                                .map((badge) => (
                                    <View key={badge} style={styles.badge}>
                                        <Text numberOfLines={1} style={styles.badgeText}>
                                            {badge.replace("_", " ").toUpperCase()}
                                        </Text>
                                    </View>
                                ))}
                        </>
                    )}
                </View>
                <View style={styles.ratingRow}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={styles.ratingText}>
                        {seller.rating?.toFixed(1) || "0.0"}
                    </Text>
                    <Text style={styles.reviewsText}>
                        ({seller.total_ratings || 0})
                    </Text>
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    imageContainer: {
        width: "100%",
        height: 120,
        backgroundColor: colors.light,
        position: "relative",
    },
    avatar: {
        width: "100%",
        height: "100%",
        backgroundColor: colors.light,
    },
    verifiedBadge: {
        position: "absolute",
        top: 6,
        right: 6,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "#10B981",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#fff",
    },
    content: {
        padding: 10,
        gap: 6,
    },
    title: {
        fontSize: 13,
        fontWeight: "700",
        color: colors.dark,
    },
    badgeRow: {
        flexDirection: "row",
        gap: 4,
        flexWrap: "wrap",
    },
    badge: {
        backgroundColor: colors.primary,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    verifiedStoreBadge: {
        backgroundColor: "#10B981",
    },
    badgeText: {
        fontSize: 9,
        fontWeight: "700",
        color: "#fff",
        textTransform: "uppercase",
    },
    ratingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
    },
    ratingText: {
        fontSize: 11,
        fontWeight: "700",
        color: colors.dark,
    },
    reviewsText: {
        fontSize: 10,
        color: colors.muted,
    },
});
