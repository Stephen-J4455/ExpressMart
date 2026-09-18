import React, { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { FeedVideo } from "./FeedVideo";

// The caller keys this component by the prepared URI, so a new selection always
// starts paused. Playback never changes or re-encodes the selected upload file.
export const ProductVideoPreview = ({ uri, ready = true, active = true, style }) => {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState !== "background");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state !== "active") setOpened(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active || !ready || !isFocused) setOpened(false);
  }, [active, ready, isFocused]);

  const canOpen = !!uri && ready && active && isFocused && appActive;
  const visible = opened && canOpen;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.fill, { pointerEvents: "none" }]}>
        <FeedVideo
          source={{ uri }}
          style={styles.fill}
          resizeMode="contain"
          paused
          muted
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ready ? "Open video preview" : "Compressing video"}
        accessibilityState={{ disabled: !canOpen }}
        disabled={!canOpen}
        onPress={(event) => {
          event.stopPropagation();
          setError(false);
          setOpened(true);
        }}
        style={styles.center}
      >
        {ready ? (
          <View style={[styles.button, { pointerEvents: "none" }]}>
            <Ionicons name="play" size={32} color="#fff" />
          </View>
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setOpened(false)}
      >
        <View style={[styles.player, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Video preview</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close video preview"
              style={styles.button}
              onPress={() => setOpened(false)}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          {visible && !error ? (
            <FeedVideo
              source={{ uri }}
              style={styles.surface}
              resizeMode="contain"
              paused={false}
              muted
              controls
              repeat
              onError={() => setError(true)}
            />
          ) : error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Preview unavailable. Close and try again, or select another video.
            </Text>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: "relative", backgroundColor: "#000", overflow: "hidden", borderRadius: 12 },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  player: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  surface: { flex: 1, width: "100%" },
  error: { color: "#fff", fontSize: 12, textAlign: "center", padding: 12 },
});
