import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useShop } from '../context/ShopContext';
import { colors } from '../theme/colors';

export const StatusRow = ({ onSelectStatus }) => {
    const { followedSellers } = useShop();
    const [activeStatuses, setActiveStatuses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActiveStatuses();
    }, [followedSellers]);

    const fetchActiveStatuses = async () => {
        try {
            if (followedSellers.length === 0) {
                setActiveStatuses([]);
                setLoading(false);
                return;
            }

            // Fetch latest status for each followed seller
            const { data, error } = await supabase
                .from('express_seller_statuses')
                .select(`
          *,
          seller:express_sellers(id, name, avatar)
        `)
                .in('seller_id', followedSellers)
                .eq('is_active', true)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });

            if (!error && data) {
                // Group by seller to show unique seller circles
                const uniqueSellers = [];
                const seenSellers = new Set();

                data.forEach(item => {
                    if (!seenSellers.has(item.seller_id)) {
                        seenSellers.add(item.seller_id);
                        uniqueSellers.push(item);
                    }
                });

                setActiveStatuses(uniqueSellers);
            }
        } catch (err) {
            console.error('Error fetching active statuses:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || activeStatuses.length === 0) return null;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Updates from Stores</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {activeStatuses.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        style={styles.statusItem}
                        onPress={() => {
                            if (typeof onSelectStatus === 'function') {
                                onSelectStatus(item);
                            }
                        }}
                    >
                        <View style={styles.avatarContainer}>
                            <Image
                                source={{ uri: item.seller.avatar }}
                                style={styles.avatar}
                            />
                            <View style={styles.indicator} />
                        </View>
                        <Text style={styles.sellerName} numberOfLines={1}>
                            {item.seller.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.dark,
        marginHorizontal: 16,
        marginBottom: 12,
    },
    scrollContent: {
        paddingHorizontal: 12,
    },
    statusItem: {
        alignItems: 'center',
        width: 80,
        gap: 6,
    },
    avatarContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderColor: colors.primary,
        padding: 2,
        position: 'relative',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
        backgroundColor: colors.light,
    },
    indicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: '#fff',
    },
    sellerName: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.muted,
        textAlign: 'center',
    },
});
