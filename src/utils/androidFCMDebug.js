// Android FCM Debug Helper
// Use this in your component to debug FCM token issues

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export const debugAndroidFCM = async () => {
  console.log("🔍 === Android FCM Debug Start ===");

  // Check platform
  console.log("📱 Platform:", Platform.OS);
  console.log("📱 Device Model:", Device.modelName);
  console.log("📱 Is Physical Device:", Device.isDevice);

  if (Platform.OS !== "android") {
    console.log("❌ Not Android platform");
    return;
  }

  if (isRunningInExpoGo()) {
    console.warn(
      "❌ Running in Expo Go - Android push notifications are not supported (removed in SDK 53). Use a development build.",
    );
    return;
  }

  if (!Device.isDevice) {
    console.log("❌ Not a physical device - FCM won't work in simulator");
    return;
  }

  // Check constants
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId;
  console.log("🔧 EAS Project ID:", projectId);
  console.log(
    "🔧 Firebase Project ID from config:",
    Constants?.expoConfig?.extra?.firebaseProjectId,
  );

  // Check permissions
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    console.log("🔐 Existing permission status:", existingStatus);

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log("🔐 New permission status:", status);

      if (status !== "granted") {
        console.log("❌ Permissions not granted");
        return;
      }
    }
  } catch (permError) {
    console.error("❌ Permission check failed:", permError);
    return;
  }

  // Try different token methods
  console.log("🔄 Trying device push token (native FCM)...");
  try {
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    console.log("✅ Device token type:", deviceToken.type);
    console.log(
      "✅ Device token (first 50 chars):",
      deviceToken.data?.substring(0, 50) + "...",
    );

    // Validate FCM token format for Android
    if (deviceToken.type === "fcm") {
      console.log("✅ Valid FCM token obtained");
      return deviceToken.data;
    } else {
      console.log("⚠️ Not an FCM token, got:", deviceToken.type);
    }
  } catch (deviceError) {
    console.error("❌ Device token failed:", deviceError);
  }

  console.log("🔄 Trying Expo push token...");
  try {
    const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log(
      "✅ Expo token (first 50 chars):",
      expoToken.data?.substring(0, 50) + "...",
    );
    return expoToken.data;
  } catch (expoError) {
    console.error("❌ Expo token failed:", expoError);
  }

  console.log("❌ All token methods failed");
  return null;
};

export const testNotificationChannels = async () => {
  if (Platform.OS !== "android") return;

  console.log("🔍 Testing Android notification channels...");

  try {
    // Create a test channel
    await Notifications.setNotificationChannelAsync("test-channel", {
      name: "Test Channel",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      sound: "default",
    });

    // Get all channels
    const channels = await Notifications.getNotificationChannelsAsync();
    console.log(
      "✅ Available channels:",
      channels.map((c) => c.id),
    );

    return true;
  } catch (error) {
    console.error("❌ Channel setup failed:", error);
    return false;
  }
};

export const sendTestNotification = async () => {
  if (Platform.OS !== "android") return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "FCM Test 🔔",
        body: "This is a local test notification",
        data: { test: true },
      },
      trigger: { seconds: 1 },
    });

    console.log("✅ Local test notification scheduled");
  } catch (error) {
    console.error("❌ Test notification failed:", error);
  }
};

// Usage in your component:
// import { debugAndroidFCM, testNotificationChannels, sendTestNotification } from './utils/androidFCMDebug';
//
// const handleDebugFCM = async () => {
//   const token = await debugAndroidFCM();
//   await testNotificationChannels();
//   await sendTestNotification();
// };
