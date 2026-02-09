import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import { supabase } from '../lib/supabase';

const NotificationContext = createContext();

// FCM Configuration - loaded from app.json extra or environment variables
const FCM_CONFIG = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: Constants.expoConfig?.extra?.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  vapidKey: Constants.expoConfig?.extra?.firebaseVapidKey || process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
};

// App type identifier for this app
const APP_TYPE = 'customer';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const NotificationProvider = ({ children, userId }) => {
  const [fcmToken, setFcmToken] = useState('');
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(null);
  const notificationListener = useRef();
  const responseListener = useRef();
  const appState = useRef(AppState.currentState);

  // Register device token with Supabase
  const registerDeviceToken = useCallback(async (uid, token, platform) => {
    if (!token || !uid) return;

    try {
      const { error } = await supabase
        .from('express_device_tokens')
        .upsert(
          {
            user_id: uid,
            fcm_token: token,
            device_platform: platform,
            app_type: APP_TYPE,
            device_name: Device.modelName || 'Unknown Device',
            is_active: true,
            last_used_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,fcm_token',
            ignoreDuplicates: false,
          }
        );

      if (error) {
        console.error('Error registering device token:', error);
      } else {
        console.log('FCM device token registered successfully');
      }
    } catch (err) {
      console.error('Failed to register device token:', err);
    }
  }, []);

  // Unregister device token (call on logout)
  const unregisterDeviceToken = useCallback(async (token) => {
    if (!token) return;

    try {
      const { error } = await supabase
        .from('express_device_tokens')
        .update({ is_active: false })
        .eq('fcm_token', token);

      if (error) {
        console.error('Error unregistering device token:', error);
      }
    } catch (err) {
      console.error('Failed to unregister device token:', err);
    }
  }, []);

  // Register for FCM on native platforms (Android/iOS)
  const registerForFCMAsync = useCallback(async () => {
    let token = null;
    let platform = Platform.OS;

    if (Platform.OS === 'web') {
      token = await registerForWebFCMAsync();
      platform = 'web';
    } else if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      setNotificationPermission(finalStatus);

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }

      try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;

        // For Android in standalone builds, try to get FCM token directly
        if (Platform.OS === 'android') {
          try {
            // Try getting device push token (native FCM token)
            const deviceToken = await Notifications.getDevicePushTokenAsync();
            if (deviceToken && deviceToken.data) {
              token = deviceToken.data;
              console.log('✅ Native Android FCM token obtained:', token.substring(0, 20) + '...');
            }
          } catch (deviceTokenError) {
            console.log('⚠️ Device token failed, trying Expo token:', deviceTokenError.message);
            // Fallback to Expo push token
            try {
              const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
              token = expoToken.data;
              setExpoPushToken(token);
              console.log('✅ Expo push token obtained:', token.substring(0, 20) + '...');
            } catch (expoError) {
              console.error('❌ Both token methods failed:', expoError.message);
            }
          }
        } else {
          // For iOS, use device token (APNs) or Expo token
          try {
            const deviceToken = await Notifications.getDevicePushTokenAsync();
            token = deviceToken.data;
            console.log('✅ Native iOS APNs token obtained');
          } catch (deviceTokenError) {
            console.log('Falling back to Expo push token:', deviceTokenError.message);
            const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
            token = expoToken.data;
            setExpoPushToken(token);
          }
        }
      } catch (error) {
        console.error('❌ Error getting push token:', error);
      }

      // Set up Android notification channels
      if (Platform.OS === 'android') {
        console.log('🔧 Setting up Android notification channels...');

        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
            enableLights: true,
            enableVibrate: true,
          });

          await Notifications.setNotificationChannelAsync('orders', {
            name: 'Order Updates',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
            enableLights: true,
            enableVibrate: true,
          });

          await Notifications.setNotificationChannelAsync('chat', {
            name: 'Chat Messages',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 100, 100, 100],
            sound: 'default',
            enableLights: true,
            enableVibrate: true,
          });

          await Notifications.setNotificationChannelAsync('promotions', {
            name: 'Promotions',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
            enableLights: true,
            enableVibrate: true,
          });

          console.log('✅ Android notification channels set up successfully');
        } catch (channelError) {
          console.error('❌ Failed to set up notification channels:', channelError);
        }
      }
    } else {
      console.log('Must use physical device for Push Notifications');
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
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: payload,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error sending notification:', err);
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

    initializeNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      // Handle navigation based on notification data
    });

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const result = await registerForFCMAsync();
        if (result?.token && userId) {
          await registerDeviceToken(userId, result.token, result.platform);
        }
      }
      appState.current = nextAppState;
    });

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
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
