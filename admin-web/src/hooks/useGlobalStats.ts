import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SuperAdminService } from '../services/api';

export interface GlobalStats {
    todayRevenue: number;
    todayOrdersCount: number;
    totalUnpaidBalance: number;
}

/**
 * Global Real-time Stats Hook for Page Header and Widgets
 */
export const useGlobalStats = () => {
    const [stats, setStats] = useState<GlobalStats>({
        todayRevenue: 0,
        todayOrdersCount: 0,
        totalUnpaidBalance: 0
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            // Fetch financial stats
            const finance = await SuperAdminService.getFinanceSummary('today');

            setStats({
                todayRevenue: finance.todayRevenue || 0,
                todayOrdersCount: finance.todayOrders || 0,
                totalUnpaidBalance: finance.totalUnpaidBalance || 0
            });
        } catch (error) {
            console.error('[useGlobalStats] Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();

        // Subscribe to changes that affect these numbers
        const channel = supabase
            .channel('global-stats-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchStats();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
                // Only refresh if it's a driver change
                if ((payload.new as any)?.role === 'driver' || (payload.old as any)?.role === 'driver') {
                    fetchStats();
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchStats]);

    return { stats, loading, refresh: fetchStats };
};
