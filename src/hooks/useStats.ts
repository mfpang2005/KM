import { useState, useEffect, useCallback } from 'react';
import { SuperAdminService } from '../services/api';
import { StatsOverview } from '../../types';
import { supabase } from '../lib/supabase';

/**
 * 仪表盘核心统计 Hook
 * - 定期刷新关键指标 (订单总数、营收、用户数)
 * - 监听 orders 表变更以实现近实时更新
 */
export function useStats() {
    const [stats, setStats] = useState<StatsOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const data = await SuperAdminService.getStats();
            setStats(data);
            setError(null);
        } catch (err: any) {
            console.error('[useStats] Failed to fetch stats:', err);
            setError(err.message || 'Failed to load stats');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats(true);

        // 订阅实时变更
        const channel = supabase
            .channel('dashboard-stats-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    console.log('[useStats] Orders changed, refreshing dashboard stats...');
                    fetchStats(false);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchStats]);

    return { stats, loading, error, refresh: () => fetchStats(true) };
}
