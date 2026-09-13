import { supabase } from "../lib/supabase";

/**
 * Seller Flash Sale Service
 * Mirrors Express-Store/src/services/flashSaleService.js so the
 * tagit seller admin can create/manage flash sales.
 */

export const sellerFlashSaleService = {
  async createFlashSale({
    productId,
    sellerId,
    flashPrice,
    originalPrice,
    startTime,
    endTime,
    maxQuantity = null,
  }) {
    try {
      const discountPercentage =
        ((originalPrice - flashPrice) / originalPrice) * 100;

      const sanitizedMaxQty =
        maxQuantity != null && !isNaN(maxQuantity)
          ? parseInt(maxQuantity, 10)
          : null;

      const { data, error } = await supabase
        .from("express_flash_sales")
        .insert({
          product_id: productId,
          seller_id: sellerId,
          flash_price: flashPrice,
          original_price: originalPrice,
          discount_percentage: discountPercentage,
          start_time: startTime,
          end_time: endTime,
          max_quantity: sanitizedMaxQty,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error creating flash sale:", error);
      return { success: false, error: error.message };
    }
  },

  async getSellerFlashSales(sellerId) {
    try {
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `,
        )
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Error fetching flash sales:", error);
      return { success: false, error: error.message, data: [] };
    }
  },

  async updateFlashSale(flashSaleId, updates) {
    try {
      if (updates.flashPrice || updates.originalPrice) {
        const { data: current } = await supabase
          .from("express_flash_sales")
          .select("flash_price, original_price")
          .eq("id", flashSaleId)
          .single();

        const flashPrice = updates.flashPrice || current.flash_price;
        const originalPrice = updates.originalPrice || current.original_price;
        updates.discount_percentage =
          ((originalPrice - flashPrice) / originalPrice) * 100;
      }

      const sanitizedMaxQty =
        updates.maxQuantity != null && !isNaN(updates.maxQuantity)
          ? parseInt(updates.maxQuantity, 10)
          : null;

      const { data, error } = await supabase
        .from("express_flash_sales")
        .update({
          flash_price: updates.flashPrice,
          original_price: updates.originalPrice,
          discount_percentage: updates.discount_percentage,
          start_time: updates.startTime,
          end_time: updates.endTime,
          max_quantity: sanitizedMaxQty,
          is_active: updates.isActive,
        })
        .eq("id", flashSaleId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error updating flash sale:", error);
      return { success: false, error: error.message };
    }
  },

  async deleteFlashSale(flashSaleId) {
    try {
      const { error } = await supabase
        .from("express_flash_sales")
        .delete()
        .eq("id", flashSaleId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Error deleting flash sale:", error);
      return { success: false, error: error.message };
    }
  },

  async deactivateFlashSale(flashSaleId) {
    try {
      const { data, error } = await supabase
        .from("express_flash_sales")
        .update({ is_active: false })
        .eq("id", flashSaleId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error deactivating flash sale:", error);
      return { success: false, error: error.message };
    }
  },

  async getActiveFlashSales(sellerId) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `,
        )
        .eq("seller_id", sellerId)
        .eq("is_active", true)
        .lte("start_time", now)
        .gte("end_time", now)
        .order("end_time", { ascending: true });

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Error fetching active flash sales:", error);
      return { success: false, error: error.message, data: [] };
    }
  },

  async getUpcomingFlashSales(sellerId) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `,
        )
        .eq("seller_id", sellerId)
        .eq("is_active", true)
        .gt("start_time", now)
        .order("start_time", { ascending: true });

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Error fetching upcoming flash sales:", error);
      return { success: false, error: error.message, data: [] };
    }
  },

  async getExpiredFlashSales(sellerId) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `,
        )
        .eq("seller_id", sellerId)
        .lt("end_time", now)
        .order("end_time", { ascending: false })
        .limit(20);

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Error fetching expired flash sales:", error);
      return { success: false, error: error.message, data: [] };
    }
  },
};