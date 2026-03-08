import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

// Only import WebView on native to avoid "does not support this platform" error
const WebView =
  Platform.OS !== "web" ? require("react-native-webview").WebView : null;

export const PaymentWebViewScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const webViewRef = useRef(null);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [paymentProcessed, setPaymentProcessed] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const {
    amount,
    email,
    reference,
    orderData,
    authorization_url,
    access_code,
  } = route.params;

  // Check authentication on mount
  React.useEffect(() => {
    if (!isAuthenticated || !user) {
      Alert.alert(
        "Authentication Required",
        "Please log in to continue with payment.",
        [
          {
            text: "OK",
            onPress: () => navigation.replace("Auth"),
          },
        ],
      );
      return;
    }
  }, [isAuthenticated, user, navigation]);

  // Handle back button press (native only)
  React.useEffect(() => {
    if (Platform.OS === "web") return;
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (paymentProcessed) {
          // Payment already processed, allow normal back
          return false;
        }
        Alert.alert(
          "Cancel Payment",
          "Are you sure you want to cancel this payment?",
          [
            { text: "No", style: "cancel" },
            {
              text: "Yes",
              onPress: () => navigation.goBack(),
            },
          ],
        );
        return true; // Prevent default back behavior
      },
    );

    return () => backHandler.remove();
  }, [navigation, paymentProcessed]);

  // Convert amount to pesewas (if present)
  const amountInPesewas = amount ? Math.round(amount * 100) : 0;

  // Prepare display amount safely to avoid calling toLocaleString on undefined
  const displayAmount =
    amount !== undefined && amount !== null ? amount.toLocaleString() : "0";

  // Generate Paystack inline payment HTML (native — uses ReactNativeWebView bridge)
  const paystackHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://js.paystack.co/v1/inline.js"></script>
        <style>
          body {
            margin: 0;
            padding: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f8f9fa;
            color: #333;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .container {
            text-align: center;
            max-width: 400px;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
          }
          .amount {
            font-size: 28px;
            font-weight: bold;
            color: #667eea;
            margin: 20px 0;
          }
          .email {
            color: #666;
            margin-bottom: 30px;
          }
          .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 32px;
            font-size: 18px;
            font-weight: bold;
            border-radius: 25px;
            cursor: pointer;
            width: 100%;
            margin-top: 10px;
          }
          .btn:active { opacity: 0.8; }
          .info { margin-top: 20px; color: #666; font-size: 14px; }
          .loading { display: none; color: #666; margin-top: 10px; }
          .success { display: none; color: #28a745; margin-top: 10px; }
          .error { display: none; color: #dc3545; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">ExpressMart</div>
          <div class="amount">GH₵${displayAmount}</div>
          <div class="email">${email}</div>
          <button class="btn" onclick="payWithPaystack()">Pay Now</button>
          <div class="info">Secure payment powered by Paystack</div>
          <div class="loading" id="loading">Processing payment...</div>
          <div class="success" id="success">Payment successful!</div>
          <div class="error" id="error"></div>
        </div>
        <script>
          function payWithPaystack() {
            document.querySelector('.btn').style.display = 'none';
            document.getElementById('loading').style.display = 'block';
            var handler = PaystackPop.setup({
              key: 'pk_test_7d6bef2c11764ac43547031baf2c197607286987',
              email: '${email}',
              amount: ${amountInPesewas},
              currency: 'GHS',
              ref: '${reference}',
              onClose: function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'payment_cancelled' }));
              },
              callback: function(response) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  event: 'payment_success',
                  reference: response.reference,
                  orderData: ${JSON.stringify(orderData)},
                }));
              }
            });
            handler.openIframe();
          }
        </script>
      </body>
    </html>
  `;

  // Web version — uses access_code from server-initialized transaction so that
  // multi-vendor splits are preserved. Falls back to key/email/amount if no access_code.
  const webPaystackHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://js.paystack.co/v1/inline.js"></script>
        <style>
          body {
            margin: 0;
            padding: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f8f9fa;
            color: #333;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .container {
            text-align: center;
            max-width: 400px;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .logo { font-size: 32px; font-weight: bold; background: linear-gradient(135deg,#667eea,#764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 20px; }
          .amount { font-size: 28px; font-weight: bold; color: #667eea; margin: 20px 0; }
          .email { color: #666; margin-bottom: 30px; }
          .btn { background: linear-gradient(135deg,#667eea,#764ba2); color: white; border: none; padding: 16px 32px; font-size: 18px; font-weight: bold; border-radius: 25px; cursor: pointer; width: 100%; margin-top: 10px; }
          .btn:active { opacity: 0.8; }
          .info { margin-top: 20px; color: #666; font-size: 14px; }
          .loading { display: none; color: #666; margin-top: 10px; }
          .success { display: none; color: #28a745; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">ExpressMart</div>
          <div class="amount">GH₵${displayAmount}</div>
          <div class="email">${email}</div>
          <button class="btn" onclick="payWithPaystack()">Pay Now</button>
          <div class="info">Secure payment powered by Paystack</div>
          <div class="loading" id="loading">Processing payment...</div>
          <div class="success" id="success">Payment successful!</div>
        </div>
        <script>
          function payWithPaystack() {
            document.querySelector('.btn').style.display = 'none';
            document.getElementById('loading').style.display = 'block';
            var opts = {
              key: 'pk_test_7d6bef2c11764ac43547031baf2c197607286987',
              email: '${email}',
              amount: ${amountInPesewas},
              currency: 'GHS',
              ref: '${reference}',
              ${access_code ? `access_code: '${access_code}',` : ""}
              onClose: function() {
                window.parent.postMessage(JSON.stringify({ event: 'payment_cancelled' }), '*');
              },
              callback: function(response) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
                window.parent.postMessage(JSON.stringify({
                  event: 'payment_success',
                  reference: response.reference,
                  orderData: ${JSON.stringify(orderData)},
                }), '*');
              }
            };
            var handler = PaystackPop.setup(opts);
            handler.openIframe();
          }
        </script>
      </body>
    </html>
  `;

  // Shared handler — accepts parsed data object
  const processPaymentMessage = (data) => {
    if (!data || paymentProcessed) return;
    if (data.event === "payment_success") {
      setPaymentProcessed(true);
      navigation.replace("Checkout", {
        payment: "success",
        reference: data.reference,
        orderData: data.orderData,
      });
    } else if (data.event === "payment_cancelled") {
      setPaymentProcessed(true);
      navigation.goBack();
    }
  };

  // Web: listen for postMessages from the iframe
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleWebMessage = (event) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        processPaymentMessage(data);
      } catch (e) {
        // ignore non-JSON messages
      }
    };
    window.addEventListener("message", handleWebMessage);
    return () => window.removeEventListener("message", handleWebMessage);
  }, [paymentProcessed]);

  // Web: for authorization_url, detect redirect by polling the iframe location
  const iframeRef = useRef(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !authorization_url || paymentProcessed) return;
    const interval = setInterval(() => {
      try {
        const iframeUrl = iframeRef.current?.contentWindow?.location?.href;
        if (iframeUrl) {
          const match = iframeUrl.match(/[?&]reference=([^&]+)/);
          if (match && match[1]) {
            clearInterval(interval);
            const ref = decodeURIComponent(match[1]);
            setPaymentProcessed(true);
            navigation.replace("Checkout", {
              payment: "success",
              reference: ref,
              orderData,
            });
          }
        }
      } catch (_e) {
        // Cross-origin; can't read iframe URL — ignore
      }
    }, 800);
    return () => clearInterval(interval);
  }, [authorization_url, paymentProcessed]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      processPaymentMessage(data);
    } catch (e) {
      console.warn("Failed to parse WebView message", e);
    }
  };

  // If using server-provided authorization URL, detect redirect with reference query
  const handleNavigationStateChange = (navState) => {
    const url = navState.url || "";
    if (paymentProcessed) return;
    try {
      const match = url.match(/[?&]reference=([^&]+)/);
      if (match && match[1]) {
        const referenceFromUrl = decodeURIComponent(match[1]);
        setPaymentProcessed(true);
        navigation.replace("Checkout", {
          payment: "success",
          reference: referenceFromUrl,
          orderData,
        });
      }
    } catch (e) {
      console.warn("Nav parse error", e);
    }
  };

  const handleLoadEnd = () => {
    setLoading(false);
  };

  const handleError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.error("WebView error: ", nativeEvent);
    Alert.alert(
      "Payment Error",
      "Unable to load payment page. Please check your internet connection and try again.",
      [
        {
          text: "Retry",
          onPress: () => webViewRef.current?.reload(),
        },
        {
          text: "Cancel",
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  // ── WEB RENDER ──────────────────────────────────────────────────────────────
  // Always use the inline Paystack popup HTML on web. When access_code is
  // available the popup resumes the server-initialized transaction (preserving
  // multi-vendor splits). This avoids the cross-origin iframe redirect that
  // previously hit the edge function without an Authorization header (401).
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        {/* eslint-disable-next-line react-native/no-raw-text */}
        <iframe
          ref={iframeRef}
          srcDoc={webPaystackHTML}
          style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
          onLoad={() => setLoading(false)}
          title="Payment"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
        />
      </View>
    );
  }

  // ── NATIVE RENDER ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={
          authorization_url
            ? { uri: authorization_url }
            : { html: paystackHTML }
        }
        style={styles.webview}
        onMessage={handleMessage}
        onNavigationStateChange={
          authorization_url ? handleNavigationStateChange : undefined
        }
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="compatibility"
        userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    zIndex: 1,
  },
});
