import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const { width, height } = Dimensions.get('window');

export const CustomerLoadingAnimation = () => {
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const cartBounce = useRef(new Animated.Value(0)).current;
    const itemsFloat = useRef(new Animated.Value(0)).current;
    const sparkleAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Initial entrance
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 6,
                tension: 100,
                useNativeDriver: true,
            }),
        ]).start();

        // Cart bouncing animation
        const cartAnimation = Animated.loop(
            Animated.sequence([
                Animated.spring(cartBounce, {
                    toValue: 1,
                    friction: 4,
                    tension: 150,
                    useNativeDriver: true,
                }),
                Animated.spring(cartBounce, {
                    toValue: 0,
                    friction: 4,
                    tension: 150,
                    useNativeDriver: true,
                }),
            ])
        );

        // Floating items animation
        const floatingAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(itemsFloat, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(itemsFloat, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        );

        // Sparkle animation
        const sparkleAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(sparkleAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(sparkleAnim, {
                    toValue: 0,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );

        cartAnimation.start();
        floatingAnimation.start();
        sparkleAnimation.start();

        return () => {
            cartAnimation.stop();
            floatingAnimation.stop();
            sparkleAnimation.stop();
        };
    }, []);

    const floatingItems = [
        { icon: 'shirt-outline', color: colors.primary },
        { icon: 'phone-portrait-outline', color: colors.secondary },
        { icon: 'headset-outline', color: colors.accent },
        { icon: 'laptop-outline', color: colors.success },
        { icon: 'watch-outline', color: colors.warning },
    ];

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar style="light" />
            {/* Floating Product Icons */}
            <View style={styles.floatingItemsContainer}>
                {floatingItems.map((item, index) => (
                    <Animated.View
                        key={index}
                        style={[
                            styles.floatingItem,
                            {
                                opacity: fadeAnim,
                                transform: [
                                    {
                                        translateY: itemsFloat.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, -10 - (index * 5)],
                                        }),
                                    },
                                    {
                                        rotate: itemsFloat.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0deg', `${5 - index * 2}deg`],
                                        }),
                                    },
                                ],
                            },
                            styles[`floatingItem${index + 1}`],
                        ]}
                    >
                        <Ionicons name={item.icon} size={24} color={item.color} />
                    </Animated.View>
                ))}
            </View>

            {/* Main Loading Content */}
            <Animated.View
                style={[
                    styles.loadingContent,
                    {
                        opacity: fadeAnim,
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                {/* Main Cart Icon */}
                <View style={styles.cartContainer}>
                    <Animated.View
                        style={[
                            styles.cartBackground,
                            {
                                transform: [
                                    {
                                        translateY: cartBounce.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, -8],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    />
                    <Animated.View
                        style={[
                            styles.cartIcon,
                            {
                                transform: [
                                    {
                                        translateY: cartBounce.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, -8],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <Ionicons name="bag-handle" size={50} color={colors.primary} />
                    </Animated.View>
                </View>

                {/* Sparkles */}
                <View style={styles.sparklesContainer}>
                    {[...Array(6)].map((_, i) => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.sparkle,
                                {
                                    opacity: sparkleAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, 1],
                                    }),
                                    transform: [
                                        {
                                            scale: sparkleAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0, 1],
                                            }),
                                        },
                                        {
                                            rotate: sparkleAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0deg', '180deg'],
                                            }),
                                        },
                                    ],
                                },
                                styles[`sparkle${i + 1}`],
                            ]}
                        >
                            <Ionicons name="star" size={12} color={colors.accent} />
                        </Animated.View>
                    ))}
                </View>

                {/* App Title */}
                <Text style={styles.appTitle}>ExpressMart</Text>
                <Text style={styles.subtitle}>Your shopping destination</Text>

                {/* Loading Progress */}
                <View style={styles.progressContainer}>
                    <Animated.View
                        style={[
                            styles.progressDot,
                            {
                                opacity: fadeAnim,
                            },
                        ]}
                    />
                </View>

                <Text style={styles.loadingText}>Preparing your marketplace...</Text>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.light,
        justifyContent: 'center',
        alignItems: 'center',
    },
    floatingItemsContainer: {
        position: 'absolute',
        width: width,
        height: height,
    },
    floatingItem: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: colors.dark,
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 3,
    },
    floatingItem1: {
        top: '20%',
        left: '15%',
    },
    floatingItem2: {
        top: '25%',
        right: '20%',
    },
    floatingItem3: {
        top: '70%',
        left: '10%',
    },
    floatingItem4: {
        top: '75%',
        right: '15%',
    },
    floatingItem5: {
        top: '45%',
        right: '10%',
    },
    loadingContent: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    cartContainer: {
        position: 'relative',
        marginBottom: 32,
    },
    cartBackground: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: colors.surface,
        shadowColor: colors.primary,
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
        elevation: 10,
    },
    cartIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sparklesContainer: {
        position: 'absolute',
        width: 200,
        height: 200,
        top: '35%',
    },
    sparkle: {
        position: 'absolute',
    },
    sparkle1: {
        top: 20,
        left: 30,
    },
    sparkle2: {
        top: 40,
        right: 25,
    },
    sparkle3: {
        top: 80,
        left: 20,
    },
    sparkle4: {
        top: 120,
        right: 30,
    },
    sparkle5: {
        top: 60,
        left: 80,
    },
    sparkle6: {
        top: 100,
        right: 80,
    },
    appTitle: {
        fontSize: 34,
        fontWeight: '800',
        color: colors.dark,
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: colors.muted,
        marginBottom: 40,
        textAlign: 'center',
        fontWeight: '500',
    },
    progressContainer: {
        width: 60,
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        marginBottom: 24,
        overflow: 'hidden',
        position: 'relative',
    },
    progressDot: {
        width: 20,
        height: 4,
        backgroundColor: colors.primary,
        borderRadius: 2,
        position: 'absolute',
    },
    loadingText: {
        fontSize: 14,
        color: colors.muted,
        textAlign: 'center',
        fontWeight: '500',
    },
});