import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export const CategoryScroller = ({ categories = [], onSelect }) => {
  return (
    <FlatList
      horizontal
      data={categories}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.card, { backgroundColor: item.color || "#F0F9FF" }]}
          onPress={() => onSelect?.(item)}
        >
          <View style={styles.iconWrap}>
            <Ionicons
              name={item.icon || "apps-outline"}
              size={22}
              color={colors.primary}
            />
          </View>
          <Text numberOfLines={2} style={styles.label}>
            {item.name}
          </Text>
          <View style={styles.arrowWrap}>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </View>
        </Pressable>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 115,
    height: 130,
    borderRadius: 22,
    padding: 14,
    justifyContent: "space-between",
    marginRight: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.dark,
    letterSpacing: -0.2,
  },
  arrowWrap: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
