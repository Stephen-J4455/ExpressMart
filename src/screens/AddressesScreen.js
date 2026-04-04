import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

export const AddressesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const BLANK_FORM = {
    full_name: "",
    phone: "",
    street_address: "",
    city: "",
    state: "",
  };
  const [formData, setFormData] = useState(BLANK_FORM);
  const { cardColumns, horizontalPadding, getItemWidth } = useResponsive();
  const cardItemWidth = getItemWidth(cardColumns);

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
    setEditingAddress(null);
    setFormData(BLANK_FORM);
    setShowModal(true);
  };

  const handleEditAddress = (address) => {
    setEditingAddress(address);
    setFormData({
      full_name: address.full_name || "",
      phone: address.phone || "",
      street_address: address.street_address || "",
      city: address.city || "",
      state: address.state || "",
    });
    setShowModal(true);
  };

  const handleSaveAddress = async () => {
    if (
      !formData.full_name.trim() ||
      !formData.phone.trim() ||
      !formData.street_address.trim() ||
      !formData.city.trim()
    ) {
      toast.error("Missing fields", "All fields are required.");
      return;
    }
    setSavingAddress(true);
    try {
      if (editingAddress) {
        const { error } = await supabase
          .from("express_addresses")
          .update({ ...formData })
          .eq("id", editingAddress.id);
        if (error) throw error;
        toast.success("Address updated", "");
      } else {
        const { error } = await supabase
          .from("express_addresses")
          .insert([{ ...formData, user_id: user.id }]);
        if (error) throw error;
        toast.success("Address added", "");
      }
      setShowModal(false);
      fetchAddresses();
    } catch (err) {
      toast.error("Save failed", err.message || "Could not save address");
    } finally {
      setSavingAddress(false);
    }
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
    <View
      style={[styles.addressCard, cardColumns > 1 && { width: cardItemWidth }]}
    >
      <View style={styles.addressHeader}>
        <View style={styles.addressType}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
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
      <Text style={styles.addressText}>{item.full_name}</Text>
      <Text style={styles.addressText}>{item.street_address}</Text>
      <Text style={styles.addressText}>
        {item.city}, {item.state}
      </Text>
      <Text style={styles.phoneText}>
        <Ionicons name="call-outline" size={14} color={colors.muted} />
        {" " + item.phone}
      </Text>
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
      {/* Address Form Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Pressable
                onPress={() => setShowModal(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={24} color={colors.dark} />
              </Pressable>
              <Text style={styles.modalTitle}>
                {editingAddress ? "Edit Address" : "New Address"}
              </Text>
              <Pressable
                style={[styles.modalSaveBtn, savingAddress && { opacity: 0.5 }]}
                onPress={handleSaveAddress}
                disabled={savingAddress}
              >
                {savingAddress ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              {[
                {
                  key: "full_name",
                  label: "Full Name *",
                  placeholder: "Enter your full name",
                },
                {
                  key: "phone",
                  label: "Phone Number *",
                  placeholder: "+233 XX XXX XXXX",
                  keyboardType: "phone-pad",
                },
                {
                  key: "street_address",
                  label: "Street Address *",
                  placeholder: "e.g. 12 Ring Road",
                },
                { key: "city", label: "City *", placeholder: "e.g. Accra" },
                {
                  key: "state",
                  label: "State",
                  placeholder: "e.g. Greater Accra",
                },
              ].map((field) => (
                <View key={field.key} style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={formData[field.key]}
                    onChangeText={(v) =>
                      setFormData((p) => ({ ...p, [field.key]: v }))
                    }
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.muted}
                    keyboardType={field.keyboardType || "default"}
                  />
                </View>
              ))}

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <View
        style={[
          styles.header,
          { paddingHorizontal: cardColumns > 1 ? horizontalPadding : 16 },
        ]}
      >
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
          numColumns={cardColumns}
          key={`addresses-${cardColumns}`}
          columnWrapperStyle={cardColumns > 1 ? { gap: 16 } : undefined}
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
    backgroundColor: colors.background,
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
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#EEF2F8",
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
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  modalClose: { padding: 4 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.dark },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  modalSaveText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  modalScroll: { flex: 1, padding: 20 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.dark,
    backgroundColor: "#FAFBFC",
  },
});
