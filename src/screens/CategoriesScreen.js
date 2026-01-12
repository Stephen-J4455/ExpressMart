import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";

export const CategoriesScreen = ({ navigation }) => {
  const { categories } = useShop();

  return (
    <FlatList
      data={categories}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate("Feed", { category: item.name })}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: item.color || "#EFEFEF" },
            ]}
          >
            <Ionicons
              name={item.icon || "apps-outline"}
              size={22}
              color={colors.dark}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.subtitle}>Explore best sellers</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      )}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 60,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  title: {
    fontWeight: "700",
    fontSize: 16,
    color: colors.dark,
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
  },
});
