// ReportListingModal
// ---------------------------------------------------------------------------
// Bottom-sheet reason picker for the FeedProductCard overflow menu's "Report
// listing" action. Captures one of a fixed set of canned reasons plus an
// optional free-form details string and persists the report to the
// `express_listing_reports` table.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";
import { submitListingReport, REPORT_REASONS } from "../services/reportsService";

export const ReportListingModal = ({ visible, product, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildStyles);

  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form every time the sheet opens so the previous submission's
  // reason/details don't bleed into a new attempt.
  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setDetails("");
    setSubmitting(false);
  }, [visible]);

  const sellerId =
    (product?.seller && (product.seller.id || product.seller)) ||
    product?.seller_id?.id ||
    product?.seller_id ||
    null;

  const onSubmit = async () => {
    if (!isAuthenticated || !user) {
      toast.info("Sign in required", "Please sign in to report a listing.");
      return;
    }
    if (!reason) {
      toast.error("Pick a reason", "Select a reason before submitting.");
      return;
    }
    setSubmitting(true);
    const result = await submitListingReport({
      user,
      productId: product?.id,
      sellerId,
      reason,
      details,
    });
    setSubmitting(false);
    if (result.success) {
      toast.success(
        "Report submitted",
        "Thanks — our team will review this listing.",
      );
      onClose();
    } else {
      toast.error("Could not submit", result.error || "Please try again.");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
     
      <Pressable style={styles.backdrop} onPress={onClose}>
       
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.iconBadge}>
                <Ionicons name="flag-outline" size={18} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  Report listing
                </Text>
                {product?.title ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {product.title}
                  </Text>
                ) : null}
              </View>
              <Pressable
                hitSlop={10}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={c.dark} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              // Disable scroll-to-top on focus so the form stays put when the
              // keyboard appears mid-typing.
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sectionLabel}>
                Why are you reporting this listing?
              </Text>
              {REPORT_REASONS.map((option) => {
                const selected = reason === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.reasonRow, selected && styles.reasonRowActive]}
                    onPress={() => setReason(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                  >
                    <View
                      style={[
                        styles.radio,
                        selected && styles.radioActive,
                      ]}
                    >
                      {selected ? (
                        <View style={styles.radioDot} />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.reasonLabel,
                        selected && styles.reasonLabelActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
                Anything else our moderators should know? (optional)
              </Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Add details to help our review…"
                placeholderTextColor={c.muted}
                style={styles.detailsInput}
                multiline
                maxLength={500}
                textAlignVertical="top"
                // Don't let the modal steal taps on the reason picker when
                // the user is dismissing the keyboard.
                blurOnSubmit
              />
              <Text style={styles.charCount}>
                {details.length}/500
              </Text>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                style={[styles.footerBtn, styles.footerBtnGhost]}
                onPress={onClose}
                accessibilityRole="button"
              >
                <Text style={[styles.footerBtnText, { color: c.muted }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.footerBtn,
                  styles.footerBtnPrimary,
                  !reason && styles.footerBtnDisabled,
                ]}
                onPress={onSubmit}
                disabled={!reason || submitting}
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={c.onPrimary} />
                ) : (
                  <Text
                    style={[styles.footerBtnText, { color: c.onPrimary }]}
                  >
                    Submit report
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    backdrop: {
     
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
  
    keyboardWrap: {
      width: "100%",
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: 10,
      paddingBottom: 0,
      maxHeight: "100%",
    },
    handle: {
      alignSelf: "center",
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary + "15",
    },
    title: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
    },
    subtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    body: {
      paddingHorizontal: 20,
    },
    bodyContent: {
      paddingBottom: 16,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 10,
    },
    reasonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    reasonRowActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + "10",
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioActive: {
      borderColor: c.primary,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.primary,
    },
    reasonLabel: {
      fontSize: 14,
      color: c.dark,
      flex: 1,
    },
    reasonLabelActive: {
      fontWeight: "700",
    },
    detailsInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.dark,
      backgroundColor: c.background,
      minHeight: 80,
    },
    charCount: {
      fontSize: 11,
      color: c.muted,
      textAlign: "right",
      marginTop: 4,
    },
    footer: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    footerBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: radius.md,
    },
    footerBtnGhost: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    footerBtnPrimary: {
      backgroundColor: c.primary,
    },
    footerBtnDisabled: {
      opacity: 0.5,
    },
    footerBtnText: {
      fontSize: 14,
      fontWeight: "700",
    },
  });