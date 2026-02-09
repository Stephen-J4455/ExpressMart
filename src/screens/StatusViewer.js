import React, { useEffect, useState, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    Image,
    SafeAreaView,
    Pressable,
    ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { supabase } from "../lib/supabase";

export const StatusViewer = ({ navigation, route }) => {
    const initialStatus = route?.params?.status;
    const [statuses, setStatuses] = useState(initialStatus ? [initialStatus] : []);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(!initialStatus);

    const seller = useMemo(() => {
        const active = statuses[currentIndex];
        return active?.seller || initialStatus?.seller;
    }, [statuses, currentIndex, initialStatus]);

    const currentStatus = statuses[currentIndex];

    useEffect(() => {
        const fetchStatuses = async () => {
            if (!initialStatus?.seller_id && !initialStatus?.seller?.id) return;
            const sellerId = initialStatus?.seller_id || initialStatus?.seller?.id;
            setLoading(true);
            try {
                const now = new Date().toISOString();
                const { data, error } = await supabase
                    .from("express_seller_statuses")
                    .select("*, seller:express_sellers(id, name, avatar)")
                    .eq("seller_id", sellerId)
                    .eq("is_active", true)
                    .gt("expires_at", now)
                    .order("created_at", { ascending: true });

                if (error) throw error;
                const list = [];
                const seen = new Set();
                if (initialStatus) {
                    list.push(initialStatus);
                    seen.add(initialStatus.id);
                }
                (data || []).forEach((row) => {
                    if (!seen.has(row.id)) {
                        seen.add(row.id);
                        list.push(row);
                    }
                });
                if (list.length > 0) {
                    setStatuses(list);
                    setCurrentIndex(0); // always start at first so it doesn't close immediately
                }
            } catch (err) {
                console.error("Error loading statuses", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStatuses();
    }, [initialStatus]);

    const handleNext = () => {
        if (currentIndex < statuses.length - 1) {
            setCurrentIndex((idx) => idx + 1);
        } else {
            navigation.goBack();
        }
    };

    if (!currentStatus && loading) {
        return (
            <SafeAreaView style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={[styles.errorText, { marginTop: 12 }]}>Loading status...</Text>
            </SafeAreaView>
        );
    }

    if (!currentStatus) {
        return (
            <SafeAreaView style={[styles.container, styles.centerContent]}>
                <Text style={styles.errorText}>No status to display</Text>
                <Pressable
                    style={styles.closeButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="close" size={20} color={colors.dark} />
                    <Text style={styles.closeText}>Close</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    return (
        <Pressable style={styles.container} onPress={handleNext}>
            {currentStatus.status_type === 'text' ? (
                // Text status with gradient or solid color background
                currentStatus.gradient_start ? (
                    <LinearGradient
                        colors={[currentStatus.gradient_start, currentStatus.gradient_end || currentStatus.gradient_start]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.media}
                    />
                ) : (
                    <View style={[styles.media, { backgroundColor: currentStatus.background_color || '#FFFFFF' }]} />
                )
            ) : (
                // Image status
                <Image
                    source={{ uri: currentStatus.media_url }}
                    style={styles.media}
                    resizeMode="cover"
                    defaultSource={null}
                />
            )}

            <SafeAreaView style={[styles.overlay, currentStatus.status_type === 'text' && styles.overlayText]}>
                <View style={styles.headerRow}>
                    <View style={styles.sellerRow}>
                        {currentStatus.seller?.avatar ? (
                            <Image source={{ uri: currentStatus.seller.avatar }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                <Ionicons name="storefront" size={20} color={colors.primary} />
                            </View>
                        )}
                        <View>
                            <Text style={styles.sellerName} numberOfLines={1}>
                                {currentStatus.seller?.name || "Store"}
                            </Text>
                            <Text style={styles.timestamp}>
                                {currentIndex + 1} / {statuses.length || 1}
                            </Text>
                        </View>
                    </View>
                    <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
                        <Ionicons name="close" size={20} color="#fff" />
                    </Pressable>
                </View>

                {currentStatus.status_type === 'text' ? (
                    // Text status main content - centered on the background
                    <View style={styles.textStatusContainer}>
                        <Text
                            style={[
                                styles.textStatusText,
                                {
                                    color: currentStatus.text_color || '#FFFFFF',
                                    fontSize: currentStatus.font_size || 28,
                                    lineHeight: (currentStatus.font_size || 28) * 1.4,
                                }
                            ]}
                        >
                            {currentStatus.status_text}
                        </Text>
                    </View>
                ) : currentStatus.status_text ? (
                    // Image status caption
                    <View style={styles.captionBox}>
                        <Text style={styles.captionText}>{currentStatus.status_text}</Text>
                    </View>
                ) : null}

                {currentStatus.status_type === 'text' && <View style={styles.spacer} />}
            </SafeAreaView>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    media: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    overlay: {
        flex: 1,
        justifyContent: "space-between",
        padding: 16,
    },
    overlayText: {
        justifyContent: "flex-start",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sellerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flex: 1,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.15)",
    },
    avatarPlaceholder: {
        alignItems: "center",
        justifyContent: "center",
    },
    sellerName: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
    timestamp: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 12,
        marginTop: 2,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(0,0,0,0.35)",
        alignItems: "center",
        justifyContent: "center",
    },
    captionBox: {
        backgroundColor: "rgba(0,0,0,0.45)",
        borderRadius: 12,
        padding: 12,
        marginTop: 16,
        maxWidth: "90%",
    },
    captionText: {
        color: "#fff",
        fontSize: 14,
        lineHeight: 20,
    },
    textStatusContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },
    textStatusText: {
        fontWeight: "700",
        textAlign: "center",
        textShadowColor: "rgba(0, 0, 0, 0.2)",
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    spacer: {
        height: 60,
    },
    closeButton: {
        marginTop: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: "#fff",
    },
    closeText: {
        color: colors.dark,
        fontWeight: "700",
    },
    centerContent: {
        justifyContent: "center",
        alignItems: "center",
    },
});
