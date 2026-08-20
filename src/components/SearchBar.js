import { Ionicons } from "@expo/vector-icons";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { radius } from "../theme/colors";
import { useAppStyles } from "../hooks/useAppStyles";

export const SearchBar = ({
  value,
  onChangeText,
  placeholder = "Search products",
  editable = true,
  onPress,
  style,
  ...inputProps
}) => {
  const styles = useAppStyles((c) =>
    StyleSheet.create({
      wrapper: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: radius.xl,
        backgroundColor: c.light,
        paddingHorizontal: 14,
        paddingVertical: 8,
        gap: 8,
        maxWidth: 280,
        shadowColor: "#000",
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      },
      input: {
        flex: 1,
        fontSize: 16,
        color: c.dark,
        ...(Platform.OS === "web"
          ? { outlineStyle: "none", outlineWidth: 0 }
          : {}),
      },
      placeholder: {
        color: c.muted,
        fontSize: 15,
      },
    }),
  );
  if (!editable) {
    return (
      <Pressable
        style={[styles.wrapper, style]}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Ionicons name="search" size={18} color={styles.placeholder.color} />
        <Text style={styles.placeholder}>{placeholder}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <Ionicons name="search" size={18} color={styles.placeholder.color} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={styles.placeholder.color}
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
