import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';

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
 * 财务统计 Hook，供前端 Admin 首页使用。
 * - 初始化时从 /api/orders/finance-summary 加载数据
 * - 通过 Supabase Realtime 监听 orders 表，当有订单状态变为 completed 时自动刷新
 */
export function useFinanceSummary(): FinanceSummary {
    const [daily, setDaily] = useState(0);
    const [monthly, setMonthly] = useState(0);
    const [monthlyGoal, setMonthlyGoal] = useState(0);
    const [showFinance, setShowFinance] = useState(true);
    const [dailyOrderCount, setDailyOrderCount] = useState(0);
    const [pendingAmount, setPendingAmount] = useState(0);
    const [todayOrders, setTodayOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSummary = useCallback(async () => {
        try {
            const response = await api.get('/orders/finance-summary');
            const data = response.data;
            setDaily(data.daily ?? 0);
            setMonthly(data.monthly ?? 0);
            setMonthlyGoal(data.monthlyGoal ?? 0);
            setShowFinance(data.showFinance ?? true);
            setDailyOrderCount(data.dailyOrderCount ?? 0);
            setPendingAmount(data.pendingAmount ?? 0);
            setTodayOrders(data.todayOrders ?? []);
        } catch (err) {
            console.error('[useFinanceSummary] Failed to fetch summary:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSummary();

        // NOTE: 订阅 orders 表变更，任何订单更新（包括状态或收款情况变动）时实时刷新财务数字
        const channel = supabase
            .channel('finance-summary-realtime')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders' },
                () => {
                    // Update on any changes to orders to reflect payment confirmations instantly
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
