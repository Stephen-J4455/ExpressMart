import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme/colors";

export const SearchBar = ({
  value,
  onChangeText,
  placeholder = "Search products",
  editable = true,
  onPress,
  style,
  ...inputProps
}) => {
  if (!editable) {
    return (
      <Pressable
        style={[styles.wrapper, style]}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Ionicons name="search" size={18} color={colors.muted} />
        <Text style={styles.placeholder}>{placeholder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        {...inputProps}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    maxWidth: 280,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
  },
  placeholder: {
    color: colors.muted,
    fontSize: 15,
  },
});
