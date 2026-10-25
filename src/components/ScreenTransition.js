import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useReducedMotion } from "react-native-reanimated";

export const ScreenTransition = ({ children }) => {
  const isFocused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();

    if (!isFocused || reduceMotion) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();

    return () => progress.stopAnimation();
  }, [isFocused, progress, reduceMotion]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
};

export const WebStackScreenTransition = ({ route, children }) =>
  route.name === "Main" ? (
    children
  ) : (
    <ScreenTransition>{children}</ScreenTransition>
  );
