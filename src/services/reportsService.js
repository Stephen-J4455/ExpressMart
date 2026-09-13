// reportsService
// ---------------------------------------------------------------------------
// User-submitted listing reports. Backed by `express_listing_reports`. Only
// the signed-in user can insert; the row goes into the table with status =
// 'pending' for a future admin/marketing flow to triage.
// ---------------------------------------------------------------------------

import { supabase } from "../lib/supabase";

const REPORTS_TABLE = "express_listing_reports";

const VALID_REASONS = [
  "counterfeit",
  "inappropriate",
  "spam",
  "wrong_category",
  "wrong_price",
  "duplicate",
  "other",
];

export const REPORT_REASONS = [
  { value: "counterfeit", label: "Counterfeit or fake item" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "spam", label: "Spam or misleading" },
  { value: "wrong_category", label: "Listed in the wrong category" },
  { value: "wrong_price", label: "Price looks incorrect" },
  { value: "duplicate", label: "Duplicate listing" },
  { value: "other", label: "Something else" },
];

export const isValidReportReason = (reason) =>
  VALID_REASONS.includes(String(reason || "").trim().toLowerCase());

/**
 * Submit a report against a product listing. `user` must be signed in.
 *
 * @param {object} args
 * @param {object} args.user        The authenticated user (useAuth().user)
 * @param {string} args.productId   UUID of the offending product
 * @param {string} args.sellerId    Optional UUID of the product's seller
 * @param {string} args.reason      One of REPORT_REASONS values
 * @param {string} [args.details]   Optional free-form text (≤ 500 chars)
 */
export const submitListingReport = async ({
  user,
  productId,
  sellerId = null,
  reason,
  details = null,
}) => {
  if (!user || !user.id) {
    return {
      success: false,
      error: "Please sign in to report a listing.",
    };
  }
  if (!productId) {
    return { success: false, error: "Missing product." };
  }
  const normalizedReason = String(reason || "").trim().toLowerCase();
  if (!isValidReportReason(normalizedReason)) {
    return { success: false, error: "Please pick a report reason." };
  }
  const trimmedDetails =
    details && String(details).trim()
      ? String(details).trim().slice(0, 500)
      : null;

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .insert({
      user_id: user.id,
      product_id: productId,
      seller_id: sellerId,
      reason: normalizedReason,
      details: trimmedDetails,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.warn("[reportsService] submit failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true, data };
};

/**
 * List all reports submitted by the current user (newest first). Useful for a
 * future "My reports" screen; not wired into the menu today.
 */
export const listMyReports = async (user, limit = 50) => {
  if (!user || !user.id) return [];
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select("id, product_id, reason, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[reportsService] list failed:", error.message);
    return [];
  }
  return data || [];
};

export const reportsService = {
  submitListingReport,
  listMyReports,
  isValidReportReason,
  REPORT_REASONS,
};