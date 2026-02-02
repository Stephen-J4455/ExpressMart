import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import { WebView } from "react-native-webview";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export const PaymentWebViewScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const webViewRef = useRef(null);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [paymentProcessed, setPaymentProcessed] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const { amount, email, reference, orderData } = route.params;

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

  // Handle back button press
  React.useEffect(() => {
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

  // Convert amount to pesewas
  const amountInPesewas = Math.round(amount * 100);

  // Generate Paystack inline payment HTML
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
          .btn:active {
            opacity: 0.8;
          }
          .info {
            margin-top: 20px;
            color: #666;
            font-size: 14px;
          }
          .loading {
            display: none;
            color: #666;
            margin-top: 10px;
          }
          .success {
            display: none;
            color: #28a745;
            margin-top: 10px;
          }
          .error {
            display: none;
            color: #dc3545;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">ExpressMart</div>
          <div class="amount">GH₵${amount.toLocaleString()}</div>
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
              key: 'pk_test_7d6bef2c11764ac43547031baf2c197607286987', // GHS Paystack key
              email: '${email}',
              amount: ${amountInPesewas},
              currency: 'GHS',
              ref: '${reference}',
              onClose: function() {
                // Payment modal closed
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  event: 'payment_cancelled'
                }));
              },
              callback: function(response) {
                // Payment successful
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

  const handleMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    console.log("🔥 WebView message received:", data);

    if (paymentProcessed) {
      console.log("Payment already processed, ignoring duplicate message");
      return;
    }

    if (data.event === "payment_success") {
      console.log(
        "✅ Payment success event triggered with reference:",
        data.reference,
      );
      console.log("📦 Order data:", data.orderData);
      setPaymentProcessed(true);

      // Navigate to Checkout to trigger verification
      navigation.replace("Checkout", {
        payment: "success",
        reference: data.reference,
        orderData: data.orderData,
      });
    } else if (data.event === "payment_cancelled") {
      console.log("❌ Payment cancelled event triggered");
      setPaymentProcessed(true);
      // Payment cancelled
      navigation.goBack();
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

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html: paystackHTML }}
        style={styles.webview}
        onMessage={handleMessage}
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
    backgroundColor: colors.white,
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
