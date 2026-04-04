import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

export const FlashSaleCountdown = ({ endTime, startTime, onExpire, compact = false, withProgressBar = false, mini = false, availableQty = null }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  });
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(endTime).getTime();
      const distance = end - now;

      if (distance < 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          expired: true,
        });
        setProgress(0);
        onExpire?.();
        return;
      }

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
        expired: false,
      });

      // Calculate progress percentage for progress bar
      if (startTime && withProgressBar) {
        const start = new Date(startTime).getTime();
        const totalDuration = end - start;
        const elapsed = now - start;
        const progressPercent = Math.max(0, Math.min(100, ((totalDuration - elapsed) / totalDuration) * 100));
        setProgress(progressPercent);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [endTime, startTime, onExpire, withProgressBar]);

  if (timeLeft.expired) {
    return null;
  }

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Ionicons name="time-outline" size={12} color="#EF4444" />
        <Text style={styles.compactText}>
          {timeLeft.days > 0
            ? `${timeLeft.days}d ${timeLeft.hours}h`
            : timeLeft.hours > 0
            ? `${timeLeft.hours}h ${timeLeft.minutes}m`
            : `${timeLeft.minutes}m ${timeLeft.seconds}s`}
        </Text>
        {availableQty != null && (
          <Text style={styles.compactAvailableText}>{availableQty} left</Text>
        )}
      </View>
    );
  }

  if (withProgressBar) {
    // Mini version for product cards
    if (mini) {
      return (
        <View style={styles.miniProgressBarContainer}>
          <View style={styles.miniProgressBarHeader}>
            <View style={styles.miniFlashIconRow}>
              <Ionicons name="flash" size={10} color="#EF4444" />
              <Text style={styles.miniProgressBarTime}>
                {timeLeft.days > 0
                  ? `${timeLeft.days}d ${String(timeLeft.hours).padStart(2, "0")}:${String(timeLeft.minutes).padStart(2, "0")}`
                  : `${String(timeLeft.hours).padStart(2, "0")}:${String(timeLeft.minutes).padStart(2, "0")}:${String(timeLeft.seconds).padStart(2, "0")}`}
              </Text>
            </View>
            {availableQty != null && (
              <Text style={styles.miniAvailableText}>{availableQty} left</Text>
            )}
          </View>
          <View style={styles.miniProgressBarBackground}>
            <LinearGradient
              colors={["#EF4444", "#DC2626"]}
              style={[styles.miniProgressBarFill, { width: `${progress}%` }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </View>
        </View>
      );
    }

    // Full version for product detail page
    return (
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarHeader}>
          <View style={styles.flashIconRow}>
            <LinearGradient
              colors={["#EF4444", "#DC2626"]}
              style={styles.progressIconGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="flash" size={12} color="#fff" />
            </LinearGradient>
            <Text style={styles.progressBarTitle}>Flash Sale Ends In</Text>
          </View>
          <View style={styles.timeQtyRow}>
            {availableQty != null && (
              <Text style={styles.availableText}>{availableQty} left</Text>
            )}
            <Text style={styles.progressBarTime}>
              {timeLeft.days > 0
                ? `${timeLeft.days}d ${String(timeLeft.hours).padStart(2, "0")}:${String(timeLeft.minutes).padStart(2, "0")}:${String(timeLeft.seconds).padStart(2, "0")}`
                : `${String(timeLeft.hours).padStart(2, "0")}:${String(timeLeft.minutes).padStart(2, "0")}:${String(timeLeft.seconds).padStart(2, "0")}`}
            </Text>
          </View>
        </View>
        <View style={styles.progressBarBackground}>
          <LinearGradient
            colors={["#EF4444", "#DC2626"]}
            style={[styles.progressBarFill, { width: `${progress}%` }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </View>
        <View style={styles.progressBarLabels}>
          <Text style={styles.progressBarLabel}>Hurry! Limited Time</Text>
          <Text style={styles.progressBarPercentage}>{Math.round(progress)}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LinearGradient
          colors={["#EF4444", "#DC2626"]}
          style={styles.iconGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="flash" size={14} color="#fff" />
        </LinearGradient>
        <Text style={styles.title}>Flash Sale Ends In</Text>
      </View>
      <View style={styles.timerContainer}>
        {timeLeft.days > 0 && (
          <View style={styles.timeBox}>
            <LinearGradient
              colors={["#FEF2F2", "#FEE2E2"]}
              style={styles.timeBoxGradient}
            >
              <Text style={styles.timeValue}>{String(timeLeft.days).padStart(2, "0")}</Text>
              <Text style={styles.timeLabel}>Days</Text>
            </LinearGradient>
          </View>
        )}
        <View style={styles.timeBox}>
          <LinearGradient
            colors={["#FEF2F2", "#FEE2E2"]}
            style={styles.timeBoxGradient}
          >
            <Text style={styles.timeValue}>{String(timeLeft.hours).padStart(2, "0")}</Text>
            <Text style={styles.timeLabel}>Hours</Text>
          </LinearGradient>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.timeBox}>
          <LinearGradient
            colors={["#FEF2F2", "#FEE2E2"]}
            style={styles.timeBoxGradient}
          >
            <Text style={styles.timeValue}>{String(timeLeft.minutes).padStart(2, "0")}</Text>
            <Text style={styles.timeLabel}>Mins</Text>
          </LinearGradient>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.timeBox}>
          <LinearGradient
            colors={["#FEF2F2", "#FEE2E2"]}
            style={styles.timeBoxGradient}
          >
            <Text style={styles.timeValue}>{String(timeLeft.seconds).padStart(2, "0")}</Text>
            <Text style={styles.timeLabel}>Secs</Text>
          </LinearGradient>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  iconGradient: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  timeBox: {
    borderRadius: 8,
    overflow: "hidden",
  },
  timeBoxGradient: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 50,
  },
  timeValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#EF4444",
    lineHeight: 24,
  },
  timeLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#DC2626",
    textTransform: "uppercase",
    marginTop: 2,
  },
  separator: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EF4444",
    marginHorizontal: -2,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  compactText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#EF4444",
  },
  progressBarContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    gap: 8,
  },
  progressBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  flashIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressIconGradient: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EF4444",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  progressBarTime: {
    fontSize: 14,
    fontWeight: "900",
    color: "#EF4444",
    fontVariant: ["tabular-nums"],
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBarLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#DC2626",
  },
  progressBarPercentage: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
  },
  // Mini progress bar styles for product cards
  miniProgressBarContainer: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 6,
    paddingBottom: 8,
    gap: 4,
    marginTop: 8,
  },
  compactAvailableText: {
    marginTop: 2,
    fontSize: 10,
    color: "#DC2626",
    fontWeight: "600",
  },
  miniProgressBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  miniFlashIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniProgressBarTime: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
    fontVariant: ["tabular-nums"],
  },
  miniProgressBarBackground: {
    height: 4,
    backgroundColor: "#FEE2E2",
    borderRadius: 2,
    overflow: "hidden",
  },
  miniProgressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  availableText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
    textAlign: "center",
  },
  miniAvailableText: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#DC2626",
    textAlign: "center",
  },
});
