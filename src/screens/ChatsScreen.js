import { useState, useEffect, useMemo, useRef } from "react";
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
  TextInput,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useChat } from "../context/ChatContext";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { useAuth } from "../context/AuthContext";
import { radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useResponsive } from "../hooks/useResponsive";
import { ChatScreen } from "./ChatScreen";
import { SellerChatScreen } from "./SellerChatScreen";

const mapStoryAdToStatus = (ad) => ({
  id: `ad-story-${ad.id}`,
  is_ad_story: true,
  ad,
  status_type: ad?.image_url ? "image" : "text",
  media_url: ad?.image_url || null,
  status_text: ad?.description || ad?.title || "",
  background_color: ad?.background_color || "#0F172A",
  text_color: ad?.text_color || "#FFFFFF",
  seller: {
    id: `ad-${ad.id}`,
    name: ad?.title || "Sponsored",
    avatar: ad?.image_url || null,
  },
  created_at: ad?.created_at || new Date().toISOString(),
  cta_text: ad?.cta_text || "Open",
  cta_url: ad?.cta_url || null,
});

export const ChatsScreen = ({ navigation }) => {
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildChatsStyles(c));
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const { conversations, isOnline, isLoading, refreshConversations } =
    useChat();
  const { user } = useAuth();
  const { followedSellers } = useShop();
  const { fetchAdsByPlacement } = useAds();
  const [refreshing, setRefreshing] = useState(false);
  const [followedStatuses, setFollowedStatuses] = useState([]);
  const [messageStoryAds, setMessageStoryAds] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sellerConversations, setSellerConversations] = useState([]);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);

  // Entrance animation — mirrors HomeScreen's fade + slide
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const fetchSellerConversations = async () => {
    if (!user) {
      setSellerConversations([]);
      return;
    }
    try {
      setSellerLoading(true);
      const { data: sellerRow } = await supabase
        .from("express_sellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!sellerRow) {
        setSellerConversations([]);
        return;
      }
      const { data, error } = await supabase
        .from("express_chat_conversations")
        .select(
          `
          id,
          user_id,
          seller_id,
          last_message,
          last_message_at,
          created_at,
          express_profiles!user_id(id, full_name, avatar_url, email)
        `,
        )
        .eq("seller_id", sellerRow.id)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map((conv) => ({
        ...conv,
        customer: {
          id: conv.express_profiles?.id,
          name:
            conv.express_profiles?.full_name ||
            conv.express_profiles?.email ||
            "Customer",
          avatar: conv.express_profiles?.avatar_url || null,
        },
      }));
      setSellerConversations(mapped);
    } catch (err) {
      console.error("Error fetching seller conversations:", err);
      setSellerConversations([]);
    } finally {
      setSellerLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshConversations();
    await fetchFollowedStatuses();
    await fetchMessageStoryAds();
    await fetchSellerConversations();
    setRefreshing(false);
  };

  const fetchMessageStoryAds = async () => {
    try {
      const ads = await fetchAdsByPlacement("messages");
      const mapped = (ads || [])
        .filter((ad) => String(ad?.style || "").toLowerCase() === "story")
        .map(mapStoryAdToStatus);
      setMessageStoryAds(mapped);
    } catch (err) {
      console.error("Error fetching message story ads:", err);
      setMessageStoryAds([]);
    }
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

  useEffect(() => {
    fetchMessageStoryAds();
  }, [fetchAdsByPlacement]);

  useEffect(() => {
    fetchSellerConversations();
  }, [user]);

  const statusItems = [...messageStoryAds, ...followedStatuses];

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
    const isSelected = isWide && selectedConversation?.id === item.id;

    return (
      <Pressable
        style={[
          styles.conversationItem,
          isSelected && styles.conversationItemActive,
        ]}
        onPress={() => {
          if (isWide) {
            setSelectedConversation({ ...item, kind: "customer" });
          } else {
            navigation.navigate("Chat", { seller: item.seller });
          }
        }}
      >
        <View style={styles.avatar}>
          {sellerAvatar ? (
            <Image source={{ uri: sellerAvatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="storefront" size={24} color={themeColors.primary} />
          )}
        </View>
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text
              style={[styles.userName, isSelected && styles.userNameActive]}
              numberOfLines={1}
            >
              {sellerName}
            </Text>
            <Text style={styles.timestamp}>{timestamp}</Text>
          </View>
          <Text
            style={[styles.lastMessage, isSelected && styles.lastMessageActive]}
            numberOfLines={1}
          >
            {item.last_message || "No messages yet"}
          </Text>
        </View>
        <View style={styles.rightAction}>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread_count}</Text>
            </View>
          )}
          {!isWide && (
            <Ionicons name="chevron-forward" size={18} color={themeColors.muted} />
          )}
        </View>
      </Pressable>
    );
  };

  const renderSellerConversation = ({ item }) => {
    const customerName = item.customer?.name || "Customer";
    const customerAvatar = item.customer?.avatar;
    const timestamp = formatTimestamp(item.last_message_at || item.created_at);

    return (
      <Pressable
        style={styles.conversationItem}
        onPress={() => {
          if (isWide) {
            setSelectedConversation({ ...item, kind: "seller" });
          } else {
            navigation.navigate("SellerChat", {
              conversationId: item.id,
              customer: item.customer,
            });
          }
        }}
      >
        <View style={styles.avatar}>
          {customerAvatar ? (
            <Image source={{ uri: customerAvatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={24} color={themeColors.primary} />
          )}
        </View>
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.userName]} numberOfLines={1}>
              {customerName}
            </Text>
            <Text style={styles.timestamp}>{timestamp}</Text>
          </View>
          <Text style={[styles.lastMessage]} numberOfLines={1}>
            {item.last_message || "No messages yet"}
          </Text>
        </View>
        <View style={styles.rightAction}>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread_count}</Text>
            </View>
          )}
          {!isWide && (
            <Ionicons name="chevron-forward" size={18} color={themeColors.muted} />
          )}
        </View>
      </Pressable>
    );
  };

  const mergedConversations = useMemo(() => {
    const customerItems = (conversations || []).map((c) => ({
      ...c,
      kind: "customer",
    }));
    const sellerItems = (sellerConversations || []).map((c) => ({
      ...c,
      kind: "seller",
    }));
    const merged = [...customerItems, ...sellerItems].sort((a, b) => {
      const ta = new Date(a.last_message_at || a.created_at || 0).getTime();
      const tb = new Date(b.last_message_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((c) => {
      const name =
        c.kind === "seller"
          ? c.customer?.name || "Customer"
          : c.seller?.name || "Seller";
      const msg = c.last_message || "";
      return (
        name.toLowerCase().includes(q) || msg.toLowerCase().includes(q)
      );
    });
  }, [conversations, sellerConversations, searchQuery]);

  const renderMergedConversation = ({ item }) => {
    if (item.kind === "seller") {
      return renderSellerConversation({ item });
    }
    return renderConversation({ item });
  };

  if (isLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  const ConversationList = () => (
    <Animated.View
      style={[
        styles.container,
        isWide && styles.panelLeft,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.searchBackButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color={themeColors.light} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Messages</Text>
            {!isOnline && (
              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-offline" size={14} color="#ff6b6b" />
              </View>
            )}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.searchIconButton}
              onPress={() => setSearchVisible((v) => !v)}
            >
              <Ionicons
                name={searchVisible ? "close" : "search"}
                size={20}
                color={themeColors.light}
              />
            </Pressable>
          </View>
        </View>
        {!searchVisible && (
          <View style={styles.headerSubtitleRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerSubtitle}>Customer Support</Text>
          </View>
        )}

        {searchVisible && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={themeColors.muted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages"
              placeholderTextColor={themeColors.muted}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={themeColors.muted} />
              </Pressable>
            )}
          </View>
        )}

        {statusItems.length > 0 && (
          <View style={styles.headerStatusSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statusScrollContent}
            >
              {statusItems.map((status) => (
                <Pressable
                  key={status.id}
                  style={styles.statusCircle}
                  onPress={() =>
                    navigation.navigate("StatusViewer", { status })
                  }
                >
                  {status.seller?.avatar ? (
                    <Image
                      source={{ uri: status.seller.avatar }}
                      style={styles.statusAvatar}
                    />
                  ) : (
                    <View
                      style={[styles.statusAvatar, styles.statusAvatarFallback]}
                    >
                      <Ionicons
                        name={status.is_ad_story ? "megaphone" : "storefront"}
                        size={20}
                        color={themeColors.primary}
                      />
                    </View>
                  )}
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
        data={mergedConversations}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        renderItem={renderMergedConversation}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={themeColors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={48}
                color={themeColors.primary}
              />
            </View>
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>
              Start chatting with sellers{"\n"}to see your messages here.
            </Text>
            <Pressable
              style={styles.exploreButton}
              onPress={() => navigation.navigate("Main", { screen: "Home" })}
            >
              <Text style={styles.exploreButtonText}>Explore Stores</Text>
            </Pressable>
          </View>
        }
      />
    </Animated.View>
  );

  if (isWide) {
    return (
      <Animated.View
        style={[
          styles.wideLayout,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <ConversationList />
        <View style={styles.panelRight}>
          {selectedConversation ? (
            selectedConversation.kind === "seller" ? (
              <SellerChatScreen
                conversationId={selectedConversation.id}
                customer={selectedConversation.customer}
              />
            ) : (
              <ChatScreen seller={selectedConversation.seller} />
            )
          ) : (
            <View style={styles.noChatSelected}>
              <View style={styles.noChatIcon}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={56}
                  color={themeColors.primary}
                />
              </View>
              <Text style={styles.noChatTitle}>Select a conversation</Text>
              <Text style={styles.noChatSubtext}>
                Choose a conversation from the list{"\n"}to start messaging.
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  return <ConversationList />;
};

const buildChatsStyles = (c) =>
  StyleSheet.create({ 
  wideLayout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: c.background,
  },
  panelLeft: {
    width: 360,
    borderRightWidth: 1,
    borderRightColor: c.border,
    backgroundColor: c.light,
  },
  panelRight: {
    flex: 1,
    backgroundColor: c.background,
  },
  noChatSelected: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 40,
  },
  noChatIcon: {
    width: 110,
    height: 110,
    borderRadius: radius.xl,
    backgroundColor: c.light,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: c.primary,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  noChatTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: c.dark,
  },
  noChatSubtext: {
    fontSize: 15,
    color: c.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.background,
    gap: 12,
  },
  loadingText: {
    color: c.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  header: {
    backgroundColor: c.background,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: c.dark,
    letterSpacing: -0.5,
  },
  offlineBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
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
    borderRadius: radius.pill,
    backgroundColor: c.success,
  },
  headerSubtitle: {
    fontSize: 13,
    color: c.muted,
    fontWeight: "500",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchBackButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: c.dark,
    fontWeight: "500",
    paddingVertical: 0,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: c.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: c.muted,
  },
  tabTextActive: {
    color: "#fff",
  },
  listContainer: {
    padding: 16,
    paddingTop: 16,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.background,
    padding: 14,
  },
  conversationItemActive: {
    backgroundColor: "#FFF1F4",
    borderBottomColor: c.primary,
    borderBottomWidth: 1,
  },
  userNameActive: {
    color: c.primary,
  },
  lastMessageActive: {
    color: c.dark,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
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
    color: c.dark,
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: c.muted,
    fontWeight: "500",
  },
  lastMessage: {
    fontSize: 14,
    color: c.muted,
    fontWeight: "400",
  },
  rightAction: {
    alignItems: "flex-end",
    gap: 8,
    marginLeft: 8,
  },
  unreadBadge: {
    backgroundColor: c.primary,
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
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
    backgroundColor: c.light,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  statusSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: c.dark,
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
    borderRadius: radius.pill,
    borderWidth: 2.5,
    borderColor: c.primary,
    marginBottom: 6,
  },
  statusAvatarFallback: {
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statusIndicator: {
    position: "absolute",
    bottom: 6,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    borderWidth: 2,
    borderColor: c.light,
  },
  statusSellerName: {
    fontSize: 11,
    fontWeight: "500",
    color: c.muted,
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
    borderRadius: radius.xl,
    backgroundColor: c.light,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: c.primary,
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "800",
    color: c.dark,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: c.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  exploreButton: {
    backgroundColor: c.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.pill,
    shadowColor: c.primary,
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
