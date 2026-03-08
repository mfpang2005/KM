import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SuperAdminService } from '../services/api';

export interface GlobalStats {
    todayRevenue: number;
    todayOrdersCount: number;
    totalUnpaid: number;
}

/**
 * Global Real-time Stats Hook for Page Header and Widgets
 */
export const useGlobalStats = () => {
    const [stats, setStats] = useState<GlobalStats>({
        todayRevenue: 0,
        todayOrdersCount: 0,
        totalUnpaid: 0
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            // Fetch financial stats
            const finance = await SuperAdminService.getFinanceSummary('today');

            // Fetch total unpaid amount (all time or filtered by relevant criteria if needed)
            // For now, let's get all 'unpaid' orders total
            const { data: unpaidOrders } = await supabase
                .from('orders')
                .select('amount')
                .not('paymentStatus', 'eq', 'paid');

            const totalUnpaid = (unpaidOrders || []).reduce((acc, curr) => acc + (curr.amount || 0), 0);

            setStats({
                todayRevenue: finance.todayRevenue || 0,
                todayOrdersCount: finance.todayOrderCount || 0,
                totalUnpaid: totalUnpaid
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
