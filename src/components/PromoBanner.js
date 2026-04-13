import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";

export const PromoBanner = ({ deal, onPress }) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: deal.background_color || "#FFFFFF",
          borderRadius: deal.border_radius || 12,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.rowContent}>
        <Image
          source={{ uri: deal.image }}
          style={styles.cardInfoImage}
          resizeMode="cover"
        />

        <View style={styles.cardInfoContent}>
          {deal.discount && (
            <View style={[styles.solidDiscountBadge, { backgroundColor: deal.discount_color || '#FF6B6B' }]}>
              <Text style={[styles.solidDiscountText]}>{deal.discount}</Text>
            </View>
          )}

          <Text style={[styles.solidTitle, { color: deal.text_color || "#000" }]} numberOfLines={2}>
            {deal.label}
          </Text>

          {deal.subtitle && (
            <Text
              style={[
                styles.solidSubtitle,
                { color: deal.text_color || "#000", opacity: 0.7 },
                { marginBottom: 8 }
              ]}
              numberOfLines={2}
            >
              {deal.subtitle}
            </Text>
          )}

          <View style={[styles.solidCta, { backgroundColor: deal.accent_color || '#0B6EFE', alignSelf: 'flex-start' }]}>
            <Text style={styles.solidCtaText}>{deal.cta_text || "Shop Now"}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 160,
    width: 320,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  rowContent: {
    flexDirection: "row",
    height: "100%",
  },
  cardInfoImage: {
    width: 120,
    height: '100%',
  },
  cardInfoContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  solidDiscountBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  solidDiscountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  solidTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  solidSubtitle: {
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
  solidCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  solidCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  }
});
