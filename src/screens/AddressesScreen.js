import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

export const AddressesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("express_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAddresses(data || []);
    } catch (error) {
      console.error("Error fetching addresses:", error);
      toast.error("Failed to load addresses");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddress = () => {
    // Navigate to add address screen (to be implemented)
    toast.info("Address management will be available soon!");
  };

  const handleEditAddress = (address) => {
    // Navigate to edit address screen (to be implemented)
    toast.info("Address editing will be available soon!");
  };

  const handleDeleteAddress = async (address) => {
    try {
      const { error } = await supabase
        .from("express_addresses")
        .delete()
        .eq("id", address.id);

      if (error) throw error;
      fetchAddresses();
      toast.success("Address deleted", "");
    } catch (error) {
      toast.error("Delete failed", error.message || "Could not delete address");
    }
  };

  const renderAddress = ({ item }) => (
    <View style={styles.addressCard}>
      <View style={styles.addressHeader}>
        <View style={styles.addressType}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.addressTypeText}>{item.type || "Home"}</Text>
          {item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          )}
        </View>
        <View style={styles.addressActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleEditAddress(item)}
          >
            <Ionicons name="pencil" size={16} color={colors.primary} />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleDeleteAddress(item)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.accent} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.addressText}>
        {item.street_address}
        {item.apartment && `, ${item.apartment}`}
      </Text>
      <Text style={styles.addressText}>
        {item.city}, {item.region} {item.postal_code}
      </Text>
      <Text style={styles.addressText}>{item.country}</Text>
      {item.phone && (
        <Text style={styles.phoneText}>
          <Ionicons name="call-outline" size={14} color={colors.muted} />
          {" " + item.phone}
        </Text>
      )}
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
        <Text style={styles.headerTitle}>My Addresses</Text>
        <Pressable style={styles.addButton} onPress={handleAddAddress}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={colors.muted} />
          <Text style={styles.emptyTitle}>No addresses yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your delivery addresses to make checkout faster
          </Text>
          <Pressable style={styles.addAddressButton} onPress={handleAddAddress}>
            <Text style={styles.addAddressText}>Add Address</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          renderItem={renderAddress}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  addAddressButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  addAddressText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  listContainer: {
    padding: 16,
  },
  addressCard: {
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
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addressType: {
    flexDirection: "row",
    alignItems: "center",
  },
  addressTypeText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginLeft: 8,
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
  addressActions: {
    flexDirection: "row",
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  addressText: {
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
    marginBottom: 2,
  },
  phoneText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
  },
});
