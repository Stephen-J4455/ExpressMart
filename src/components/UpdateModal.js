import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { colors } from "../theme/colors";

const UpdateModal = ({ visible, update, onClose, force }) => {
  if (!update) return null;

  const handleUpdate = () => {
    const url = update.download_url || update.release_notes || null;
    if (url) Linking.openURL(url).catch((e) => console.error("openURL failed", e));
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{force ? "Update Required" : "Update Available"}</Text>
          <Text style={styles.message} numberOfLines={6}>
            {update.update_message || update.release_notes || "A new version is available."}
          </Text>
          <View style={styles.actions}>
            {!force && (
              <TouchableOpacity style={[styles.button, styles.ghost]} onPress={onClose}>
                <Text style={styles.ghostText}>Later</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.button, styles.primary]} onPress={handleUpdate}>
              <Text style={styles.primaryText}>Update</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.dark,
    marginBottom: 10,
  },
  message: {
    color: colors.muted,
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  ghost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostText: {
    color: colors.dark,
    fontWeight: "700",
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
  },
});

export default UpdateModal;
