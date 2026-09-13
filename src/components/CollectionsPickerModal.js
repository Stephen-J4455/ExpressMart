// CollectionsPickerModal
// ---------------------------------------------------------------------------
// Bottom-sheet picker used by the FeedProductCard overflow menu's "Add to
// collection" action.
//
// UX flow:
//   1. Sheet opens, lists every collection owned by the current user.
//   2. Tapping a row inserts the product into that collection (with a check
//      when the product is already present) and shows a toast.
//   3. The "+ New collection" row at the top swaps the list for a small
//      create form. After create, the new collection is auto-selected and
//      the product is added in the same flow.
//   4. If the user has zero collections, the list state is skipped entirely
//      and the create form opens immediately so they aren't stuck looking at
//      an empty screen.
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";
import {
  listUserCollections,
  createCollection,
  addProductToCollection,
  collectionsContainingProduct,
} from "../services/collectionsService";

export const CollectionsPickerModal = ({ visible, product, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildStyles);

  const [mode, setMode] = useState("list"); // 'list' | 'create'
  const [collections, setCollections] = useState([]);
  const [membership, setMembership] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState("");

  const productId = product?.id;

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setCollections([]);
      setMembership(new Set());
      return;
    }
    setLoading(true);
    try {
      const [list, memberSet] = await Promise.all([
        listUserCollections(user),
        collectionsContainingProduct(user, productId),
      ]);
      setCollections(list);
      setMembership(memberSet);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, productId]);

  useEffect(() => {
    if (!visible) return;
    refresh();
    setNewName("");
    setMode("list");
  }, [visible, refresh]);

  const onAdd = async (collection) => {
    if (!isAuthenticated || !user) {
      toast.info("Sign in required", "Please sign in to use collections.");
      return;
    }
    if (membership.has(collection.id)) {
      toast.info(
        "Already added",
        `This product is already in "${collection.name}".`,
      );
      return;
    }
    setSubmitting(true);
    const result = await addProductToCollection(user, collection.id, productId);
    setSubmitting(false);
    if (result.success) {
      const next = new Set(membership);
      next.add(collection.id);
      setMembership(next);
      toast.success(
        "Added to collection",
        `Saved to "${collection.name}".`,
      );
    } else {
      toast.error("Could not add", result.error || "Please try again.");
    }
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Name required", "Give your collection a name.");
      return;
    }
    setSubmitting(true);
    const created = await createCollection(user, { name });
    if (!created.success || !created.data) {
      setSubmitting(false);
      toast.error("Could not create", created.error || "Please try again.");
      return;
    }
    // Immediately add the product to the freshly-created collection.
    const added = await addProductToCollection(
      user,
      created.data.id,
      productId,
    );
    setSubmitting(false);
    if (added.success) {
      toast.success(
        "Collection created",
        `"${created.data.name}" saved with this product.`,
      );
      onClose();
    } else {
      toast.error("Could not add", added.error || "Please try again.");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Outer Pressable is the dimmed tap-to-dismiss layer. It fills the
          modal (`flex: 1`) and uses `justifyContent: "flex-end"` to anchor
          the KeyboardAvoidingView (and its child sheet) to the bottom of
          the screen. We deliberately do NOT make the KeyboardAvoidingView
          itself `flex: 1` — see the comment below. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* KeyboardAvoidingView only takes its intrinsic height (set via
            `width: "100%"` and no `flex`). With `behavior="padding"`, it
            applies `paddingBottom: <keyboard-height>` to itself, which
            shrinks its inner content area — pushing the sheet inside it
            up by the keyboard height so it stays visible.

            The KAV does NOT own the flex-end anchoring (the outer
            Pressable does), and it does NOT stretch to fill the screen
            height. This avoids the empty-strip issue: when the keyboard
            is closed, the KAV's height equals the sheet's height, so the
            sheet sits flush against the bottom of the screen with no gap.

            This matches the existing pattern in PaymentsScreen.js and
            SellerAdminScreen.js. */}
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {mode === "create" ? "New collection" : "Save to collection"}
              </Text>
              <Pressable
                hitSlop={10}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={c.dark} />
              </Pressable>
            </View>

            {mode === "list" ? (
              <View style={styles.body}>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={c.primary} />
                  <Text style={styles.loadingText}>
                    Loading your collections…
                  </Text>
                </View>
              ) : (
                <>
                  <Pressable
                    style={[styles.row, styles.rowNew]}
                    onPress={() => setMode("create")}
                    accessibilityRole="button"
                    accessibilityLabel="Create a new collection"
                  >
                    <View
                      style={[styles.iconWrap, styles.iconWrapNew]}
                    >
                      <Ionicons name="add" size={18} color={c.primary} />
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowTitle}>New collection</Text>
                      <Text style={styles.rowSubtitle}>
                        Group products by theme, gift list, etc.
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={c.muted}
                    />
                  </Pressable>

                  {collections.length === 0 ? (
                    <Text style={styles.empty}>
                      You don't have any collections yet. Create your first
                      one to start saving products.
                    </Text>
                  ) : (
                    collections.map((col) => {
                      const isMember = membership.has(col.id);
                      return (
                        <Pressable
                          key={col.id}
                          style={styles.row}
                          disabled={submitting}
                          onPress={() => onAdd(col)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isMember
                              ? `${col.name} (already contains this product)`
                              : `Add to ${col.name}`
                          }
                        >
                          <View style={styles.iconWrap}>
                            <Ionicons
                              name={
                                isMember
                                  ? "checkmark-circle"
                                  : "folder-outline"
                              }
                              size={18}
                              color={isMember ? c.primary : c.dark}
                            />
                          </View>
                          <View style={styles.rowTextWrap}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {col.name}
                            </Text>
                            <Text style={styles.rowSubtitle}>
                              {col.itemCount}{" "}
                              {col.itemCount === 1 ? "product" : "products"}
                              {col.isPrivate ? " · Private" : ""}
                            </Text>
                          </View>
                          {submitting ? (
                            <ActivityIndicator
                              size="small"
                              color={c.primary}
                            />
                          ) : (
                            <Ionicons
                              name="add-circle-outline"
                              size={20}
                              color={c.primary}
                            />
                          )}
                        </Pressable>
                      );
                    })
                  )}
                </>
              )}
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={styles.createHint}>
                Give your collection a name. You can rename or delete it
                later.
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Birthday wishlist"
                placeholderTextColor={c.muted}
                style={styles.input}
                autoFocus
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={onCreate}
              />
              <View style={styles.createActions}>
                <Pressable
                  style={[styles.createBtn, styles.createBtnGhost]}
                  onPress={() => {
                    setNewName("");
                    setMode("list");
                  }}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.createBtnText, { color: c.muted }]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.createBtn, styles.createBtnPrimary]}
                  onPress={onCreate}
                  disabled={submitting}
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={c.onPrimary} />
                  ) : (
                    <Text
                      style={[styles.createBtnText, { color: c.onPrimary }]}
                    >
                      Create & save
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.backdrop,
      justifyContent: "flex-end",
    },
   
    keyboardWrap: {
      width: "100%",
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: 10,
      paddingBottom: 0,
      maxHeight: "100%",
    },
    handle: {
      alignSelf: "center",
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    title: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      flex: 1,
      paddingRight: 12,
    },
    body: {
      paddingHorizontal: 8,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 18,
    },
    loadingText: {
      fontSize: 13,
      color: c.muted,
    },
    empty: {
      fontSize: 13,
      color: c.muted,
      paddingHorizontal: 12,
      paddingVertical: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.md,
    },
    rowNew: {
      backgroundColor: c.primary + "10",
      marginBottom: 6,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrapNew: {
      backgroundColor: c.surface,
      borderColor: c.primary + "55",
    },
    rowTextWrap: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.dark,
    },
    rowSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    createHint: {
      fontSize: 13,
      color: c.muted,
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    input: {
      marginHorizontal: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.dark,
      backgroundColor: c.background,
    },
    createActions: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 12,
      paddingTop: 16,
    },
    createBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: radius.md,
    },
    createBtnGhost: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    createBtnPrimary: {
      backgroundColor: c.primary,
    },
    createBtnText: {
      fontSize: 14,
      fontWeight: "700",
    },
  });