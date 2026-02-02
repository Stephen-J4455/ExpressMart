import React, { useEffect } from "react";
import {
    View,
    Text,
    Image,
    Pressable,
    StyleSheet,
    Dimensions,
    ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useAds } from "../context/AdsContext";

const { width } = Dimensions.get("window");

export const AdBanner = ({ ad, onClose }) => {
    const { trackImpression, trackClick } = useAds();

    useEffect(() => {
        if (ad) {
            trackImpression(ad.id);
        }
    }, [ad]);

    if (!ad) return null;

    const handlePress = async () => {
        trackClick(ad.id);
        if (ad.cta_url) {
            try {
                await Linking.openURL(ad.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    const bannerStyle = {
        backgroundColor: ad.background_color || "#FFFFFF",
        borderRadius: ad.border_radius || 12,
    };

    const textStyle = {
        color: ad.text_color || "#000000",
    };

    const accentStyle = {
        color: ad.accent_color || "#0B6EFE",
    };

    return (
        <View style={[styles.bannerContainer, bannerStyle]}>
            <Pressable
                style={styles.closeButton}
                onPress={onClose}
            >
                <Ionicons name="close" size={20} color={ad.text_color || "#000000"} />
            </Pressable>

            <Image
                source={{ uri: ad.image_url }}
                style={styles.bannerImage}
            />

            <View style={styles.bannerContent}>
                {ad.discount_badge && (
                    <View
                        style={[
                            styles.discountBadge,
                            { backgroundColor: ad.discount_color || "#FF6B6B" },
                        ]}
                    >
                        <Text style={styles.discountText}>{ad.discount_badge}</Text>
                    </View>
                )}

                <Text style={[styles.bannerTitle, textStyle]}>{ad.title}</Text>

                {ad.description && (
                    <Text style={[styles.bannerDescription, textStyle]}>
                        {ad.description}
                    </Text>
                )}

                <Pressable
                    style={[styles.ctaButton, { backgroundColor: ad.accent_color }]}
                    onPress={handlePress}
                >
                    <Text style={styles.ctaText}>{ad.cta_text || "Shop Now"}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                </Pressable>
            </View>
        </View>
    );
};

export const AdCard = ({ ad }) => {
    const { trackImpression, trackClick } = useAds();

    useEffect(() => {
        if (ad) {
            trackImpression(ad.id);
        }
    }, [ad]);

    if (!ad) return null;

    const handlePress = async () => {
        trackClick(ad.id);
        if (ad.cta_url) {
            try {
                await Linking.openURL(ad.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    return (
        <Pressable
            style={[
                styles.card,
                {
                    backgroundColor: ad.background_color || "#FFFFFF",
                    borderRadius: ad.border_radius || 12,
                },
            ]}
            onPress={handlePress}
        >
            <Image
                source={{ uri: ad.image_url }}
                style={styles.cardImage}
            />

            <View style={styles.cardContent}>
                {ad.discount_badge && (
                    <View
                        style={[
                            styles.cardBadge,
                            { backgroundColor: ad.discount_color || "#FF6B6B" },
                        ]}
                    >
                        <Text style={styles.cardBadgeText}>{ad.discount_badge}</Text>
                    </View>
                )}

                <Text
                    style={[
                        styles.cardTitle,
                        { color: ad.text_color || "#000000" },
                    ]}
                    numberOfLines={2}
                >
                    {ad.title}
                </Text>

                {ad.description && (
                    <Text
                        style={[
                            styles.cardDescription,
                            { color: ad.text_color || "#000000" },
                        ]}
                        numberOfLines={2}
                    >
                        {ad.description}
                    </Text>
                )}

                <View
                    style={[
                        styles.cardCta,
                        { backgroundColor: ad.accent_color || "#0B6EFE" },
                    ]}
                >
                    <Text style={styles.cardCtaText}>
                        {ad.cta_text || "Shop Now"}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
};

export const AdCarousel = ({ ads }) => {
    const { trackImpression, trackClick } = useAds();
    const [currentIndex, setCurrentIndex] = React.useState(0);

    useEffect(() => {
        if (ads && ads[currentIndex]) {
            trackImpression(ads[currentIndex].id);
        }
    }, [currentIndex, ads]);

    if (!ads || ads.length === 0) return null;

    const currentAd = ads[currentIndex];

    const handlePress = async () => {
        trackClick(currentAd.id);
        if (currentAd.cta_url) {
            try {
                await Linking.openURL(currentAd.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    return (
        <View style={styles.carouselContainer}>
            <Pressable
                style={[
                    styles.carouselSlide,
                    {
                        backgroundColor: currentAd.background_color || "#FFFFFF",
                        borderRadius: currentAd.border_radius || 12,
                    },
                ]}
                onPress={handlePress}
            >
                <Image
                    source={{ uri: currentAd.image_url }}
                    style={styles.carouselImage}
                />

                <View style={styles.carouselContent}>
                    {currentAd.discount_badge && (
                        <View
                            style={[
                                styles.carouselBadge,
                                { backgroundColor: currentAd.discount_color || "#FF6B6B" },
                            ]}
                        >
                            <Text style={styles.carouselBadgeText}>
                                {currentAd.discount_badge}
                            </Text>
                        </View>
                    )}

                    <Text
                        style={[
                            styles.carouselTitle,
                            { color: currentAd.text_color || "#000000" },
                        ]}
                    >
                        {currentAd.title}
                    </Text>

                    {currentAd.description && (
                        <Text
                            style={[
                                styles.carouselDescription,
                                { color: currentAd.text_color || "#000000" },
                            ]}
                        >
                            {currentAd.description}
                        </Text>
                    )}

                    <Pressable
                        style={[
                            styles.carouselCta,
                            { backgroundColor: currentAd.accent_color || "#0B6EFE" },
                        ]}
                        onPress={handlePress}
                    >
                        <Text style={styles.carouselCtaText}>
                            {currentAd.cta_text || "Shop Now"}
                        </Text>
                    </Pressable>
                </View>
            </Pressable>

            {ads.length > 1 && (
                <View style={styles.carouselDots}>
                    {ads.map((_, index) => (
                        <Pressable
                            key={index}
                            style={[
                                styles.dot,
                                {
                                    backgroundColor:
                                        index === currentIndex ? currentAd.accent_color : "#ccc",
                                },
                            ]}
                            onPress={() => setCurrentIndex(index)}
                        />
                    ))}
                </View>
            )}
        </View>
    );
};

// Popup Ad - Modal overlay style
export const AdPopup = ({ ad, onClose, visible = true }) => {
    const { trackImpression, trackClick } = useAds();

    useEffect(() => {
        if (ad && visible) {
            trackImpression(ad.id);
        }
    }, [ad, visible]);

    if (!ad || !visible) return null;

    const handlePress = async () => {
        trackClick(ad.id);
        if (ad.cta_url) {
            try {
                await Linking.openURL(ad.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    return (
        <View style={styles.popupOverlay}>
            <View
                style={[
                    styles.popupContainer,
                    {
                        backgroundColor: ad.background_color || "#FFFFFF",
                        borderRadius: ad.border_radius || 16,
                    },
                ]}
            >
                <Pressable style={styles.popupClose} onPress={onClose}>
                    <Ionicons name="close-circle" size={28} color={ad.text_color || "#000"} />
                </Pressable>

                <Image source={{ uri: ad.image_url }} style={styles.popupImage} />

                <View style={styles.popupContent}>
                    {ad.discount_badge && (
                        <View
                            style={[
                                styles.popupBadge,
                                { backgroundColor: ad.discount_color || "#FF6B6B" },
                            ]}
                        >
                            <Text style={styles.popupBadgeText}>{ad.discount_badge}</Text>
                        </View>
                    )}

                    <Text style={[styles.popupTitle, { color: ad.text_color || "#000" }]}>
                        {ad.title}
                    </Text>

                    {ad.description && (
                        <Text style={[styles.popupDescription, { color: ad.text_color || "#000" }]}>
                            {ad.description}
                        </Text>
                    )}

                    <Pressable
                        style={[styles.popupCta, { backgroundColor: ad.accent_color || "#0B6EFE" }]}
                        onPress={handlePress}
                    >
                        <Text style={styles.popupCtaText}>{ad.cta_text || "Shop Now"}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

// Story Ad - Full width vertical card
export const AdStory = ({ ad, onClose }) => {
    const { trackImpression, trackClick } = useAds();

    useEffect(() => {
        if (ad) {
            trackImpression(ad.id);
        }
    }, [ad]);

    if (!ad) return null;

    const handlePress = async () => {
        trackClick(ad.id);
        if (ad.cta_url) {
            try {
                await Linking.openURL(ad.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    return (
        <Pressable
            style={[
                styles.storyContainer,
                {
                    backgroundColor: ad.background_color || "#FFFFFF",
                    borderRadius: ad.border_radius || 12,
                },
            ]}
            onPress={handlePress}
        >
            <Image source={{ uri: ad.image_url }} style={styles.storyImage} />
            <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.7)"]}
                style={styles.storyGradient}
            />
            <View style={styles.storyContent}>
                {ad.discount_badge && (
                    <View
                        style={[
                            styles.storyBadge,
                            { backgroundColor: ad.discount_color || "#FF6B6B" },
                        ]}
                    >
                        <Text style={styles.storyBadgeText}>{ad.discount_badge}</Text>
                    </View>
                )}
                <Text style={styles.storyTitle}>{ad.title}</Text>
                {ad.description && (
                    <Text style={styles.storyDescription}>{ad.description}</Text>
                )}
                <View style={[styles.storyCta, { backgroundColor: ad.accent_color || "#0B6EFE" }]}>
                    <Text style={styles.storyCtaText}>{ad.cta_text || "Shop Now"}</Text>
                </View>
            </View>
            {onClose && (
                <Pressable style={styles.storyClose} onPress={onClose}>
                    <Ionicons name="close" size={20} color="#fff" />
                </Pressable>
            )}
        </Pressable>
    );
};

// Fullscreen Ad - Takes entire screen
export const AdFullscreen = ({ ad, onClose }) => {
    const { trackImpression, trackClick } = useAds();

    useEffect(() => {
        if (ad) {
            trackImpression(ad.id);
        }
    }, [ad]);

    if (!ad) return null;

    const handlePress = async () => {
        trackClick(ad.id);
        if (ad.cta_url) {
            try {
                await Linking.openURL(ad.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    return (
        <View style={styles.fullscreenContainer}>
            <Image source={{ uri: ad.image_url }} style={styles.fullscreenImage} />
            <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.8)"]}
                style={styles.fullscreenGradient}
            />

            <Pressable style={styles.fullscreenClose} onPress={onClose}>
                <Ionicons name="close-circle" size={32} color="#fff" />
            </Pressable>

            <View style={styles.fullscreenContent}>
                {ad.discount_badge && (
                    <View
                        style={[
                            styles.fullscreenBadge,
                            { backgroundColor: ad.discount_color || "#FF6B6B" },
                        ]}
                    >
                        <Text style={styles.fullscreenBadgeText}>{ad.discount_badge}</Text>
                    </View>
                )}

                <Text style={styles.fullscreenTitle}>{ad.title}</Text>

                {ad.description && (
                    <Text style={styles.fullscreenDescription}>{ad.description}</Text>
                )}

                <Pressable
                    style={[styles.fullscreenCta, { backgroundColor: ad.accent_color || "#0B6EFE" }]}
                    onPress={handlePress}
                >
                    <Text style={styles.fullscreenCtaText}>{ad.cta_text || "Shop Now"}</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                </Pressable>
            </View>
        </View>
    );
};

// Sticky Footer Ad - Fixed at bottom
export const AdStickyFooter = ({ ad, onClose }) => {
    const { trackImpression, trackClick } = useAds();

    useEffect(() => {
        if (ad) {
            trackImpression(ad.id);
        }
    }, [ad]);

    if (!ad) return null;

    const handlePress = async () => {
        trackClick(ad.id);
        if (ad.cta_url) {
            try {
                await Linking.openURL(ad.cta_url);
            } catch (error) {
                console.error("Error opening URL:", error);
            }
        }
    };

    return (
        <View
            style={[
                styles.stickyFooterContainer,
                { backgroundColor: ad.background_color || "#FFFFFF" },
            ]}
        >
            <Pressable style={styles.stickyFooterClose} onPress={onClose}>
                <Ionicons name="close" size={18} color={ad.text_color || "#000"} />
            </Pressable>

            <Image source={{ uri: ad.image_url }} style={styles.stickyFooterImage} />

            <View style={styles.stickyFooterContent}>
                <View>
                    {ad.discount_badge && (
                        <View
                            style={[
                                styles.stickyFooterBadge,
                                { backgroundColor: ad.discount_color || "#FF6B6B" },
                            ]}
                        >
                            <Text style={styles.stickyFooterBadgeText}>{ad.discount_badge}</Text>
                        </View>
                    )}
                    <Text
                        style={[styles.stickyFooterTitle, { color: ad.text_color || "#000" }]}
                        numberOfLines={1}
                    >
                        {ad.title}
                    </Text>
                </View>

                <Pressable
                    style={[styles.stickyFooterCta, { backgroundColor: ad.accent_color || "#0B6EFE" }]}
                    onPress={handlePress}
                >
                    <Text style={styles.stickyFooterCtaText}>{ad.cta_text || "Shop"}</Text>
                </Pressable>
            </View>
        </View>
    );
};

// Smart AdRenderer - Picks the right component based on ad.style
export const AdRenderer = ({ ad, ads, onClose, visible = true }) => {
    if (!ad && (!ads || ads.length === 0)) return null;

    // If multiple ads provided, use carousel or pick first
    if (ads && ads.length > 0) {
        const firstAd = ads[0];
        const style = firstAd?.style || "carousel";

        if (ads.length > 1 || style === "carousel") {
            return <AdCarousel ads={ads} />;
        }
        // Single ad, use the style from that ad
        return <AdRenderer ad={firstAd} onClose={onClose} visible={visible} />;
    }

    // Single ad rendering based on style
    const style = ad?.style || "banner";

    switch (style) {
        case "banner":
            return <AdBanner ad={ad} onClose={onClose} />;
        case "card":
            return <AdCard ad={ad} />;
        case "popup":
            return <AdPopup ad={ad} onClose={onClose} visible={visible} />;
        case "carousel":
            return <AdCarousel ads={[ad]} />;
        case "story":
            return <AdStory ad={ad} onClose={onClose} />;
        case "fullscreen":
            return <AdFullscreen ad={ad} onClose={onClose} />;
        case "sticky_footer":
            return <AdStickyFooter ad={ad} onClose={onClose} />;
        case "sidebar":
            // Sidebar uses card style
            return <AdCard ad={ad} />;
        default:
            return <AdBanner ad={ad} onClose={onClose} />;
    }
};

const styles = StyleSheet.create({
    // Banner styles
    bannerContainer: {
        marginHorizontal: 16,
        marginVertical: 12,
        padding: 16,
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    closeButton: {
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
        padding: 4,
    },
    bannerImage: {
        width: "100%",
        height: 120,
        borderRadius: 8,
        marginBottom: 12,
    },
    bannerContent: {
        gap: 8,
    },
    bannerTitle: {
        fontSize: 16,
        fontWeight: "700",
    },
    bannerDescription: {
        fontSize: 12,
        opacity: 0.8,
    },
    discountBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    discountText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    ctaButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    ctaText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 13,
    },

    // Card styles
    card: {
        marginHorizontal: 16,
        marginVertical: 12,
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    cardImage: {
        width: "100%",
        height: 160,
    },
    cardContent: {
        padding: 12,
        gap: 8,
    },
    cardBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    cardBadgeText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: "700",
    },
    cardDescription: {
        fontSize: 11,
        opacity: 0.7,
    },
    cardCta: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        alignItems: "center",
        marginTop: 4,
    },
    cardCtaText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 12,
    },

    // Carousel styles
    carouselContainer: {
        marginHorizontal: 16,
        marginVertical: 12,
        gap: 12,
    },
    carouselSlide: {
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    carouselImage: {
        width: "100%",
        height: 180,
    },
    carouselContent: {
        padding: 16,
        gap: 10,
    },
    carouselBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    carouselBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    carouselTitle: {
        fontSize: 16,
        fontWeight: "700",
    },
    carouselDescription: {
        fontSize: 12,
        opacity: 0.8,
    },
    carouselCta: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: "center",
        marginTop: 6,
    },
    carouselCtaText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 13,
    },
    carouselDots: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },

    // Popup styles
    popupOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
    },
    popupContainer: {
        width: width - 48,
        maxWidth: 360,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    popupClose: {
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
    },
    popupImage: {
        width: "100%",
        height: 180,
    },
    popupContent: {
        padding: 20,
        gap: 12,
    },
    popupBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    popupBadgeText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
    },
    popupTitle: {
        fontSize: 20,
        fontWeight: "700",
    },
    popupDescription: {
        fontSize: 14,
        opacity: 0.8,
    },
    popupCta: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        borderRadius: 10,
        gap: 8,
        marginTop: 8,
    },
    popupCtaText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 15,
    },

    // Story styles
    storyContainer: {
        marginHorizontal: 16,
        marginVertical: 12,
        height: 280,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 5,
    },
    storyImage: {
        width: "100%",
        height: "100%",
        position: "absolute",
    },
    storyGradient: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "60%",
    },
    storyContent: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        gap: 8,
    },
    storyBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    storyBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    storyTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#fff",
    },
    storyDescription: {
        fontSize: 13,
        color: "#fff",
        opacity: 0.9,
    },
    storyCta: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    storyCtaText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 13,
    },
    storyClose: {
        position: "absolute",
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
    },

    // Fullscreen styles
    fullscreenContainer: {
        flex: 1,
        backgroundColor: "#000",
    },
    fullscreenImage: {
        width: "100%",
        height: "100%",
        position: "absolute",
    },
    fullscreenGradient: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "50%",
    },
    fullscreenClose: {
        position: "absolute",
        top: 50,
        right: 20,
        zIndex: 10,
    },
    fullscreenContent: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 24,
        paddingBottom: 40,
        gap: 12,
    },
    fullscreenBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    fullscreenBadgeText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    fullscreenTitle: {
        fontSize: 28,
        fontWeight: "700",
        color: "#fff",
    },
    fullscreenDescription: {
        fontSize: 16,
        color: "#fff",
        opacity: 0.9,
    },
    fullscreenCta: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        borderRadius: 12,
        gap: 10,
        marginTop: 12,
    },
    fullscreenCtaText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 17,
    },

    // Sticky Footer styles
    stickyFooterContainer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        paddingLeft: 8,
        gap: 10,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
        elevation: 8,
    },
    stickyFooterClose: {
        position: "absolute",
        top: -10,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "#f0f0f0",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    stickyFooterImage: {
        width: 50,
        height: 50,
        borderRadius: 8,
    },
    stickyFooterContent: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    stickyFooterBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: "flex-start",
        marginBottom: 2,
    },
    stickyFooterBadgeText: {
        color: "#fff",
        fontSize: 9,
        fontWeight: "700",
    },
    stickyFooterTitle: {
        fontSize: 13,
        fontWeight: "600",
    },
    stickyFooterCta: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    stickyFooterCtaText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 12,
    },
});
