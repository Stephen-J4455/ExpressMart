// ── ScreenPointerOverlay — screen grounding & object pointing ────────────────
// Mounted once at the app root (inside NavigationWithTheme). When
// TagAIAssistantContext.groundingTarget is set, this overlay:
//   1. Resolves the registered ref for the target key (useGrounding).
//   2. Retries measurement briefly — this lets a navigate_to_page tool call
//      complete and the destination screen mount its element first.
//   3. Renders a dimmed backdrop with a "spotlight" hole over the element, a
//      pulsing highlight ring, a bouncing pointer arrow and a label bubble.
//   4. Supports richer pointer shapes (rect / circle / arrow / bracket),
//      sizes (sm / md / lg), directions (up / down / left / right / auto),
//      and absolute `coords {x, y, w, h}` for free-form targets.
// Auto-dismisses after a few seconds or on tap.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTagAIAssistant } from "../../context/TagAIAssistantContext";
import { GROUNDING_ELEMENTS } from "../../services/tagAIAssistantService";
import { useTheme } from "../../context/ThemeContext";
import { useAppStyles } from "../../hooks/useAppStyles";
import { radius } from "../../theme/colors";

const MEASURE_RETRY_MS = 180;
const MAX_MEASURE_ATTEMPTS = 25; // ~4.5s of retries (covers navigation mount)
const AUTO_DISMISS_MS = 6000;
const SPOTLIGHT_PAD = 10;

const SIZE_PADS = { sm: 6, md: SPOTLIGHT_PAD, lg: 18 };

const inferDirection = (rect, win) => {
  if (!rect || !win) return "down";
  const midY = rect.y + rect.height / 2;
  return midY < win.height / 2 ? "down" : "up";
};

const arrowTransform = (direction) => {
  switch (direction) {
    case "up":
      return [{ rotate: "180deg" }];
    case "left":
      return [{ rotate: "-90deg" }];
    case "right":
      return [{ rotate: "90deg" }];
    case "down":
    case "auto":
    default:
      return [{ rotate: "0deg" }];
  }
};

export const ScreenPointerOverlay = () => {
  const { colors, isDark } = useTheme();
  const styles = useAppStyles(buildStyles);
  const insets = useSafeAreaInsets();
  const { groundingTarget, clearGrounding, getGroundingRef } = useTagAIAssistant();

  const [rect, setRect] = useState(null);
  const [found, setFound] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [visible, setVisible] = useState(false);
  // Previous rect — used to draw a brief animated trail when the pointer
  // jumps between positions (e.g. scroll then point).
  const prevRectRef = useRef(null);

  // Animations
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pointerBob = useRef(new Animated.Value(0)).current;
  const trail = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef(null);
  const bobLoop = useRef(null);

  const meta = groundingTarget ? GROUNDING_ELEMENTS[groundingTarget.key] : null;
  const targetKey = groundingTarget?.key;
  const nonce = groundingTarget?.nonce || 0;
  // Generic target = no registry entry + caller-supplied label. These never
  // resolve to a ref, so only briefly retry before falling back to pointing
  // at the middle of the screen.
  const isGenericTarget =
    !meta && Boolean(groundingTarget?.label ?? groundingTarget?.hint);

  // Pull the new optional fields off the target.
  const targetShape = groundingTarget?.shape || "rect";
  const targetSize = groundingTarget?.size || "md";
  const targetCoords = groundingTarget?.coords || null;
  const targetDirectionRaw = groundingTarget?.direction || "auto";
  const spotlightPad = SIZE_PADS[targetSize] || SPOTLIGHT_PAD;

  // Measure (with retries) whenever the target changes.
  useEffect(() => {
    if (!targetKey) {
      setRect(null);
      setFound(false);
      setNotFound(false);
      setVisible(false);
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;
    let timer = null;

    const retry = () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > (isGenericTarget ? 3 : MAX_MEASURE_ATTEMPTS)) {
        // Element never appeared — show the graceful "not on screen" state.
        setRect(null);
        setFound(false);
        setNotFound(true);
        return;
      }
      timer = setTimeout(tryMeasure, MEASURE_RETRY_MS);
    };

    const tryMeasure = () => {
      if (cancelled) return;
      const ref = getGroundingRef(targetKey);
      if (ref?.current && typeof ref.current.measureInWindow === "function") {
        ref.current.measureInWindow((x, y, w, h) => {
          if (cancelled) return;
          if (w > 0 && h > 0 && x > -9999 && y > -9999) {
            setRect({ x, y, width: w, height: h });
            setFound(true);
          } else {
            retry();
          }
        });
      } else {
        retry();
      }
    };

    setVisible(false);
    setFound(false);
    setNotFound(false);
    setRect(null);
    tryMeasure();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [targetKey, nonce, getGroundingRef]);

  // Free-form target via absolute coords — bypass measurement entirely.
  // The LLM passes {x, y, w, h} in window coordinates.
  useEffect(() => {
    if (!targetCoords) return;
    const c = targetCoords;
    if (
      Number.isFinite(c.x) &&
      Number.isFinite(c.y) &&
      Number.isFinite(c.w) &&
      Number.isFinite(c.h) &&
      c.w > 0 &&
      c.h > 0
    ) {
      // Stash previous rect for the animated trail.
      prevRectRef.current = rect;
      setRect({ x: c.x, y: c.y, width: c.w, height: c.h });
      setFound(true);
      setNotFound(false);
      // Run the trail animation once.
      trail.setValue(0);
      Animated.timing(trail, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    // We intentionally do NOT depend on `rect` here so this runs only when
    // targetCoords change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCoords, nonce]);

  const dismiss = () => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      clearGrounding();
      setVisible(false);
    });
  };

  // Fade in once measurement resolved (found or gave up), start loops,
  // schedule auto-dismiss.
  useEffect(() => {
    if (!found && !notFound) return undefined;
    setVisible(true);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    pulse.setValue(0);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.current.start();

    bobLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pointerBob, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pointerBob, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    bobLoop.current.start();

    const dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      pulseLoop.current?.stop();
      bobLoop.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, notFound]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.28],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 0],
  });
  const pointerTranslateY = pointerBob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });
  // Direction-aware translate for the caret — when the pointer is at the
  // bottom half of the screen we flip so it still points "outward".
  const directionTranslate =
    resolvedDirection === "up"
      ? pointerBob.interpolate({ inputRange: [0, 1], outputRange: [0, 7] })
      : resolvedDirection === "left"
      ? pointerBob.interpolate({ inputRange: [0, 1], outputRange: [0, 7] })
      : resolvedDirection === "right"
      ? pointerBob.interpolate({ inputRange: [0, 1], outputRange: [0, 7] })
      : pointerTranslateY;

  // Spotlight geometry: a padded hole around the measured target.
  const spotlight = useMemo(() => {
    if (!rect) return null;
    return {
      x: Math.max(rect.x - spotlightPad, 0),
      y: Math.max(rect.y - spotlightPad, 0),
      width: rect.width + spotlightPad * 2,
      height: rect.height + spotlightPad * 2,
    };
  }, [rect, spotlightPad]);

  // Direction (final, after "auto" inference) — drives the pointer/arrow
  // orientation and the bobbing vector.
  const resolvedDirection = useMemo(() => {
    if (targetDirectionRaw && targetDirectionRaw !== "auto") return targetDirectionRaw;
    return inferDirection(rect, Dimensions.get("window"));
  }, [targetDirectionRaw, rect, nonce]);

  // Animated trail — a short line from the previous rect to the current one.
  // We render it as a thin View positioned between the two rects and fade it
  // out via the `trail` animated value.
  const trailView = useMemo(() => {
    const prev = prevRectRef.current;
    if (!prev || !rect) return null;
    const px = prev.x + prev.width / 2;
    const py = prev.y + prev.height / 2;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const dx = cx - px;
    const dy = cy - py;
    const length = Math.hypot(dx, dy);
    if (length < 4) return null;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { x: px, y: py, length, angle };
  }, [rect, nonce]);
  const trailOpacity = trail.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  // Generic pointing mode — no registered ref matched this key. Instead of
  // dead-ending, highlight the middle of the current screen so TagAI can
  // point at ANYTHING on ANY page. (Computed unconditionally — Rules of
  // Hooks require all hooks to run before any early return.)
  const genericSpotlight = useMemo(() => {
    const win = Dimensions.get("window");
    const width = Math.min(win.width * 0.72, 300);
    const height = 150;
    return {
      x: (win.width - width) / 2,
      y: win.height * 0.3,
      width,
      height,
    };
  }, [nonce]);

  if (!groundingTarget || !visible) return null;

  // Label/hint: caller-supplied overrides (generic pointing) win, then the
  // static registry metadata, then a prettified key.
  const rawKey = targetKey ? String(targetKey) : "";
  const label =
    groundingTarget?.label ||
    meta?.label ||
    (rawKey ? rawKey.replace(/[._]/g, " ") : "") ||
    "this area";
  const hint = groundingTarget?.hint ?? meta?.hint ?? "";
  const labelAbove = spotlight ? spotlight.y > 120 : true;

  // Generic pointing applies when there's no registered ref but we have a
  // meaningful target to show.
  const hasMeaningfulTarget = Boolean(groundingTarget?.label || meta);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
      pointerEvents="box-none"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss}>
        {/* Dimmed backdrop with spotlight hole (4 rects around the target) */}
        {spotlight ? (
          <>
            <View
              style={[styles.dim, { top: 0, left: 0, right: 0, height: spotlight.y }]}
            />
            <View
              style={[
                styles.dim,
                {
                  top: spotlight.y + spotlight.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            <View
              style={[
                styles.dim,
                {
                  top: spotlight.y,
                  height: spotlight.height,
                  left: 0,
                  width: spotlight.x,
                },
              ]}
            />
            <View
              style={[
                styles.dim,
                {
                  top: spotlight.y,
                  height: spotlight.height,
                  left: spotlight.x + spotlight.width,
                  right: 0,
                },
              ]}
            />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}
      </Pressable>

      {spotlight ? (
        <>
          {/* Pulsing highlight ring */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: spotlight.x,
                top: spotlight.y,
                width: spotlight.width,
                height: spotlight.height,
                borderColor: colors.accent,
                transform: [{ scale: ringScale }],
                opacity: ringOpacity,
              },
            ]}
          />
          {/* Crisp border on the target */}
          <View
            pointerEvents="none"
            style={[
              styles.ringCrisp,
              {
                left: spotlight.x,
                top: spotlight.y,
                width: spotlight.width,
                height: spotlight.height,
                borderColor: colors.accent,
                borderRadius:
                  targetShape === "circle"
                    ? Math.max(spotlight.width, spotlight.height) / 2
                    : targetShape === "bracket"
                    ? 0
                    : radius.md,
              },
            ]}
          />

          {/* Animated trail — a thin glowing line from the previous rect to
              the current one. Fades out automatically. */}
          {trailView ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: trailView.x,
                top: trailView.y,
                width: trailView.length,
                height: 2,
                backgroundColor: colors.accent,
                opacity: trailOpacity,
                transform: [
                  { translateY: -1 },
                  { rotate: `${trailView.angle}deg` },
                ],
                shadowColor: colors.accent,
                shadowOpacity: 0.6,
                shadowRadius: 4,
              }}
            />
          ) : null}

          {/* Arrow shape — a big directional arrow drawn over the target. */}
          {targetShape === "arrow" ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: rect.x + rect.width / 2 - 14,
                top: rect.y + rect.height / 2 - 14,
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                transform: [
                  ...arrowTransform(resolvedDirection),
                  {
                    translateY: pointerBob.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -6],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="caret-up-circle" size={28} color={colors.accent} />
            </Animated.View>
          ) : null}

          {/* Bracket shape — four corner brackets framing the target. */}
          {targetShape === "bracket" ? (
            <>
              {[
                { left: spotlight.x, top: spotlight.y, corner: "tl" },
                {
                  left: spotlight.x + spotlight.width - 14,
                  top: spotlight.y,
                  corner: "tr",
                },
                {
                  left: spotlight.x,
                  top: spotlight.y + spotlight.height - 14,
                  corner: "bl",
                },
                {
                  left: spotlight.x + spotlight.width - 14,
                  top: spotlight.y + spotlight.height - 14,
                  corner: "br",
                },
              ].map((b, i) => (
                <View
                  key={`bracket-${i}`}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: b.left,
                    top: b.top,
                    width: 14,
                    height: 14,
                    borderColor: colors.accent,
                    borderTopWidth: b.corner === "tl" || b.corner === "tr" ? 3 : 0,
                    borderLeftWidth: b.corner === "tl" || b.corner === "bl" ? 3 : 0,
                    borderRightWidth: b.corner === "tr" || b.corner === "br" ? 3 : 0,
                    borderBottomWidth: b.corner === "bl" || b.corner === "br" ? 3 : 0,
                    borderTopLeftRadius: b.corner === "tl" ? 6 : 0,
                    borderTopRightRadius: b.corner === "tr" ? 6 : 0,
                    borderBottomLeftRadius: b.corner === "bl" ? 6 : 0,
                    borderBottomRightRadius: b.corner === "br" ? 6 : 0,
                  }}
                />
              ))}
            </>
          ) : null}

          {/* Bouncing pointer + label bubble */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.labelWrap,
              {
                left: Math.max(spotlight.x - 8, 12),
                top: labelAbove
                  ? Math.max(spotlight.y - 96, insets.top + 8)
                  : Math.min(spotlight.y + spotlight.height + 10, 99999),
                transform: [{ translateY: directionTranslate }],
              },
            ]}
          >
            <View style={[styles.labelBubble, { borderColor: colors.accent }]}>
              <View style={styles.labelTitleRow}>
                <Ionicons name="location" size={14} color={colors.accent} />
                <Text style={[styles.labelTitle, { color: colors.dark }]}>
                  {label}
                </Text>
              </View>
              {!!hint && (
                <Text
                  style={[styles.labelHint, { color: colors.muted }]}
                  numberOfLines={3}
                >
                  {hint}
                </Text>
              )}
            </View>
            <Ionicons
              name={labelAbove ? "caret-up" : "caret-down"}
              size={18}
              color={colors.accent}
              style={styles.labelCaret}
            />
          </Animated.View>
        </>
      ) : hasMeaningfulTarget ? (
        /* Generic pointing mode — no registered ref for this target, so
           highlight the middle of the current screen instead of giving up.
           TagAI can point at ANYTHING on ANY page this way. */
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: genericSpotlight.x,
                top: genericSpotlight.y,
                width: genericSpotlight.width,
                height: genericSpotlight.height,
                borderColor: colors.accent,
                transform: [{ scale: ringScale }],
                opacity: ringOpacity,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.ringCrisp,
              {
                left: genericSpotlight.x,
                top: genericSpotlight.y,
                width: genericSpotlight.width,
                height: genericSpotlight.height,
                borderColor: colors.accent,
              },
            ]}
          />
          <View style={styles.notFoundWrap} pointerEvents="none">
            <View style={[styles.labelBubble, { borderColor: colors.accent }]}>
              <View style={styles.labelTitleRow}>
                <Ionicons name="location" size={14} color={colors.accent} />
                <Text style={[styles.labelTitle, { color: colors.dark }]}>
                  {label}
                </Text>
              </View>
              {!!hint && (
                <Text
                  style={[styles.labelHint, { color: colors.muted }]}
                  numberOfLines={4}
                >
                  {hint}
                </Text>
              )}
              {!hint && (
                <Text style={[styles.labelHint, { color: colors.muted }]}>
                  It should be right around this area of the screen.
                </Text>
              )}
            </View>
          </View>
        </>
      ) : (
        /* No ref AND no label info — explain and suggest navigating first */
        <View style={styles.notFoundWrap} pointerEvents="none">
          <View style={[styles.labelBubble, { borderColor: colors.accent }]}>
            <View style={styles.labelTitleRow}>
              <Ionicons name="help-circle" size={14} color={colors.accent} />
              <Text style={[styles.labelTitle, { color: colors.dark }]}>
                I couldn't find “{label}” on this screen
              </Text>
            </View>
            <Text style={[styles.labelHint, { color: colors.muted }]}>
              Try navigating there first, then ask me again.
            </Text>
          </View>
        </View>
      )}

      {/* Tap hint */}
      <View
        style={[styles.tapHint, { bottom: insets.bottom + 24 }]}
        pointerEvents="none"
      >
        <Text
          style={[
            styles.tapHintText,
            { color: isDark ? colors.whiteAlpha : "#FFFFFF" },
          ]}
        >
          Tap anywhere to dismiss
        </Text>
      </View>
    </Animated.View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    root: {
      zIndex: 9999,
      elevation: 9999,
    },
    dim: {
      position: "absolute",
      backgroundColor: "rgba(2, 6, 23, 0.55)",
    },
    ring: {
      position: "absolute",
      borderRadius: radius.md,
      borderWidth: 3,
      borderStyle: "solid",
    },
    ringCrisp: {
      position: "absolute",
      borderRadius: radius.md,
      borderWidth: 2,
      borderStyle: "solid",
    },
    labelWrap: {
      position: "absolute",
      alignItems: "flex-start",
      maxWidth: 300,
    },
    labelBubble: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderStyle: "solid",
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 3,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    labelTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    labelTitle: {
      fontSize: 13,
      fontWeight: "700",
      flexShrink: 1,
    },
    labelHint: {
      fontSize: 11.5,
      lineHeight: 15,
    },
    labelCaret: {
      marginLeft: 22,
    },
    notFoundWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    tapHint: {
      position: "absolute",
      alignSelf: "center",
    },
    tapHintText: {
      fontSize: 11,
      fontWeight: "600",
      opacity: 0.85,
    },
  });
