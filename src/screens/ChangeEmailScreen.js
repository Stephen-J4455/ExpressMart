import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";

export const ChangeEmailScreen = ({ navigation }) => {
  const { user, updateEmail } = useAuth();
  const toast = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildChangeEmailStyles(c));

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      toast.error("Please enter a new email address");
      return;
    }

    if (!validateEmail(newEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!password) {
      toast.error("Please enter your password for verification");
      return;
    }

    if (newEmail.toLowerCase() === user?.email?.toLowerCase()) {
      toast.error("New email must be different from current email");
      return;
    }

    setLoading(true);
    try {
      const success = await updateEmail(newEmail, password);
      if (success) {
        toast.success(
          "Email change initiated. Please check both your old and new email addresses for verification links.",
        );
        // Clear form
        setNewEmail("");
        setPassword("");
        navigation.goBack();
      } else {
        toast.error(
          "Failed to initiate email change. Please check your password and try again.",
        );
      }
    } catch (error) {
      toast.error("Failed to change email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Change Email</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Your Email Address</Text>
          <Text style={styles.sectionSubtitle}>
            You will need to verify both your current and new email addresses.
          </Text>

          <View style={styles.currentEmailContainer}>
            <Text style={styles.currentEmailLabel}>Current Email</Text>
            <Text style={styles.currentEmail}>{user?.email}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New Email Address</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="Enter new email address"
              placeholderTextColor={themeColors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Current Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your current password"
                placeholderTextColor={themeColors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color={themeColors.muted}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[
              styles.changeButton,
              loading && styles.changeButtonDisabled,
            ]}
            onPress={handleChangeEmail}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="mail" size={18} color="#fff" />
                <Text style={styles.changeButtonText}>Change Email</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.infoSection}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={themeColors.primary}
          />
          <Text style={styles.infoText}>
            After submitting, you'll receive verification emails at both
            addresses. You must verify the new email to complete the change.
          </Text>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const buildChangeEmailStyles = (c) =>
  StyleSheet.create({ 
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: c.light,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.dark,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: "#fff",
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.dark,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: c.muted,
    lineHeight: 20,
    marginBottom: 24,
  },
  currentEmailContainer: {
    backgroundColor: c.light,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  currentEmailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: c.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  currentEmail: {
    fontSize: 16,
    color: c.dark,
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: c.dark,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.light,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: c.dark,
    backgroundColor: "#fff",
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : { }),
  },
  passwordInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.light,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: c.dark,
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  eyeButton: {
    padding: 12,
  },
  changeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  changeButtonDisabled: {
    backgroundColor: c.muted,
  },
  changeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  infoSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    marginTop: 16,
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.light,
  },
  infoText: {
    fontSize: 14,
    color: c.muted,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  spacer: {
    height: 32,
  },
});
