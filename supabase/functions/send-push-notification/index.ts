// Supabase Edge Function: send-push-notification
// Handles FCM push notifications for Android, iOS, and Web

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  // Target options (one of these is required)
  userId?: string;
  userIds?: string[];
  token?: string;
  tokens?: string[];
  topic?: string;
  appType?: "customer" | "seller" | "admin" | "all";

  // Notification content
  title: string;
  body: string;
  imageUrl?: string;

  // Data payload
  data?: Record<string, string>;

  // Notification type for categorization
  notificationType?:
    | "order"
    | "chat"
    | "promotion"
    | "system"
    | "status"
    | "general";

  // Platform-specific options
  android?: {
    channelId?: string;
    priority?: "high" | "normal";
    sound?: string;
    clickAction?: string;
  };
  ios?: {
    sound?: string;
    badge?: number;
    category?: string;
  };
  web?: {
    icon?: string;
    clickAction?: string;
    requireInteraction?: boolean;
  };
}

interface FCMMessage {
  token?: string;
  topic?: string;
  notification: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
  android?: {
    priority: string;
    notification: {
      channel_id: string;
      sound: string;
      click_action?: string;
    };
  };
  apns?: {
    payload: {
      aps: {
        alert: {
          title: string;
          body: string;
        };
        sound: string;
        badge?: number;
        category?: string;
      };
    };
  };
  webpush?: {
    notification: {
      icon?: string;
      requireInteraction?: boolean;
    };
    fcm_options?: {
      link?: string;
    };
  };
}

// Get FCM access token using service account
async function getFCMAccessToken(): Promise<string> {
  const serviceAccountKey = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
  if (!serviceAccountKey) {
    throw new Error("FCM_SERVICE_ACCOUNT_KEY not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountKey);
  const now = Math.floor(Date.now() / 1000);

  // Create JWT header and payload
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // Encode header and payload
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const signatureInput = `${headerB64}.${payloadB64}`;

  // Import private key and sign
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signatureInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

// Send FCM notification
async function sendFCMNotification(
  message: FCMMessage,
  projectId: string,
  accessToken: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    const result = await response.json();

    if (response.ok) {
      return { success: true, messageId: result.name };
    } else {
      return {
        success: false,
        error: result.error?.message || JSON.stringify(result),
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Build FCM message from payload
function buildFCMMessage(
  token: string,
  payload: NotificationPayload,
): FCMMessage {
  const message: FCMMessage = {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      ...payload.data,
      notificationType: payload.notificationType || "general",
      timestamp: new Date().toISOString(),
    },
  };

  if (payload.imageUrl) {
    message.notification.image = payload.imageUrl;
  }

  // Android configuration
  message.android = {
    priority: payload.android?.priority || "high",
    notification: {
      channel_id: payload.android?.channelId || "default",
      sound: payload.android?.sound || "default",
    },
  };

  if (payload.android?.clickAction) {
    message.android.notification.click_action = payload.android.clickAction;
  }

  // iOS (APNs) configuration
  message.apns = {
    payload: {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: payload.ios?.sound || "default",
      },
    },
  };

  if (payload.ios?.badge !== undefined) {
    message.apns.payload.aps.badge = payload.ios.badge;
  }

  if (payload.ios?.category) {
    message.apns.payload.aps.category = payload.ios.category;
  }

  // Web push configuration
  message.webpush = {
    notification: {
      icon: payload.web?.icon || "/icon-192x192.png",
      requireInteraction: payload.web?.requireInteraction || false,
    },
  };

  if (payload.web?.clickAction) {
    message.webpush.fcm_options = {
      link: payload.web.clickAction,
    };
  }

  return message;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fcmProjectId = Deno.env.get("FCM_PROJECT_ID");

    if (!fcmProjectId) {
      throw new Error("FCM_PROJECT_ID not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotificationPayload = await req.json();

    // Validate required fields
    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get FCM access token
    const accessToken = await getFCMAccessToken();

    // Collect tokens to send to
    let tokens: string[] = [];
    let userIdToTokenMap: Map<string, string[]> = new Map();

    if (payload.token) {
      tokens = [payload.token];
    } else if (payload.tokens) {
      tokens = payload.tokens;
    } else if (payload.userId || payload.userIds) {
      // Fetch tokens from database
      const userIds = payload.userId ? [payload.userId] : payload.userIds!;

      let query = supabase
        .from("express_device_tokens")
        .select("user_id, fcm_token")
        .in("user_id", userIds)
        .eq("is_active", true);

      if (payload.appType && payload.appType !== "all") {
        query = query.eq("app_type", payload.appType);
      }

      const { data: deviceTokens, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch tokens: ${error.message}`);
      }

      if (deviceTokens && deviceTokens.length > 0) {
        tokens = deviceTokens.map((d) => d.fcm_token);
        deviceTokens.forEach((d) => {
          const existing = userIdToTokenMap.get(d.user_id) || [];
          existing.push(d.fcm_token);
          userIdToTokenMap.set(d.user_id, existing);
        });
      }
    } else if (payload.topic) {
      // Send to topic - handled separately
      const message: FCMMessage = {
        topic: payload.topic,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          ...payload.data,
          notificationType: payload.notificationType || "general",
          timestamp: new Date().toISOString(),
        },
      };

      if (payload.imageUrl) {
        message.notification.image = payload.imageUrl;
      }

      const result = await sendFCMNotification(
        message,
        fcmProjectId,
        accessToken,
      );

      // Log the notification
      await supabase.from("express_notification_logs").insert({
        title: payload.title,
        body: payload.body,
        data: payload.data,
        notification_type: payload.notificationType,
        status: result.success ? "sent" : "failed",
        error_message: result.error,
        fcm_response: result,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No valid tokens found",
          sent: 0,
          failed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Send to each token
    const results = await Promise.all(
      tokens.map(async (token) => {
        const message = buildFCMMessage(token, payload);
        const result = await sendFCMNotification(
          message,
          fcmProjectId,
          accessToken,
        );

        // Find user ID for this token
        let recipientUserId: string | undefined;
        for (const [userId, userTokens] of userIdToTokenMap.entries()) {
          if (userTokens.includes(token)) {
            recipientUserId = userId;
            break;
          }
        }

        // Log the notification
        await supabase.from("express_notification_logs").insert({
          recipient_user_id: recipientUserId,
          recipient_token: token,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          notification_type: payload.notificationType,
          status: result.success ? "sent" : "failed",
          error_message: result.error,
          fcm_response: result,
        });

        // If token is invalid, deactivate it
        if (
          result.error &&
          (result.error.includes("not registered") ||
            result.error.includes("invalid registration"))
        ) {
          await supabase
            .from("express_device_tokens")
            .update({ is_active: false })
            .eq("fcm_token", token);
        }

        return { token, ...result };
      }),
    );

    const summary = {
      success: true,
      total: results.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending push notification:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
