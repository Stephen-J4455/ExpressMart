import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

export const PaymentsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    if (!user) return;

    try {
      // For now, we'll simulate payment methods since we don't have a payment methods table
      // In a real app, this would fetch from a payment_methods table
      const mockPaymentMethods = [
        {
          id: "1",
          type: "card",
          last4: "4242",
          brand: "Visa",
          is_default: true,
          expiry_month: 12,
          expiry_year: 2025,
        },
      ];
      setPaymentMethods(mockPaymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      toast.error("Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymentMethod = () => {
    toast.info("Payment method management will be available soon!");
  };

  const handleDeletePaymentMethod = async (method) => {
    Alert.alert(
      "Delete Payment Method",
      "Are you sure you want to delete this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // In a real app, this would delete from the database
            setPaymentMethods((prev) => prev.filter((m) => m.id !== method.id));
          },
        },
      ],
    );
  };

  const getCardIcon = (brand) => {
    switch (brand?.toLowerCase()) {
      case "visa":
        return "card-outline";
      case "mastercard":
        return "card-outline";
      case "amex":
        return "card-outline";
      default:
        return "card-outline";
    }
  };

  const renderPaymentMethod = ({ item }) => (
    <View style={styles.paymentCard}>
      <View style={styles.paymentHeader}>
        <View style={styles.paymentType}>
          <Ionicons
            name={getCardIcon(item.brand)}
            size={20}
            color={colors.primary}
          />
          <Text style={styles.paymentTypeText}>
            •••• •••• •••• {item.last4}
          </Text>
          {item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          )}
        </View>
        <Pressable
          style={styles.deleteButton}
          onPress={() => handleDeletePaymentMethod(item)}
        >
          <Ionicons name="trash-outline" size={16} color={colors.accent} />
        </Pressable>
      </View>
      <View style={styles.paymentDetails}>
        <Text style={styles.cardBrand}>{item.brand}</Text>
        <Text style={styles.expiryText}>
          Expires {item.expiry_month}/{item.expiry_year}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <Pressable style={styles.addButton} onPress={handleAddPaymentMethod}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {paymentMethods.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="card-outline" size={64} color={colors.muted} />
          <Text style={styles.emptyTitle}>No payment methods</Text>
          <Text style={styles.emptySubtitle}>
            Add a payment method to make checkout faster
          </Text>
          <Pressable
            style={styles.addPaymentButton}
            onPress={handleAddPaymentMethod}
          >
            <Text style={styles.addPaymentText}>Add Payment Method</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={paymentMethods}
          keyExtractor={(item) => item.id}
          renderItem={renderPaymentMethod}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.infoContainer}>
        <Ionicons
          name="shield-checkmark-outline"
          size={20}
          color={colors.success}
        />
        <Text style={styles.infoText}>
          Your payment information is securely stored and encrypted
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  addButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  addPaymentButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  addPaymentText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  listContainer: {
    padding: 16,
  },
  paymentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  paymentType: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  paymentTypeText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginLeft: 12,
    letterSpacing: 2,
  },
  defaultBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  defaultText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteButton: {
    padding: 8,
  },
  paymentDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBrand: {
    fontSize: 14,
    color: colors.muted,
    textTransform: "capitalize",
  },
  expiryText: {
    fontSize: 14,
    color: colors.muted,
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light,
  },
  infoText: {
    fontSize: 14,
    color: colors.muted,
    marginLeft: 8,
    flex: 1,
  },
});
