// Notification Service Helper for ExpressMart
// Provides helper functions to send notifications via Supabase Edge Function

import { supabase } from './supabase';

/**
 * Send a push notification to a specific user
 * @param {string} userId - Target user's ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} options - Additional options
 */
export const sendNotificationToUser = async (userId, title, body, options = {}) => {
    try {
        const { data, error } = await supabase.functions.invoke('send-push-notification', {
            body: {
                userId,
                title,
                body,
                data: options.data || {},
                notificationType: options.notificationType || 'general',
                appType: options.appType || 'customer',
                imageUrl: options.imageUrl,
                android: {
                    channelId: options.channelId || 'default',
                    priority: options.priority || 'high',
                    ...options.android,
                },
                ios: options.ios,
                web: options.web,
            },
        });

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('Failed to send notification:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Send a notification to multiple users
 * @param {string[]} userIds - Array of user IDs
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} options - Additional options
 */
export const sendNotificationToUsers = async (userIds, title, body, options = {}) => {
    try {
        const { data, error } = await supabase.functions.invoke('send-push-notification', {
            body: {
                userIds,
                title,
                body,
                data: options.data || {},
                notificationType: options.notificationType || 'general',
                appType: options.appType || 'all',
                imageUrl: options.imageUrl,
                android: {
                    channelId: options.channelId || 'default',
                    priority: options.priority || 'high',
                    ...options.android,
                },
                ios: options.ios,
                web: options.web,
            },
        });

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('Failed to send notifications:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Send notification to a topic (requires topic subscription setup)
 * @param {string} topic - Topic name (e.g., 'promotions', 'news')
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} options - Additional options
 */
export const sendNotificationToTopic = async (topic, title, body, options = {}) => {
    try {
        const { data, error } = await supabase.functions.invoke('send-push-notification', {
            body: {
                topic,
                title,
                body,
                data: options.data || {},
                notificationType: options.notificationType || 'general',
                imageUrl: options.imageUrl,
                android: options.android,
                ios: options.ios,
                web: options.web,
            },
        });

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('Failed to send topic notification:', err);
        return { success: false, error: err.message };
    }
};

// ============ Order Notifications ============

/**
 * Notify customer about order status update
 */
export const notifyOrderStatusUpdate = async (customerId, orderId, status, orderNumber) => {
    const statusMessages = {
        confirmed: { title: 'Order Confirmed! 🎉', body: `Your order #${orderNumber} has been confirmed.` },
        processing: { title: 'Order Processing', body: `Your order #${orderNumber} is being prepared.` },
        shipped: { title: 'Order Shipped! 📦', body: `Your order #${orderNumber} is on its way!` },
        delivered: { title: 'Order Delivered! ✅', body: `Your order #${orderNumber} has been delivered.` },
        cancelled: { title: 'Order Cancelled', body: `Your order #${orderNumber} has been cancelled.` },
    };

    const message = statusMessages[status] || {
        title: 'Order Update',
        body: `Your order #${orderNumber} status: ${status}`
    };

    return sendNotificationToUser(customerId, message.title, message.body, {
        data: { orderId, status, screen: 'OrderDetail' },
        notificationType: 'order',
        appType: 'customer',
        channelId: 'orders',
    });
};

/**
 * Notify seller about new order
 */
export const notifySellerNewOrder = async (sellerId, orderId, orderNumber, amount) => {
    return sendNotificationToUser(sellerId, 'New Order! 🛒', `You have a new order #${orderNumber} for $${amount}`, {
        data: { orderId, screen: 'OrderDetail' },
        notificationType: 'order',
        appType: 'seller',
        channelId: 'orders',
        priority: 'high',
    });
};

// ============ Chat Notifications ============

/**
 * Notify user about new chat message
 */
export const notifyNewMessage = async (userId, senderName, messagePreview, chatId, appType = 'customer') => {
    return sendNotificationToUser(userId, `Message from ${senderName}`, messagePreview.substring(0, 100), {
        data: { chatId, screen: 'Chat' },
        notificationType: 'chat',
        appType,
        channelId: 'chat',
    });
};

// ============ Promotional Notifications ============

/**
 * Send promotional notification to all customers
 */
export const sendPromotion = async (title, body, promoData = {}) => {
    try {
        // Get all active customer tokens
        const { data: tokens, error } = await supabase
            .from('express_device_tokens')
            .select('fcm_token')
            .eq('app_type', 'customer')
            .eq('is_active', true);

        if (error) throw error;

        if (tokens && tokens.length > 0) {
            const { data, error: sendError } = await supabase.functions.invoke('send-push-notification', {
                body: {
                    tokens: tokens.map(t => t.fcm_token),
                    title,
                    body,
                    data: { ...promoData, screen: 'Promotion' },
                    notificationType: 'promotion',
                    android: { channelId: 'promotions' },
                },
            });

            if (sendError) throw sendError;
            return { success: true, data, recipientCount: tokens.length };
        }

        return { success: true, data: null, recipientCount: 0 };
    } catch (err) {
        console.error('Failed to send promotion:', err);
        return { success: false, error: err.message };
    }
};

export default {
    sendNotificationToUser,
    sendNotificationToUsers,
    sendNotificationToTopic,
    notifyOrderStatusUpdate,
    notifySellerNewOrder,
    notifyNewMessage,
    sendPromotion,
};
