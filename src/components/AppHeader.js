import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { SearchBar } from "./SearchBar";

export const AppHeader = ({ onSearchPress }) => {
  return (
    <LinearGradient
      colors={[colors.primary, colors.accent]}
      style={styles.gradient}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={styles.caption}>Ship to</Text>
          <View style={styles.locationRow}>
            <Text style={styles.location}>Global Warehouse</Text>
            <Ionicons name="chevron-down" size={16} color="#fff" />
          </View>
        </View>
        <Pressable style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={20} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.searchWrap}>
        <SearchBar
          editable={false}
          onPress={onSearchPress}
          placeholder="Search Alibaba-style deals"
        />
        <Pressable style={styles.iconButton}>
          <Ionicons name="qr-code-outline" size={20} color="#fff" />
        </Pressable>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  caption: {
    color: "#fff",
    opacity: 0.8,
    fontSize: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  location: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  searchWrap: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
});
