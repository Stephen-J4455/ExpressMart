import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShop } from "../context/ShopContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

export const FollowingScreen = ({ navigation }) => {
  const { sellers, followedSellers, unfollowSeller, isFollowing } = useShop();
  const toast = useToast();
  const [unfollowingId, setUnfollowingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const followed = sellers.filter((s) => followedSellers.includes(s.id));

  const handleUnfollow = async (seller) => {
    setUnfollowingId(seller.id);
    try {
      await unfollowSeller(seller.id);
      toast.success("Unfollowed", `You unfollowed ${seller.name}`);
    } catch {
      toast.error("Failed to unfollow", "Please try again");
    } finally {
      setUnfollowingId(null);
    }
  };

  const renderSeller = ({ item }) => {
    const isVerified = item.badges?.includes("verified");
    const isUnfollowing = unfollowingId === item.id;

    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate("Store", { seller: item })}
      >
        {/* Banner / Avatar area */}
        <View style={styles.cardImageArea}>
          <Image
            source={{
              uri: item.avatar || "https://via.placeholder.com/160x90",
            }}
            style={styles.cardAvatar}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.35)"]}
            style={StyleSheet.absoluteFill}
          />
          {isVerified && (
            <View style={styles.verifiedPill}>
              <Ionicons name="checkmark-circle" size={11} color="#fff" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.sellerName}>
                {item.name}
              </Text>
              {item.total_ratings > 0 && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={11} color="#F59E0B" />
                  <Text style={styles.ratingText}>
                    {item.rating?.toFixed(1)} ({item.total_ratings})
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              style={[
                styles.unfollowBtn,
                isUnfollowing && styles.unfollowBtnLoading,
              ]}
              onPress={() => handleUnfollow(item)}
              disabled={!!isUnfollowing}
            >
              {isUnfollowing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Ionicons
                    name="person-remove-outline"
                    size={13}
                    color={colors.accent}
                  />
                  <Text style={styles.unfollowBtnText}>Unfollow</Text>
                </>
              )}
            </Pressable>
          </View>

          <Pressable
            style={styles.visitBtn}
            onPress={() => navigation.navigate("Store", { seller: item })}
          >
            <Text style={styles.visitBtnText}>Visit Store</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.primary} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <LinearGradient
          colors={[colors.primary + "20", colors.accent + "20"]}
          style={styles.emptyIconBg}
        >
          <Ionicons
            name="storefront-outline"
            size={48}
            color={colors.primary}
          />
        </LinearGradient>
      </View>
      <Text style={styles.emptyTitle}>No stores followed yet</Text>
      <Text style={styles.emptySubtitle}>
        Follow stores to keep up with their latest products and deals
      </Text>
      <Pressable
        style={styles.exploreBtn}
        onPress={() => navigation.navigate("Stores")}
      >
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          style={styles.exploreBtnGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons name="compass-outline" size={18} color="#fff" />
          <Text style={styles.exploreBtnText}>Explore Stores</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Following</Text>
          {followed.length > 0 && (
            <Text style={styles.headerSubtitle}>
              {followed.length} store{followed.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
        <Pressable
          style={styles.exploreIconBtn}
          onPress={() => navigation.navigate("Stores")}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={followed}
        keyExtractor={(item) => item.id}
        renderItem={renderSeller}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {}} />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },
  backBtn: { padding: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  exploreIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: 12,
    paddingBottom: 32,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardImageArea: {
    width: "100%",
    height: 100,
    backgroundColor: "#F1F5F9",
    position: "relative",
  },
  cardAvatar: {
    width: "100%",
    height: "100%",
  },
  verifiedPill: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 3,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },
  cardBody: {
    padding: 12,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  sellerName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  ratingText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "500",
  },
  unfollowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent + "50",
    backgroundColor: colors.accent + "10",
  },
  unfollowBtnLoading: {
    opacity: 0.6,
  },
  unfollowBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.accent,
  },
  visitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.primary + "12",
    paddingVertical: 8,
    borderRadius: 10,
  },
  visitBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIconWrap: { marginBottom: 20 },
  emptyIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.dark,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  exploreBtn: { borderRadius: 14, overflow: "hidden" },
  exploreBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  exploreBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
