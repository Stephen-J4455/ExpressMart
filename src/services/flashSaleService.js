import { supabase } from "../lib/supabase";

/**
 * Flash Sale Service for Customer App
 * Fetches active flash sales and product details
 */

export const flashSaleService = {
  /**
   * Get all active flash sales
   */
  async getActiveFlashSales() {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `
        )
        .eq("is_active", true)
        .lte("start_time", now)
        .gte("end_time", now)
        .order("end_time", { ascending: true });

      if (error) throw error;

      // Filter out products that aren't active
      const activeFlashSales = (data || []).filter(
        (fs) => fs.product?.status === "active"
      );

      return { success: true, data: activeFlashSales };
    } catch (error) {
      console.error("Error fetching active flash sales:", error);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Get flash sale for a specific product
   */
  async getProductFlashSale(productId) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true)
        .lte("start_time", now)
        .gte("end_time", now)
        .maybeSingle();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error fetching product flash sale:", error);
      return { success: false, error: error.message, data: null };
    }
  },

  /**
   * Get upcoming flash sales (starting soon)
   */
  async getUpcomingFlashSales(limit = 10) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `
        )
        .eq("is_active", true)
        .gt("start_time", now)
        .order("start_time", { ascending: true })
        .limit(limit);

      if (error) throw error;

      // Filter out products that aren't active
      const activeUpcoming = (data || []).filter(
        (fs) => fs.product?.status === "active"
      );

      return { success: true, data: activeUpcoming };
    } catch (error) {
      console.error("Error fetching upcoming flash sales:", error);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Check if a product has an active flash sale
   */
  async checkProductFlashSale(productId) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select("flash_price, original_price, discount_percentage, end_time")
        .eq("product_id", productId)
        .eq("is_active", true)
        .lte("start_time", now)
        .gte("end_time", now)
        .maybeSingle();

      if (error) throw error;
      return {
        success: true,
        hasFlashSale: !!data,
        flashSaleData: data,
      };
    } catch (error) {
      console.error("Error checking product flash sale:", error);
      return {
        success: false,
        hasFlashSale: false,
        flashSaleData: null,
      };
    }
  },

  /**
   * Get flash sales by category
   */
  async getFlashSalesByCategory(category) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("express_flash_sales")
        .select(
          `
          *,
          product:express_products(*)
        `
        )
        .eq("is_active", true)
        .lte("start_time", now)
        .gte("end_time", now);

      if (error) throw error;

      // Filter by category and active products
      const categoryFlashSales = (data || []).filter(
        (fs) =>
          fs.product?.status === "active" && fs.product?.category === category
      );

      return { success: true, data: categoryFlashSales };
    } catch (error) {
      console.error("Error fetching flash sales by category:", error);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Subscribe to flash sale changes for a specific product
   */
  subscribeToProductFlashSale(productId, callback) {
    const subscription = supabase
      .channel(`flash-sale-${productId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_flash_sales",
          filter: `product_id=eq.${productId}`,
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  },

  /**
   * Get time remaining for a flash sale
   */
  getTimeRemaining(endTime) {
    const now = new Date().getTime();
    const end = new Date(endTime).getTime();
    const distance = end - now;

    if (distance < 0) {
      return {
        expired: true,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      };
    }

    return {
      expired: false,
      days: Math.floor(distance / (1000 * 60 * 60 * 24)),
      hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((distance % (1000 * 60)) / 1000),
    };
  },

  /**
   * Format time remaining as string
   */
  formatTimeRemaining(endTime) {
    const time = this.getTimeRemaining(endTime);

    if (time.expired) {
      return "Expired";
    }

    if (time.days > 0) {
      return `${time.days}d ${time.hours}h`;
    } else if (time.hours > 0) {
      return `${time.hours}h ${time.minutes}m`;
    } else if (time.minutes > 0) {
      return `${time.minutes}m ${time.seconds}s`;
    } else {
      return `${time.seconds}s`;
    }
  },
};
