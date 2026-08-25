// FeedVideo (web)
// ---------------------------------------------------------------------------
// Web implementation of the feed video player.
//
// react-native-video has NO web implementation — importing/rendering it on an
// Expo-web build crashes the app. This module keeps the exact same props API
// as the native <Video /> (source, paused, muted, repeat, resizeMode, and the
// onLoad/onBuffer/onError/onProgress/onReadyForDisplay callbacks) but renders
// a plain HTML5 <video> element through react-native-web's createElement, so
// screens can swap <Video /> for <FeedVideo /> without any other changes.
//
// The native counterpart lives in FeedVideo.native.js; Metro picks the right
// file per platform from the single "../components/FeedVideo" import.
// ---------------------------------------------------------------------------

import React, { forwardRef, useEffect, useRef } from "react";
import { createElement, View } from "react-native";

const RESIZE_TO_OBJECT_FIT = {
  cover: "cover",
  contain: "contain",
  fill: "fill",
  none: "none",
  "scale-down": "scale-down",
};

export const FeedVideo = forwardRef(function FeedVideo(props, forwardedRef) {
  const {
    source,
    style,
    paused = false,
    muted = false,
    repeat = false,
    resizeMode = "cover",
    onLoad,
    onReadyForDisplay,
    onBuffer,
    onError,
    onProgress,
    // Native-only props: accepted so call sites stay identical, ignored here.
    bufferConfig,
    rate,
    volume,
    ...rest
  } = props;

  const videoRef = useRef(null);

  const setRef = (node) => {
    videoRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef && typeof forwardedRef === "object") {
      forwardedRef.current = node;
    }
  };

  // Mirror the `paused` prop onto the DOM element (autoplay policies require
  // calling play()/pause() explicitly rather than relying on attributes).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) {
      try {
        el.pause();
      } catch (e) {
        /* noop */
      }
    } else {
      const p = el.play();
      // Autoplay rejection (e.g. sound not allowed) must never crash the app.
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }, [paused, source?.uri]);

  // Mirror `muted`/`volume`/`rate` prop changes onto the DOM element so
  // gesture-driven changes (mute toggle, hold-to-fast-forward) work after
  // mount, not just on the initial render.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.muted = !!muted;
    } catch (e) {
      /* noop */
    }
  }, [muted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || typeof volume !== "number") return;
    try {
      el.volume = Math.min(1, Math.max(0, volume));
    } catch (e) {
      /* noop */
    }
  }, [volume]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || typeof rate !== "number") return;
    try {
      el.playbackRate = Math.max(0, rate);
    } catch (e) {
      /* noop */
    }
  }, [rate]);

  return (
    <View style={[{ overflow: "hidden" }, style]}>
      {createElement("video", {
        ref: setRef,
        src: source?.uri || undefined,
        playsInline: true,
        loop: !!repeat,
        muted: !!muted,
        controls: false,
        preload: "auto",
        disablePictureInPicture: true,
        onLoadedMetadata: (e) =>
          onLoad?.({ duration: e.target.duration || 0 }),
        onLoadedData: () => {
          onBuffer?.({ isBuffering: false });
          onReadyForDisplay?.();
        },
        onWaiting: () => onBuffer?.({ isBuffering: true }),
        onStalled: () => onBuffer?.({ isBuffering: true }),
        onPlaying: () => onBuffer?.({ isBuffering: false }),
        onCanPlay: () => onBuffer?.({ isBuffering: false }),
        onError: () => onError?.(new Error("Video failed to load")),
        onTimeUpdate: (e) => {
          const buffered = e.target.buffered;
          onProgress?.({
            currentTime: e.target.currentTime || 0,
            playableDuration:
              buffered && buffered.length > 0
                ? buffered.end(buffered.length - 1)
                : 0,
          });
        },
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: RESIZE_TO_OBJECT_FIT[resizeMode] || "cover",
          backgroundColor: "#000",
        },
        ...rest,
      })}
    </View>
  );
});