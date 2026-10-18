import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";

export const SectionHeader = ({
  title,
  actionLabel = "See all",
  onActionPress,
}) => {
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildStyles(c));
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onActionPress && (
        <Pressable onPress={onActionPress} style={styles.actionButton}>
          <Text style={styles.action}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color={themeColors.primary} />
        </Pressable>
      )}
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({ 
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
      color: c.dark,
    },
    action: {
      fontSize: 14,
      color: c.primary,
      fontWeight: "600",
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
   });
