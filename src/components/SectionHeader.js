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
      <Pressable onPress={onActionPress}>
        <Text style={styles.action}>{actionLabel}</Text>
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
    marginTop: 24,
    marginBottom: 12,
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
});
