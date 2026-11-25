import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getProductPhotoCrop, initialPhotoCrop, toPixelCrop } from "../utils/productPhotoCrop";

export function ProductPhotoCropper({
  assets,
  busy,
  colors,
  insets,
  onCancel,
  onApply,
}) {
  const [index, setIndex] = useState(0);
  const [crops, setCrops] = useState({});
  const { width, height } = useWindowDimensions();
  const frame = Math.max(80, Math.min(width - 40, height - insets.top - insets.bottom - 245, 420));
  const asset = assets[index];
  const dimensions = { width: asset.width, height: asset.height };
  const crop = crops[index] || initialPhotoCrop;
  const rect = getProductPhotoCrop(dimensions, crop);
  const scale = frame / rect.width;
  const visibleRect = useRef(rect);
  visibleRect.current = rect;
  const start = useRef(null);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      !busy && (Math.abs(dx) > 3 || Math.abs(dy) > 3),
    onPanResponderGrant: () => {
      const visible = visibleRect.current;
      start.current = {
        x: visible.originX + visible.width / 2,
        y: visible.originY + visible.height / 2,
        size: visible.width,
      };
    },
    onPanResponderMove: (_, { dx, dy }) => {
      const origin = start.current;
      if (!origin) return;
      const half = origin.size / 2;
      const multiplier = origin.size / frame;
      const x = Math.max(half, Math.min(asset.width - half, origin.x - dx * multiplier));
      const y = Math.max(half, Math.min(asset.height - half, origin.y - dy * multiplier));
      setCrops((previous) => ({
        ...previous,
        [index]: {
          ...(previous[index] || initialPhotoCrop),
          x: x / asset.width,
          y: y / asset.height,
        },
      }));
    },
  }), [asset, busy, frame, index]);

  const zoom = (delta) => {
    setCrops((previous) => {
      const current = previous[index] || initialPhotoCrop;
      const visible = getProductPhotoCrop(asset, current);
      return {
        ...previous,
        [index]: {
          x: (visible.originX + visible.width / 2) / asset.width,
          y: (visible.originY + visible.height / 2) / asset.height,
          zoom: Math.max(1, Math.min(4, current.zoom + delta)),
        },
      };
    });
  };

  const apply = () => {
    onApply(assets.map((photo, i) =>
      toPixelCrop(getProductPhotoCrop(photo, crops[i] || initialPhotoCrop)),
    ));
  };

  return (
    <View style={[styles.container, {
      backgroundColor: colors.background,
      paddingTop: insets.top + 8,
      paddingBottom: insets.bottom + 12,
    }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onCancel} disabled={busy} hitSlop={10}>
          <Text style={{ color: colors.primary }}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.dark }]}>Crop photos</Text>
        <Text style={{ color: colors.muted }}>{index + 1} / {assets.length}</Text>
      </View>
      <View style={styles.editor}>
        <Text style={{ color: colors.muted }}>Drag to frame the photo.</Text>
        <View
          {...pan.panHandlers}
          style={[
            styles.frame,
            { width: frame, height: frame, borderColor: colors.border },
            Platform.OS === "web" && { touchAction: "none" },
          ]}
        >
          <Image
            key={asset.uri}
            pointerEvents="none"
            source={{ uri: asset.uri }}
            resizeMode="stretch"
            style={{
              position: "absolute",
              width: asset.width * scale,
              height: asset.height * scale,
              left: -rect.originX * scale,
              top: -rect.originY * scale,
            }}
          />
        </View>
        <View style={styles.zoom}>
          {[-0.25, 0.25].map((delta) => {
            const disabled = busy || (delta < 0 ? crop.zoom <= 1 : crop.zoom >= 4);
            return (
              <Pressable
                key={delta}
                accessibilityRole="button"
                accessibilityLabel={delta < 0 ? "Zoom out" : "Zoom in"}
                onPress={() => zoom(delta)}
                disabled={disabled}
                style={[styles.zoomButton, { borderColor: colors.border, opacity: disabled ? 0.4 : 1 }]}
              >
                <Ionicons name={delta < 0 ? "remove" : "add"} size={22} color={colors.dark} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.thumbnailRow}>
        {assets.map((photo, i) => (
          <Pressable
            key={photo.uri}
            accessibilityRole="button"
            accessibilityLabel={`Edit photo ${i + 1}`}
            accessibilityState={{ selected: i === index }}
            disabled={busy}
            onPress={() => setIndex(i)}
            style={[styles.thumbnail, { borderColor: i === index ? colors.primary : colors.border }]}
          >
            <Image source={{ uri: photo.uri }} style={styles.thumbnailImage} />
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={apply}
        style={[styles.apply, { backgroundColor: colors.primary }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.applyText, { color: colors.onPrimary }]}>
            Use {assets.length} {assets.length === 1 ? "photo" : "photos"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  title: { fontSize: 18, fontWeight: "700" },
  editor: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  frame: { overflow: "hidden", borderWidth: 1, borderRadius: 8 },
  zoom: { flexDirection: "row", gap: 12 },
  zoomButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1 },
  thumbnailRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginVertical: 12 },
  thumbnail: { width: 45, height: 45, borderWidth: 2, borderRadius: 8, overflow: "hidden" },
  thumbnailImage: { width: "100%", height: "100%" },
  apply: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  applyText: { fontSize: 15, fontWeight: "700" },
});
