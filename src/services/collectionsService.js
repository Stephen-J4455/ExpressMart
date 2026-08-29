// collectionsService
// ---------------------------------------------------------------------------
// CRUD for the user's product collections. Backed by the `express_collections`
// and `express_collection_items` tables. All methods require a signed-in user
// (the RLS policies enforce ownership) — callers should validate auth first.
// ---------------------------------------------------------------------------

import { supabase } from "../lib/supabase";

const COLLECTIONS_TABLE = "express_collections";
const ITEMS_TABLE = "express_collection_items";

const requireUser = (user) => {
  if (!user || !user.id) {
    throw new Error("You must be signed in to manage collections.");
  }
  return user.id;
};

/**
 * List every collection owned by the current user, newest first. Includes a
 * small `item_count` so the picker can show "12 products" without a second
 * round-trip per row.
 */
export const listUserCollections = async (user) => {
  const userId = requireUser(user);
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .select(
      "id, name, description, cover_image, is_private, created_at, updated_at, express_collection_items(count)",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("[collectionsService] list failed:", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    coverImage: row.cover_image,
    isPrivate: row.is_private,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: Array.isArray(row.express_collection_items)
      ? row.express_collection_items[0]?.count || 0
      : 0,
  }));
};

/**
 * Create a new collection. Returns the inserted row (with id) or null on
 * failure.
 */
export const createCollection = async (user, { name, description = null }) => {
  const userId = requireUser(user);
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    throw new Error("Collection name is required.");
  }
  const { data, error } = await supabase
    .from(COLLECTIONS_TABLE)
    .insert({
      user_id: userId,
      name: trimmedName.slice(0, 80),
      description: description ? String(description).slice(0, 240) : null,
    })
    .select()
    .single();

  if (error) {
    console.warn("[collectionsService] create failed:", error.message);
    return { success: false, error: error.message, data: null };
  }
  return { success: true, data };
};

/**
 * Add a product to a collection. No-op if it's already there. Returns
 * `{ added: boolean }` so callers can show the right toast.
 */
export const addProductToCollection = async (user, collectionId, productId) => {
  requireUser(user);
  if (!collectionId || !productId) {
    return { success: false, error: "Missing collection or product." };
  }
  const { error } = await supabase.from(ITEMS_TABLE).insert({
    collection_id: collectionId,
    product_id: productId,
  });
  if (!error) return { success: true, added: true };

  // Postgres unique-violation code = 23505. The collection_items table has a
  // UNIQUE (collection_id, product_id) constraint, so duplicates throw that
  // instead of inserting a second row. Treat that case as success-but-skip.
  if (error.code === "23505") {
    return { success: true, added: false, alreadyInCollection: true };
  }
  console.warn("[collectionsService] add failed:", error.message);
  return { success: false, error: error.message };
};

/**
 * Remove a product from a collection.
 */
export const removeProductFromCollection = async (user, collectionId, productId) => {
  requireUser(user);
  if (!collectionId || !productId) return { success: false };
  const { error } = await supabase
    .from(ITEMS_TABLE)
    .delete()
    .eq("collection_id", collectionId)
    .eq("product_id", productId);
  if (error) {
    console.warn("[collectionsService] remove failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
};

/**
 * Quick check: which of the user's collections already contain this product.
 * Used to render a "✓ Added" badge in the picker modal.
 */
export const collectionsContainingProduct = async (user, productId) => {
  const userId = requireUser(user);
  if (!productId) return new Set();
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select("collection_id, express_collections!inner(user_id)")
    .eq("product_id", productId)
    .eq("express_collections.user_id", userId);

  if (error) {
    console.warn("[collectionsService] containing failed:", error.message);
    return new Set();
  }
  return new Set((data || []).map((row) => row.collection_id));
};

export const collectionsService = {
  listUserCollections,
  createCollection,
  addProductToCollection,
  removeProductFromCollection,
  collectionsContainingProduct,
};