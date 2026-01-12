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
          style={[styles.card, { backgroundColor: item.color || colors.light }]}
          onPress={() => onSelect?.(item)}
        >
          <View style={styles.iconWrap}>
            <Ionicons
              name={item.icon || "apps-outline"}
              size={18}
              color={colors.dark}
            />
          </View>
          <Text numberOfLines={2} style={styles.label}>
            {item.name}
          </Text>
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
    width: 110,
    height: 120,
    borderRadius: 16,
    padding: 12,
    justifyContent: "space-between",
    marginRight: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  label: {
    fontWeight: "600",
    color: colors.dark,
  },
});
