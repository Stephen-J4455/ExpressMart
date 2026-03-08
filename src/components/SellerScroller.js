import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useShop } from "../context/ShopContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

export const SellerScroller = ({ sellers = [], onSelect }) => {
  const { isFollowing, followSeller, unfollowSeller } = useShop();
  const toast = useToast();
  const [followingLoading, setFollowingLoading] = useState({});

  const handleFollowPress = async (e, seller) => {
    e.preventDefault();
    if (!seller.id) return;
    setFollowingLoading((prev) => ({ ...prev, [seller.id]: true }));
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
      setFollowingLoading((prev) => ({ ...prev, [seller.id]: false }));
    }
  };
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
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.5)"]}
              style={styles.imageGradient}
            />
            {item.badges && item.badges.includes("verified") && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={10} color="#fff" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
            <View style={styles.ratingOnImage}>
              <Ionicons name="star" size={10} color="#FBBF24" />
              <Text style={styles.ratingOnImageText}>
                {item.rating?.toFixed(1) || "0.0"}
              </Text>
            </View>
          </View>
          <View style={styles.content}>
            <Text numberOfLines={1} style={styles.title}>
              {item.name}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.reviewsRow}>
                <Ionicons name="people-outline" size={12} color={colors.muted} />
                <Text style={styles.reviewsText}>
                  {item.total_ratings || 0} reviews
                </Text>
                <Pressable
                  style={[
                    styles.followButtonThin,
                    isFollowing(item.id) && styles.followButtonThinActive,
                  ]}
                  onPress={(e) => handleFollowPress(e, item)}
                  disabled={followingLoading[item.id]}
                >
                  {followingLoading[item.id] ? (
                    <ActivityIndicator
                      size="small"
                      color="#DC2626"
                    />
                  ) : (
                    <>
                      {!isFollowing(item.id) && (
                        <Ionicons
                          name="add"
                          size={13}
                          color="#DC2626"
                        />
                      )}
                      <Text style={styles.followButtonThinText}>
                        {isFollowing(item.id) ? "Following" : "Follow"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
            <View style={styles.visitRow}>
              <Text style={styles.visitText}>Visit</Text>
              <Ionicons name="arrow-forward" size={12} color={colors.primary} />
            </View>
          </View>
        </Pressable>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  card: {
    width: 170,
    height: 230,
    backgroundColor: "#fff",
    borderRadius: 22,
    marginRight: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: "hidden",
  },
  imageContainer: {
    width: "100%",
    height: 120,
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
    height: 50,
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
    borderRadius: 12,
    gap: 3,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },
  ratingOnImage: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 3,
  },
  ratingOnImageText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.dark,
  },
  content: {
    padding: 14,
    flex: 1,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  metaRow: {
    marginTop: 6,
  },
  reviewsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewsText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "500",
  },
  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
    marginTop: 8,
  },
  visitText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  followButtonThin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
  },
});
