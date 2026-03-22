import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SuperAdminService } from '../services/api';

export interface FinanceSummary {
    daily: number;
    monthly: number;
    monthlyGoal: number;
    showFinance: boolean;
    loading: boolean;
    dailyOrderCount: number;
    pendingAmount: number;
    todayOrders: any[];
}

/**
 * 财务统计 Hook (联动版)
 * - 使用 SuperAdminService 获取核心财务数据
 * - 监听 orders 变更实时刷新
 */
export function useFinanceSummary(): FinanceSummary {
    const [daily, setDaily] = useState(0);
    const [monthly, setMonthly] = useState(0);
    const [monthlyGoal] = useState(0); // 暂不可用
    const [showFinance] = useState(true);
    const [dailyOrderCount, setDailyOrderCount] = useState(0);
    const [pendingAmount, setPendingAmount] = useState(0);
    const [todayOrders, setTodayOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSummary = useCallback(async () => {
        try {
            // 获取本月汇总数据
            const data = await SuperAdminService.getFinanceSummary('month');
            
            setDaily(data.todayRevenue ?? 0);
            setMonthly(data.periodRevenue ?? 0);
            setDailyOrderCount(data.todayOrders ?? 0);
            setPendingAmount(data.totalUnpaidBalance ?? 0);
            
            // 获取最新订单作为 Ledger 明细
            const stats = await SuperAdminService.getStats();
            setTodayOrders(stats.recent_orders || []);
            
        } catch (err) {
            console.error('[useFinanceSummary] Linkage failed, falling back to basic fetching...', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSummary();

        const channel = supabase
            .channel('finance-unified-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    console.log('[useFinanceSummary] Data changed, refreshing...');
                    fetchSummary();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchSummary]);

    return {
        daily,
        monthly,
        monthlyGoal,
        showFinance,
        loading,
        dailyOrderCount,
        pendingAmount,
        todayOrders
    };
}
