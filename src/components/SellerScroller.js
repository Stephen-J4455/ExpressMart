import { Ionicons } from "@expo/vector-icons";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

export const SellerScroller = ({ sellers = [], onSelect }) => {
  return (
    <FlatList
      horizontal
      data={sellers}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onSelect?.(item)}>
          <View style={styles.imageContainer}>
            <Image
              source={{
                uri: item.avatar || "https://via.placeholder.com/60x60",
              }}
              style={styles.avatar}
            />
            {item.badges && item.badges.includes("verified") && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.content}>
            <Text numberOfLines={1} style={styles.title}>
              {item.name}
            </Text>
            <View style={styles.badgeRow}>
              {item.badges && item.badges.length > 0 && (
                <>
                  {item.badges.includes("verified") && (
                    <View style={[styles.badge, styles.verifiedStoreBadge]}>
                      <Text numberOfLines={1} style={styles.badgeText}>
                        VERIFIED
                      </Text>
                    </View>
                  )}
                  {item.badges
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
            <View style={styles.metaRow}>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={styles.ratingText}>
                  {item.rating?.toFixed(1) || "0.0"}
                </Text>
                <Text style={styles.reviewsText}>
                  ({item.total_ratings || 0})
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  card: {
    width: 180,
    height: 220,
    backgroundColor: "#fff",
    borderRadius: 16,
    marginRight: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  imageContainer: {
    width: "100%",
    height: 120,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.light,
    position: "relative",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.light,
  },
  verifiedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  content: {
    padding: 12,
    paddingTop: 10,
    flex: 1,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedStoreBadge: {
    backgroundColor: "#10B981",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  metaRow: {
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.dark,
  },
  reviewsText: {
    fontSize: 11,
    color: colors.muted,
  },
});
