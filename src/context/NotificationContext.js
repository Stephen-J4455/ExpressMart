import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform, AppState } from "react-native";
import { supabase } from "../lib/supabase";

// expo-notifications was removed from Expo Go (SDK 53+).
// Dynamic require with a no-op stub prevents a crash at module load time.
let Notifications;
try {
  Notifications = require("expo-notifications");
} catch (_) {
  Notifications = {
    setNotificationHandler: () => {},
    getPermissionsAsync: async () => ({ status: "denied" }),
    requestPermissionsAsync: async () => ({ status: "denied" }),
    getExpoPushTokenAsync: async () => ({ data: null }),
    getDevicePushTokenAsync: async () => ({ data: null, type: null }),
    setNotificationChannelAsync: async () => {},
    addNotificationReceivedListener: () => ({ remove: () => {} }),
    addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
    AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
  };
}

const NotificationContext = createContext();

// FCM Configuration - loaded from app.json extra or environment variables
const FCM_CONFIG = {
  apiKey:
    Constants.expoConfig?.extra?.firebaseApiKey ||
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    Constants.expoConfig?.extra?.firebaseAuthDomain ||
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:
    Constants.expoConfig?.extra?.firebaseProjectId ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    Constants.expoConfig?.extra?.firebaseStorageBucket ||
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    Constants.expoConfig?.extra?.firebaseMessagingSenderId ||
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:
    Constants.expoConfig?.extra?.firebaseAppId ||
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  vapidKey:
    Constants.expoConfig?.extra?.firebaseVapidKey ||
    process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
};

// App type identifier for this app
const APP_TYPE = "customer";

// expo-notifications was removed from Expo Go entirely (SDK 53+)
// Only set the handler when running in a real/dev build
if (!isRunningInExpoGo()) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (_) {
    // Silently ignore
  }
}

export const NotificationProvider = ({ children, userId }) => {
  const [fcmToken, setFcmToken] = useState("");
  const [expoPushToken, setExpoPushToken] = useState("");
  const [notification, setNotification] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(null);
  const notificationListener = useRef();
  const responseListener = useRef();
  const appState = useRef(AppState.currentState);

  // Register device token with Supabase
  const registerDeviceToken = useCallback(async (uid, token, platform) => {
    if (!token || !uid) return;

    try {
      const { error } = await supabase.from("express_device_tokens").upsert(
        {
          user_id: uid,
          fcm_token: token,
          device_platform: platform,
          app_type: APP_TYPE,
          device_name: Device.modelName || "Unknown Device",
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,fcm_token",
          ignoreDuplicates: false,
        },
      );

      if (error) {
        console.error("Error registering device token:", error);
      } else {
        console.log("FCM device token registered successfully");
      }
    } catch (err) {
      console.error("Failed to register device token:", err);
    }
  }, []);

  // Unregister device token (call on logout)
  const unregisterDeviceToken = useCallback(async (token) => {
    if (!token) return;

    try {
      const { error } = await supabase
        .from("express_device_tokens")
        .update({ is_active: false })
        .eq("fcm_token", token);

      if (error) {
        console.error("Error unregistering device token:", error);
      }
    } catch (err) {
      console.error("Failed to unregister device token:", err);
    }
  }, []);

  // Register for FCM on native platforms (Android/iOS)
  const registerForFCMAsync = useCallback(async () => {
    // expo-notifications was removed from Expo Go entirely (SDK 53+)
    if (isRunningInExpoGo()) {
      console.warn(
        "⚠️ Push notifications are not supported in Expo Go (removed in SDK 53). " +
          "Use a development build for push notification support.",
      );
      return { token: null, platform: Platform.OS };
    }

    let token = null;
    let platform = Platform.OS;

    try {
      if (Platform.OS === "web") {
        token = await registerForWebFCMAsync();
        platform = "web";
      } else if (Device.isDevice) {
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
          finalStatus = status;
        }

        setNotificationPermission(finalStatus);

        if (finalStatus !== "granted") {
          console.log("Push notification permission denied");
          return null;
        }

        try {
          const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ||
            Constants?.easConfig?.projectId;

          // For Android in standalone builds, try to get FCM token directly
          if (Platform.OS === "android") {
            try {
              // Try getting device push token (native FCM token)
              const deviceToken = await Notifications.getDevicePushTokenAsync();
              if (deviceToken && deviceToken.data) {
                token = deviceToken.data;
                const tokenType = deviceToken.type || "unknown";

                // Validate it's actually an FCM token
                if (token.startsWith("ExponentPushToken[")) {
                  console.warn(
                    "⚠️ WARNING: Got Expo token instead of FCM token",
                  );
                  console.warn(
                    "⚠️ This means you are likely running in Expo Go or FCM is not configured",
                  );
                  console.warn(
                    "⚠️ Push notifications will NOT work with this Edge Function",
                  );
                } else {
                  console.log("✅ Native Android FCM token obtained");
                  console.log("   Token type:", tokenType);
                  console.log(
                    "   Token preview:",
                    token.substring(0, 30) + "...",
                  );
                }
              }
            } catch (deviceTokenError) {
              console.error(
                "❌ Device token failed:",
                deviceTokenError.message,
              );
              console.warn(
                "⚠️ Falling back to Expo token - notifications may not work",
              );
              // Fallback to Expo push token
              try {
                const expoToken = await Notifications.getExpoPushTokenAsync({
                  projectId,
                });
                token = expoToken.data;
                setExpoPushToken(token);
                console.log(
                  "⚠️ Expo push token obtained (not compatible with FCM Edge Function)",
                );
                console.log(
                  "   Token preview:",
                  token.substring(0, 30) + "...",
                );
              } catch (expoError) {
                console.error(
                  "❌ Both token methods failed:",
                  expoError.message,
                );
              }
            }
          } else {
            // For iOS, use device token (APNs) or Expo token
            try {
              const deviceToken = await Notifications.getDevicePushTokenAsync();
              token = deviceToken.data;
              console.log("✅ Native iOS APNs token obtained");
            } catch (deviceTokenError) {
              console.log(
                "Falling back to Expo push token:",
                deviceTokenError.message,
              );
              const expoToken = await Notifications.getExpoPushTokenAsync({
                projectId,
              });
              token = expoToken.data;
              setExpoPushToken(token);
            }
          }
        } catch (error) {
          console.error("❌ Error getting push token:", error);
        }

        // Set up Android notification channels
        if (Platform.OS === "android") {
          console.log("🔧 Setting up Android notification channels...");

          try {
            await Notifications.setNotificationChannelAsync("default", {
              name: "Default",
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: [0, 250, 250, 250],
              lightColor: "#FF231F7C",
              sound: "default",
              enableLights: true,
              enableVibrate: true,
            });

            await Notifications.setNotificationChannelAsync("orders", {
              name: "Order Updates",
              importance: Notifications.AndroidImportance.HIGH,
              vibrationPattern: [0, 250, 250, 250],
              sound: "default",
              enableLights: true,
              enableVibrate: true,
            });

            await Notifications.setNotificationChannelAsync("chat", {
              name: "Chat Messages",
              importance: Notifications.AndroidImportance.HIGH,
              vibrationPattern: [0, 100, 100, 100],
              sound: "default",
              enableLights: true,
              enableVibrate: true,
            });

            await Notifications.setNotificationChannelAsync("promotions", {
              name: "Promotions",
              importance: Notifications.AndroidImportance.DEFAULT,
              sound: "default",
              enableLights: true,
              enableVibrate: true,
            });

            console.log("✅ Android notification channels set up successfully");
          } catch (channelError) {
            console.error(
              "❌ Failed to set up notification channels:",
              channelError,
            );
          }
        }
      } else {
        console.log("Must use physical device for Push Notifications");
      }
    } catch (err) {
      // Catch any unexpected notification errors (e.g. Expo Go restrictions)
      if (
        err?.message?.includes("Expo Go") ||
        err?.message?.includes("removed from Expo Go")
      ) {
        console.warn(
          "⚠️ Push notifications not supported in this environment:",
          err.message,
        );
      } else {
        console.error("❌ Unexpected error in registerForFCMAsync:", err);
      }
    }

    return { token, platform };
  }, []);

  // Register for Web FCM - REMOVED
  const registerForWebFCMAsync = useCallback(async () => {
    return null;
  }, []);

  // Send notification via Supabase Edge Function
  const sendNotification = useCallback(async (payload) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-push-notification",
        {
          body: payload,
        },
      );

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Error sending notification:", err);
      throw err;
    }
  }, []);

  // Initialize notifications on mount
  useEffect(() => {
    let isMounted = true;

    const initializeNotifications = async () => {
      const result = await registerForFCMAsync();

      if (result?.token && isMounted) {
        setFcmToken(result.token);

        if (userId) {
          await registerDeviceToken(userId, result.token, result.platform);
        }
      }
    };

    initializeNotifications().catch((err) =>
      console.warn("⚠️ Notification init error:", err?.message),
    );

    // Skip listeners in Expo Go — push is unsupported there
    if (!isRunningInExpoGo()) {
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          setNotification(notification);
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log("Notification tapped:", response);
          // Handle navigation based on notification data
        });
    }

    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          const result = await registerForFCMAsync();
          if (result?.token && userId) {
            await registerDeviceToken(userId, result.token, result.platform);
          }
        }
        appState.current = nextAppState;
      },
    );

    return () => {
      isMounted = false;
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription?.remove();
    };
  }, [userId, registerForFCMAsync, registerDeviceToken]);

  // Update token when userId changes
  useEffect(() => {
    if (fcmToken && userId) {
      registerDeviceToken(userId, fcmToken, Platform.OS);
    }
  }, [userId, fcmToken, registerDeviceToken]);

  // Unregister token when user logs out
  useEffect(() => {
    if (!userId && fcmToken) {
      console.log("🔐 User logged out, unregistering FCM token");
      unregisterDeviceToken(fcmToken);
      setFcmToken("");
      setExpoPushToken("");
    }
  }, [userId, fcmToken, unregisterDeviceToken]);

  const value = {
    fcmToken,
    expoPushToken,
    notification,
    notificationPermission,
    sendNotification,
    registerDeviceToken,
    unregisterDeviceToken,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
};

export default NotificationContext;
