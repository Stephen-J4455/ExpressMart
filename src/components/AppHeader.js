import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { SearchBar } from "./SearchBar";
import { useResponsive } from "../hooks/useResponsive";

export const AppHeader = ({
  onSearchPress,
  onChatPress,
  onStoresPress,
  onNotificationsPress,
}) => {
  const { isWide, horizontalPadding } = useResponsive();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: isWide ? horizontalPadding : 16,
          paddingTop: insets.top + 8,
        },
        isWide && styles.containerWide,
      ]}
    >
      <View style={styles.topRow}>
        <View>
          <Text style={styles.caption}>Ship to</Text>
          <View style={styles.locationRow}>
            <Text style={styles.location}>Global Warehouse</Text>
            <Ionicons name="chevron-down" size={16} color={colors.primary} />
          </View>
        </View>
        <View style={styles.iconRow}>
          <Pressable style={styles.iconButton} onPress={onStoresPress}>
            <Ionicons name="storefront-outline" size={20} color={colors.dark} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={onChatPress}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.dark} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={onNotificationsPress}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.dark}
            />
          </Pressable>
        </View>
      </View>
      <View style={styles.searchWrap}>
        <SearchBar
          editable={false}
          onPress={onSearchPress}
          placeholder="Search Express-style deals"
          style={{ paddingVertical: 14 }}
        />
        <Pressable style={styles.iconButton}>
          <Ionicons name="qr-code-outline" size={20} color={colors.dark} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },
  containerWide: {
    // paddingTop handled dynamically via insets
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  location: {
    color: colors.dark,
    fontSize: 18,
    fontWeight: "700",
  },
  searchWrap: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  iconRow: {
    flexDirection: "row",
    gap: 8,
  },
});
