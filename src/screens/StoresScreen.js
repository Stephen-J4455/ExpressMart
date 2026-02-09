import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    ActivityIndicator,
    TextInput,
    RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";
import { SellerCard } from "../components/SellerCard";

export const StoresScreen = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { sellers, loading, refreshSellers } = useShop();
    const [searchQuery, setSearchQuery] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const filteredSellers = sellers.filter((seller) =>
        seller.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const onRefresh = async () => {
        setRefreshing(true);
        if (refreshSellers) await refreshSellers();
        setRefreshing(false);
    };

    const renderStoreCard = ({ item }) => (
        <SellerCard
            seller={item}
            onPress={() => navigation.navigate("Store", { seller: item })}
        />
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
                <View style={styles.headerTop}>
                    <Pressable
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="arrow-back" size={22} color={colors.dark} />
                    </Pressable>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitle}>All Stores</Text>
                        <View style={styles.storeCountBadge}>
                            <Text style={styles.storeCountText}>{sellers.length}</Text>
                        </View>
                    </View>
                    <Pressable style={styles.filterButton}>
                        <Ionicons name="options-outline" size={20} color={colors.dark} />
                    </Pressable>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={18} color={colors.muted} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search stores..."
                            placeholderTextColor={colors.muted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <Pressable onPress={() => setSearchQuery("")}>
                                <Ionicons name="close-circle" size={18} color={colors.muted} />
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>

            {/* Store Grid */}
            {loading && !refreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading stores...</Text>
                </View>
            ) : filteredSellers.length > 0 ? (
                <FlatList
                    data={filteredSellers}
                    keyExtractor={(item) => item.id}
                    renderItem={renderStoreCard}
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                        />
                    }
                />
            ) : (
                <View style={styles.centerContainer}>
                    <View style={styles.emptyIconContainer}>
                        <Ionicons name="storefront-outline" size={48} color={colors.primary} />
                    </View>
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F8FAFC",
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
    headerTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: "#F8FAFC",
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitleContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: colors.dark,
        letterSpacing: -0.5,
    },
    storeCountBadge: {
        backgroundColor: colors.primary,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    storeCountText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#fff",
    },
    filterButton: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: "#F8FAFC",
        alignItems: "center",
        justifyContent: "center",
    },
    searchContainer: {
        marginTop: 4,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: colors.dark,
        fontWeight: "500",
    },
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: colors.muted,
        fontWeight: "500",
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
    emptyTitle: {
        fontSize: 20,
        fontWeight: "800",
        color: colors.dark,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 15,
        color: colors.muted,
        textAlign: "center",
        lineHeight: 22,
    },
    clearSearchButton: {
        marginTop: 20,
        backgroundColor: colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
    },
    clearSearchText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "600",
    },
    listContent: {
        padding: 16,
        paddingTop: 24,
    },
    columnWrapper: {
        gap: 16,
        marginBottom: 16,
    },
});
