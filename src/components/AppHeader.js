import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";
import { useAppStyles } from "../hooks/useAppStyles";
import { useTheme } from "../context/ThemeContext";

export const AppHeader = ({
  onSearchPress,
  onChatPress,
  onNotificationsPress,
}) => {
  const { isWide, horizontalPadding } = useResponsive();
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) =>
    StyleSheet.create({
      container: {
        paddingBottom: 16,
        backgroundColor: c.background,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      },
      containerWide: {
        // paddingTop handled dynamically via insets
      },
      topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      brandWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      },
      brandTag: {
        color: c.light,
        fontSize: 30,
        fontWeight: "900",
        letterSpacing: 0.5,
        textShadowColor: "rgba(0,0,0,0.35)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      brandTagAccent: {
        color: c.warmCoral,
        fontSize: 30,
        fontWeight: "900",
        letterSpacing: 0.5,
        textShadowColor: "rgba(0,0,0,0.35)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      iconButton: {
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.primary,
      },
      iconRow: {
        flexDirection: "row",
        gap: 8,
      },
    }),
  );
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
        <Pressable
          style={styles.iconButton}
          onPress={onSearchPress}
          accessibilityRole="button"
        >
          <Ionicons name="search-outline" size={20} color={themeColors.light} />
        </Pressable>

        <View style={styles.brandWrap}>
          <Text style={styles.brandTag}>
            tag<Text style={styles.brandTagAccent}>it</Text>
          </Text>
        </View>

        <View style={styles.iconRow}>
          <Pressable style={styles.iconButton} onPress={onChatPress}>
            <Ionicons name="chatbubble-outline" size={20} color={themeColors.light} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={onNotificationsPress}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={themeColors.light}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
};