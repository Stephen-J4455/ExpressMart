import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export const SectionHeader = ({
  title,
  actionLabel = "See all",
  onActionPress,
}) => (
  <View style={styles.row}>
    <Text style={styles.title}>{title}</Text>
    {onActionPress && (
      <Pressable onPress={onActionPress} style={styles.actionButton}>
        <Text style={styles.action}>{actionLabel}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  action: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
