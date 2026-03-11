import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SuperAdminService } from '../services/api';
import type { FinanceSummary } from '../types';

/**
 * 财务汇总实时同步 Hook
 * 监听 orders 表的变化，并在有订单完成或更新时自动刷新财务数据
 */
export const useFinanceSummary = () => {
    const [summary, setSummary] = useState<FinanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            // 统一调用 SuperAdminService 并映射字段
            const data = await SuperAdminService.getFinanceSummary('month');
            setSummary({
                daily: data.todayRevenue,
                monthly: data.periodRevenue,
                showFinance: true // 默认显示，或从 system_config 读取
            });
            setError(null);
        } catch (err: any) {
            console.error('[useFinanceSummary] Failed to fetch finance summary:', err);
            setError(err.message || 'Failed to fetch financial data');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        // 初始加载
        fetchSummary(true);

        // 订阅 Supabase Realtime 监听 orders 表的变化
        const channel = supabase
            .channel('finance-summary-sync')
            .on(
                'postgres_changes',
                {
                    event: '*', // 监听所有事件（插入、更新、删除）
                    schema: 'public',
                    table: 'orders'
                },
                (payload) => {
                    // 只要有任何订单相关的变化，我们就刷新财务汇总
                    // 后续可以根据 payload.new.status === 'completed' 进行更精细的判断以减少请求
                    console.log('[useFinanceSummary] Order change detected, refreshing...', payload.eventType);
                    fetchSummary(false);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[useFinanceSummary] Subscribed to real-time order changes');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchSummary]);

    return { summary, loading, error, refresh: fetchSummary };
};
