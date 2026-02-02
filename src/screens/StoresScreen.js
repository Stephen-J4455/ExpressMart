import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    SafeAreaView,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";
import { SellerCard } from "../components/SellerCard";

export const StoresScreen = () => {
    const navigation = useNavigation();
    const { sellers, loading } = useShop();
    const [searchQuery, setSearchQuery] = useState("");

    const filteredSellers = sellers.filter((seller) =>
        seller.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderStoreCard = ({ item }) => (
        <SellerCard
            seller={item}
            onPress={() => navigation.navigate("Store", { seller: item })}
        />
    );

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
                <Text style={styles.headerTitle}>All Stores</Text>
                <View style={{ width: 44 }} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={colors.muted} />
                <Text
                    style={styles.searchPlaceholder}
                    onPress={() => navigation.navigate("Search")}
                >
                    Search stores...
                </Text>
            </View>

            {/* Store Grid */}
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
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
                />
            ) : (
                <View style={styles.centerContainer}>
                    <Ionicons name="storefront-outline" size={64} color={colors.muted} />
                    <Text style={styles.emptyTitle}>No stores found</Text>
                    <Text style={styles.emptySubtitle}>
                        Try adjusting your search
                    </Text>
                </View>
            )}
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
        paddingHorizontal: 8,
        paddingVertical: 12,
        paddingTop: 35,
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
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 8,
        marginVertical: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.light,
    },
    searchPlaceholder: {
        marginLeft: 10,
        fontSize: 14,
        color: colors.muted,
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.dark,
        marginTop: 12,
    },
    emptySubtitle: {
        fontSize: 14,
        color: colors.muted,
        marginTop: 4,
    },
    listContent: {
        paddingHorizontal: 2,
        paddingVertical: 8,
    },
    columnWrapper: {
        gap: 8,
        paddingHorizontal: 8,
        marginBottom: 8,
        flex: 1,
        justifyContent: "space-between",
    },
});
