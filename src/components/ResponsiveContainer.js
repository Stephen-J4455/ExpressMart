import { View, StyleSheet } from "react-native";
import { useResponsive } from "../hooks/useResponsive";

/**
 * Wraps screen content so it centers with a max-width on wide viewports.
 * On mobile it's a transparent pass-through.
 *
 * Usage:
 *   <ResponsiveContainer maxWidth={800}>
 *     <ScrollView>...</ScrollView>
 *   </ResponsiveContainer>
 *
 * Props:
 *   maxWidth  – override the default contentMaxWidth (optional)
 *   style     – extra styles merged onto the outer View
 */
export const ResponsiveContainer = ({ children, maxWidth, style }) => {
  const { isWide, contentMaxWidth } = useResponsive();
  const effectiveMax = maxWidth ?? contentMaxWidth;

  return (
    <View
      style={[
        styles.root,
        isWide && {
          maxWidth: effectiveMax,
          alignSelf: "center",
          width: "100%",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
