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
       
          <View style={styles.searchWrap}>
            <SearchBar
              editable={false}
              onPress={onSearchPress}
              placeholder="Search ExpressMart"
              style={{ paddingVertical: 14 }}
            />
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
    marginTop: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e3e6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  iconRow: {
    flexDirection: "row",
    gap: 8,
  },
});
