// reelLikes.js
// ---------------------------------------------------------------------------
// Client service for reel (Feed) likes and comments. Backed by the
// `express_reel_likes` and `express_reel_comments` tables. A "like" on a reel
// is intentionally separate from wishlisting the underlying product so the
// feed can support lightweight video-native reactions.
// ---------------------------------------------------------------------------

import { supabase } from "../lib/supabase";

const LIKES_TABLE = "express_reel_likes";
const COMMENTS_TABLE = "express_reel_comments";

/**
 * Fetch like state + counts for a batch of reels for the current user.
 * Returns a map keyed by reelId: { [reelId]: { liked, count } }.
 */
export async function fetchReelLikesState(reelIds, userId) {
  const result = {};
  if (!supabase || !Array.isArray(reelIds) || reelIds.length === 0) {
    return result;
  }

  try {
    const [{ data: likeRows }, { data: myLikes }] = await Promise.all([
      supabase.from(LIKES_TABLE).select("reel_id").in("reel_id", reelIds),
      userId
        ? supabase
            .from(LIKES_TABLE)
            .select("reel_id")
            .eq("user_id", userId)
            .in("reel_id", reelIds)
        : Promise.resolve({ data: [] }),
    ]);

    const countsByReel = (likeRows ?? []).reduce((acc, row) => {
      if (!row?.reel_id) return acc;
      acc[row.reel_id] = (acc[row.reel_id] || 0) + 1;
      return acc;
    }, {});

    const mySet = new Set((myLikes ?? []).map((r) => r.reel_id));

    for (const id of reelIds) {
      result[id] = {
        liked: mySet.has(id),
        count: countsByReel[id] || 0,
      };
    }
  } catch (e) {
    console.warn("fetchReelLikesState error:", e);
  }

  return result;
}

/**
 * Toggle like on a reel for the given user. Returns the new liked state.
 */
export async function toggleReelLike(reelId, userId, currentlyLiked) {
  if (!supabase || !reelId || !userId) {
    throw new Error("Missing reel or user");
  }

  if (currentlyLiked) {
    const { error } = await supabase
      .from(LIKES_TABLE)
      .delete()
      .eq("reel_id", reelId)
      .eq("user_id", userId);
    if (error) throw error;
    return { liked: false };
  }

  const { error } = await supabase
    .from(LIKES_TABLE)
    .insert({ reel_id: reelId, user_id: userId });
  if (error) {
    // 23505 = unique_violation: already liked, treat as liked.
    if (String(error.code || "").includes("23505")) {
      return { liked: true };
    }
    throw error;
  }
  return { liked: true };
}

/**
 * Fetch comments for a reel, newest first, with author profile joined.
 * Expects an `express_profiles` view/table exposing id, full_name, avatar.
 */
export async function fetchReelComments(reelId, limit = 50) {
  if (!supabase || !reelId) return [];
  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .select(
      "id, reel_id, user_id, comment, created_at, updated_at, express_profiles!express_reel_comments_user_id_fkey(full_name, avatar)",
    )
    .eq("reel_id", reelId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("fetchReelComments error:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.express_profiles)
      ? row.express_profiles[0]
      : row.express_profiles;
    return {
      id: row.id,
      reel_id: row.reel_id,
      user_id: row.user_id,
      comment: row.comment,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author_name: profile?.full_name || "Customer",
      author_avatar: profile?.avatar || null,
    };
  });
}

/**
 * Add a comment to a reel. Returns the inserted comment row (with author
 * profile resolved client-side for instant render).
 */
export async function addReelComment(reelId, userId, comment, authorName, authorAvatar) {
  if (!supabase || !reelId || !userId) {
    throw new Error("Missing reel or user");
  }
  const trimmed = String(comment || "").trim();
  if (!trimmed) {
    throw new Error("Comment cannot be empty");
  }

  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .insert({ reel_id: reelId, user_id: userId, comment: trimmed })
    .select("id, reel_id, user_id, comment, created_at, updated_at")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    reel_id: data.reel_id,
    user_id: data.user_id,
    comment: data.comment,
    created_at: data.created_at,
    updated_at: data.updated_at,
    author_name: authorName || "You",
    author_avatar: authorAvatar || null,
  };
}

/**
 * Delete a comment owned by the current user.
 */
export async function deleteReelComment(commentId, userId) {
  if (!supabase || !commentId || !userId) {
    throw new Error("Missing comment or user");
  }
  const { error } = await supabase
    .from(COMMENTS_TABLE)
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) throw error;
  return { deleted: true };
}
