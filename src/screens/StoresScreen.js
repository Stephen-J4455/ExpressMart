import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShop } from "../context/ShopContext";
import { radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { SellerCard } from "../components/SellerCard";
import { useResponsive } from "../hooks/useResponsive";

export const StoresScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const { sellers, loading, refreshSellers } = useShop();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortOption, setSortOption] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 16);
  const styles = useAppStyles((c) => buildStoresStyles(c));

  const searchVisible = showSearch || searchQuery.length > 0;

  const displayedSellers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = sellers.filter((seller) =>
      seller.name.toLowerCase().includes(q),
    );

    if (sortOption === "name-asc") {
      list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === "rating-desc") {
      list = list.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortOption === "newest") {
      list = list
        .slice()
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return list;
  }, [sellers, searchQuery, sortOption]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (refreshSellers) {
        await refreshSellers();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const renderStoreCard = ({ item }) => (
    <View style={{ width: itemWidth }}>
      <SellerCard
        seller={item}
        onPress={() =>
          navigation.navigate("Store", { sellerId: item?.id, seller: item })
        }
      />
    </View>
  );

  const sortOptions = [
    { key: "", label: "Default", icon: "apps-outline" },
    { key: "name-asc", label: "Name (A-Z)", icon: "text-outline" },
    { key: "rating-desc", label: "Highest rated", icon: "star-outline" },
    { key: "newest", label: "Newest", icon: "time-outline" },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[themeColors.primary, themeColors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 18 }]}
      >
        <View style={styles.headerTop}>
          <Pressable
            style={styles.glassButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>All Stores</Text>
            <View style={styles.storeCountBadge}>
              <Text style={styles.storeCountText}>{sellers.length}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.glassButton}
              onPress={() => setShowSearch((v) => !v)}
            >
              <Ionicons name="search" size={20} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.glassButton}
              onPress={() => setShowSortModal(true)}
            >
              <Ionicons name="options-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Text style={styles.headerSubtitle}>
          Find and follow your favorite stores
        </Text>

        {/* Search Bar (revealed on search icon tap) */}
        {searchVisible && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={themeColors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search stores..."
              placeholderTextColor={themeColors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={showSearch}
            />
            <Pressable
              onPress={() => {
                setSearchQuery("");
                setShowSearch(false);
              }}
            >
              <Ionicons name="close-circle" size={18} color={themeColors.muted} />
            </Pressable>
          </View>
        )}
      </LinearGradient>

     
      {/* Store Grid */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={styles.loadingText}>Loading stores...</Text>
          </View>
        </View>
      ) : displayedSellers.length > 0 ? (
        <FlatList
          data={displayedSellers}
          keyExtractor={(item) => item.id}
          renderItem={renderStoreCard}
          numColumns={gridColumns}
          key={`grid-${gridColumns}`}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 16 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themeColors.primary}
            />
          }
        />
      ) : (
        <View style={styles.centerContainer}>
          <LinearGradient
            colors={[themeColors.primary + "22", themeColors.accent + "22"]}
            style={styles.emptyIconContainer}
          >
            <Ionicons name="storefront-outline" size={48} color={themeColors.primary} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No stores found</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? "Try a different search term"
              : "Check back later for new stores"}
          </Text>
          {searchQuery && (
            <Pressable
              style={styles.clearSearchButton}
              onPress={() => setSearchQuery("")}
            >
              <Text style={styles.clearSearchText}>Clear Search</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowSortModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <LinearGradient
              colors={[themeColors.primary, themeColors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalHeader}
            >
              <Ionicons name="swap-vertical-outline" size={20} color="#fff" />
              <Text style={styles.modalTitle}>Sort stores</Text>
            </LinearGradient>
            {sortOptions.map((opt) => {
              const selected = sortOption === opt.key;
              return (
                <Pressable
                  key={opt.key || "default"}
                  style={[
                    styles.sortOption,
                    selected && styles.sortOptionSelected,
                  ]}
                  onPress={() => {
                    setSortOption(opt.key);
                    setShowSortModal(false);
                  }}
                >
                  <View style={styles.sortOptionLeft}>
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={selected ? themeColors.primary : themeColors.muted}
                    />
                    <Text
                      style={[
                        styles.sortOptionText,
                        selected && styles.sortOptionTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {selected && (
                    <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const buildStoresStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 28,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      shadowColor: c.primary,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 8,
    },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  glassButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
    marginBottom: 16,
  },
  storeCountBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  storeCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    marginTop: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: c.dark,
    fontWeight: "500",
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionTitleWrap: {
    flexDirection: "column",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: c.dark,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: c.muted,
    fontWeight: "500",
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    paddingVertical: 36,
    paddingHorizontal: 48,
    alignItems: "center",
    shadowColor: c.primary,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: c.muted,
    fontWeight: "600",
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: c.dark,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: c.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  clearSearchButton: {
    marginTop: 20,
    backgroundColor: c.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.pill,
    shadowColor: c.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  clearSearchText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  columnWrapper: {
    gap: 12,
    marginBottom: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  sortOptionSelected: {
    backgroundColor: "#FFF5F7",
  },
  sortOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sortOptionText: {
    fontSize: 15,
    color: c.dark,
    fontWeight: "600",
  },
  sortOptionTextSelected: {
    color: c.primary,
    fontWeight: "700",
  },
});