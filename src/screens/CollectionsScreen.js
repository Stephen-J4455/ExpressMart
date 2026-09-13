// CollectionsScreen
// ---------------------------------------------------------------------------
// The Account-page entry point for the user's saved-product collections.
// Lists every collection owned by the signed-in user, lets them create new
// ones inline, and pushes to CollectionDetailScreen when a card is tapped.
//
// Data flows from the `collectionsService` (express_collections +
// express_collection_items). The previous WishlistScreen was backed by the
// flat express_wishlists table — that table is no longer used here.
// ---------------------------------------------------------------------------

import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import {
  listUserCollections,
  createCollection,
} from "../services/collectionsService";
import { supabase } from "../lib/supabase";
import { radius } from "../theme/colors";

const COLLECTION_NAME_LIMIT = 80;

export const CollectionsScreen = ({ navigation }) => {
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildCollectionsStyles(c));
  const { user } = useAuth();
  const toast = useToast();

  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(async () => {
    if (!user) {
      setCollections([]);
      return;
    }
    try {
      const list = await listUserCollections(user);
      setCollections(list);
    } catch (e) {
      console.warn("[CollectionsScreen] refresh failed:", e?.message);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    (async () => {
      await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  // Realtime: react to inserts/updates/deletes on either collections or
  // collection_items so the list's `itemCount` stays fresh as the user adds
  // or removes products from anywhere in the app (e.g. the FeedProductCard
  // overflow menu's "Add to collection").
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`collections-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_collections",
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_collection_items",
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      Promise.resolve(ch.unsubscribe?.()).catch(() => {});
    };
  }, [user, refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.info("Name required", "Give your collection a name first.");
      return;
    }
    if (!user) return;
    setCreating(true);
    const result = await createCollection(user, {
      name: trimmed.slice(0, COLLECTION_NAME_LIMIT),
    });
    setCreating(false);
    if (!result.success) {
      toast.error("Could not create", result.error || "Unknown error");
      return;
    }
    setNewName("");
    toast.success("Collection created", `"${trimmed}" is ready to fill.`);
    await refresh();
  };

  const confirmDelete = (collection) => {
    Alert.alert(
      "Delete collection?",
      `"${collection.name}" will be removed. The products inside it stay in your other collections and the store.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("express_collections")
              .delete()
              .eq("id", collection.id);
            if (error) {
              toast.error("Could not delete", error.message);
              return;
            }
            await refresh();
          },
        },
      ],
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <View style={styles.listHeaderText}>
        <Text style={styles.title}>Your collections</Text>
        <Text style={styles.subtitle}>
          Group the products you love into themed boards — for ideas, moods,
          wishlists, or any reason you like.
        </Text>
      </View>
      <View style={styles.createCard}>
        <View style={styles.createCardHeader}>
          <Ionicons
            name="add-circle"
            size={20}
            color={themeColors.primary}
          />
          <Text style={styles.createCardTitle}>New collection</Text>
        </View>
        <TextInput
          style={styles.createInput}
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Birthday wishlist"
          placeholderTextColor={themeColors.muted}
          maxLength={COLLECTION_NAME_LIMIT}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
          editable={!creating}
        />
        <Pressable
          style={[
            styles.createBtn,
            (!newName.trim() || creating) && styles.createBtnDisabled,
          ]}
          onPress={handleCreate}
          disabled={!newName.trim() || creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  const renderItem = ({ item }) => (
    <Pressable
      style={styles.row}
      onPress={() =>
        navigation.navigate("CollectionDetail", {
          collectionId: item.id,
          collectionName: item.name,
        })
      }
      onLongPress={() => confirmDelete(item)}
      delayLongPress={400}
    >
      <View style={styles.coverWrap}>
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.cover} />
        ) : (
          <LinearGradient
            colors={[themeColors.primary, themeColors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cover}
          >
            <Ionicons
              name="bookmark"
              size={26}
              color="rgba(255,255,255,0.9)"
            />
          </LinearGradient>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowSubtitle}>
          {item.itemCount} item{item.itemCount === 1 ? "" : "s"}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={themeColors.muted}
      />
    </Pressable>
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={themeColors.dark}
            />
          </Pressable>
          <Text style={styles.headerTitle}>My Collection</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons
            name="bookmark-outline"
            size={80}
            color={themeColors.muted}
          />
          <Text style={styles.emptyTitle}>
            Sign in to access your collection
          </Text>
          <Pressable
            style={styles.signInButton}
            onPress={() =>
              navigation.navigate("Auth", { redirectTo: "Collections" })
            }
          >
            <LinearGradient
              colors={[themeColors.primary, themeColors.accent]}
              style={styles.signInGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={themeColors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>My Collection</Text>
        <Pressable
          onPress={onRefresh}
          hitSlop={10}
          accessibilityLabel="Refresh"
        >
          <Ionicons
            name="refresh-outline"
            size={22}
            color={themeColors.dark}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : (
        <FlatList
          data={collections}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyInline}>
              <Ionicons
                name="bookmark-outline"
                size={48}
                color={themeColors.muted}
              />
              <Text style={styles.emptyInlineTitle}>
                No collections yet
              </Text>
              <Text style={styles.emptyInlineSubtitle}>
                Use the box above to create your first one.
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themeColors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const buildCollectionsStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: c.light,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.dark,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      padding: 16,
      gap: 12,
      paddingBottom: 32,
    },
    listHeader: {
      marginBottom: 6,
    },
    listHeaderText: {
      marginBottom: 14,
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: c.dark,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: c.muted,
      lineHeight: 18,
    },

    // Create card
    createCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    createCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    createCardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.dark,
    },
    createInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: c.dark,
      backgroundColor: c.background,
      marginBottom: 10,
    },
    createBtn: {
      backgroundColor: c.primary,
      borderRadius: radius.md,
      paddingVertical: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    createBtnDisabled: {
      opacity: 0.5,
    },
    createBtnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 14,
    },

    // Collection row
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    coverWrap: {
      width: 56,
      height: 56,
      borderRadius: 14,
      overflow: "hidden",
    },
    cover: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 2,
    },
    rowSubtitle: {
      fontSize: 12,
      color: c.muted,
    },
    sep: {
      height: 0,
    },

    // Empty states
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: c.dark,
      marginTop: 20,
      marginBottom: 8,
      textAlign: "center",
    },
    emptyInline: {
      alignItems: "center",
      paddingVertical: 32,
    },
    emptyInlineTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.dark,
      marginTop: 10,
      marginBottom: 4,
    },
    emptyInlineSubtitle: {
      fontSize: 13,
      color: c.muted,
      textAlign: "center",
    },

    // Sign-in CTA
    signInButton: {
      borderRadius: radius.xl,
      overflow: "hidden",
      marginTop: 16,
    },
    signInGradient: {
      paddingHorizontal: 40,
      paddingVertical: 14,
      alignItems: "center",
    },
    signInText: {
      color: c.light,
      fontSize: 16,
      fontWeight: "700",
    },
  });