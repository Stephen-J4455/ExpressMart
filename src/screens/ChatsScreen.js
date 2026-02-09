import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Image,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useChat } from "../context/ChatContext";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";

export const ChatsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    conversations,
    isOnline,
    isLoading,
    refreshConversations,
  } = useChat();
  const { followedSellers } = useShop();
  const [refreshing, setRefreshing] = useState(false);
  const [followedStatuses, setFollowedStatuses] = useState([]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshConversations();
    await fetchFollowedStatuses();
    setRefreshing(false);
  };

  const fetchFollowedStatuses = async () => {
    try {
      if (!followedSellers || followedSellers.length === 0) {
        setFollowedStatuses([]);
        return;
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_seller_statuses")
        .select("*, seller:express_sellers(id, name, avatar)")
        .in("seller_id", followedSellers)
        .eq("is_active", true)
        .gt("expires_at", now)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // de-duplicate by seller_id, keeping latest per seller
      const unique = [];
      const seen = new Set();
      (data || []).forEach((row) => {
        if (!seen.has(row.seller_id)) {
          seen.add(row.seller_id);
          unique.push(row);
        }
      });

      setFollowedStatuses(unique);
    } catch (err) {
      console.error("Error fetching followed statuses:", err);
    }
  };

  useEffect(() => {
    fetchFollowedStatuses();
  }, [followedSellers]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now - date;
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return diffInMinutes <= 1 ? "now" : `${diffInMinutes}m`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)}d`;
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const renderConversation = ({ item }) => {
    const sellerName = item.seller?.name || "Seller";
    const sellerAvatar = item.seller?.avatar;
    const timestamp = formatTimestamp(item.last_message_at || item.created_at);

    return (
      <Pressable
        style={styles.conversationItem}
        onPress={() => navigation.navigate("Chat", { seller: item.seller })}
      >
        <View style={styles.avatar}>
          {sellerAvatar ? (
            <Image source={{ uri: sellerAvatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="storefront" size={24} color={colors.primary} />
          )}
        </View>
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.userName} numberOfLines={1}>
              {sellerName}
            </Text>
            <Text style={styles.timestamp}>{timestamp}</Text>
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.last_message || "No messages yet"}
          </Text>
        </View>
        <View style={styles.rightAction}>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread_count}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </Pressable>
    );
  };

  if (isLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Messages</Text>
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline" size={14} color="#ff6b6b" />
            </View>
          )}
        </View>
        <View style={styles.headerSubtitleRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.headerSubtitle}>Customer Support</Text>
        </View>

        {/* Followed Sellers Status Section - in Header */}
        {followedStatuses.length > 0 && (
          <View style={styles.headerStatusSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statusScrollContent}
            >
              {followedStatuses.map((status) => (
                <Pressable
                  key={status.id}
                  style={styles.statusCircle}
                  onPress={() => navigation.navigate("StatusViewer", { status })}
                >
                  <Image
                    source={{ uri: status.seller.avatar }}
                    style={styles.statusAvatar}
                  />
                  <View style={styles.statusIndicator} />
                  <Text style={styles.statusSellerName} numberOfLines={1}>
                    {status.seller.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={48}
                color={colors.primary}
              />
            </View>
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>
              Start chatting with sellers{"\n"}to see your messages here.
            </Text>
            <Pressable
              style={styles.exploreButton}
              onPress={() => navigation.navigate("Home")}
            >
              <Text style={styles.exploreButtonText}>Explore Stores</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.light,
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.5,
  },
  offlineBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffeaea",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "500",
  },
  listContainer: {
    padding: 16,
    paddingTop: 24,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  userName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.dark,
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  lastMessage: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "400",
  },
  rightAction: {
    alignItems: "flex-end",
    gap: 8,
    marginLeft: 8,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  headerStatusSection: {
    marginTop: 16,
    paddingVertical: 12,
  },
  statusSection: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  statusSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  statusScrollContent: {
    paddingHorizontal: 12,
    gap: 12,
  },
  statusCircle: {
    alignItems: "center",
    width: 70,
  },
  statusAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: colors.primary,
    marginBottom: 6,
  },
  statusIndicator: {
    position: "absolute",
    bottom: 6,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  statusSellerName: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.muted,
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 100,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 35,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.dark,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  exploreButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  exploreButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
