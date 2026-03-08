
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../src/lib/supabase';
import { api } from '../src/services/api';
import PullToRefresh from '../src/components/PullToRefresh';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
    id: string;
    customerName: string;
    customerPhone: string;
    amount: number;
    status: string;
    paymentMethod: string;
    paymentStatus: string; // 'paid' | 'unpaid'
    created_at: string;
    dueTime: string;
    items?: { name: string; quantity: number }[];
}

interface FinanceSummary {
    daily: number;
    monthly: number;
    monthlyGoal: number;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

const PM_LABELS: Record<string, string> = {
    cash: 'CASH',
    bank_transfer: 'BANK TRF',
    ewallet: 'E-WALLET',
    cheque: 'CHEQUE',
};

const VALID_STATUSES = ['ready', 'delivering', 'completed'];

// ─── Component ────────────────────────────────────────────────────────────────

const AccountManagement: React.FC = () => {
    const [summary, setSummary] = useState<FinanceSummary>({ daily: 0, monthly: 0, monthlyGoal: 0 });
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState<'today' | 'month' | 'all'>('today');
    const [paidFilter, setPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [toggling, setToggling] = useState<string | null>(null);

    // ── Fetch summary KPIs
    const fetchSummary = useCallback(async () => {
        try {
            const res = await api.get('/orders/finance-summary');
            setSummary({
                daily: res.data.daily ?? 0,
                monthly: res.data.monthly ?? 0,
                monthlyGoal: res.data.monthlyGoal ?? 0,
            });
        } catch (err) {
            console.error('[AccountManagement] fetchSummary failed:', err);
        }
    }, []);

    // ── Fetch orders with Account-relevant statuses
    const fetchOrders = useCallback(async () => {
        try {
            const res = await api.get('/orders');
            const all: Order[] = Array.isArray(res.data) ? res.data : [];

            // NOTE: 仅显示进入配送/完成阶段的有效订单，过滤出财务统计范围内的数据
            const relevant = all.filter(o => VALID_STATUSES.includes((o.status || '').toLowerCase()));
            setOrders(relevant);
        } catch (err) {
            console.error('[AccountManagement] fetchOrders failed:', err);
        }
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchSummary(), fetchOrders()]);
        setLoading(false);
    }, [fetchSummary, fetchOrders]);

    useEffect(() => {
        loadAll();

        // NOTE: Supabase Realtime —— 任何订单变更时自动刷新，实现 <1s 状态联动
        const channel = supabase
            .channel('account-mgmt-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchOrders();
                fetchSummary();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [loadAll, fetchOrders, fetchSummary]);

    // ── Toggle payment status
    const handleTogglePaid = async (order: Order) => {
        if (toggling) return;
        setToggling(order.id);
        const newStatus = order.paymentStatus === 'paid' ? 'unpaid' : 'paid';
        try {
            await api.patch(`/orders/${order.id}`, { paymentStatus: newStatus });
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, paymentStatus: newStatus } : o));
            await fetchSummary();
        } catch (err) {
            console.error('[AccountManagement] togglePaid failed:', err);
        } finally {
            setToggling(null);
        }
    };

    // ── Filtered order list
    const filteredOrders = useMemo(() => {
        const now = new Date();
        const todayStr = now.toDateString();

        return orders.filter(o => {
            let isToday = false;
            try {
                if (o.dueTime && o.dueTime.includes('T')) {
                    isToday = new Date(o.dueTime).toDateString() === todayStr;
                } else {
                    isToday = new Date(o.created_at).toDateString() === todayStr;
                }
            } catch (e) {
                isToday = new Date(o.created_at).toDateString() === todayStr;
            }

            // Date filter
            if (dateFilter === 'today') {
                if (!isToday) return false;
            } else if (dateFilter === 'month') {
                const d = o.dueTime && o.dueTime.includes('T') ? new Date(o.dueTime) : new Date(o.created_at);
                if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
            }

            // Paid filter
            if (paidFilter === 'paid' && o.paymentStatus !== 'paid') return false;
            if (paidFilter === 'unpaid' && o.paymentStatus === 'paid') return false;

            return true;
        });
    }, [orders, dateFilter, paidFilter]);

    // ── Daily sales metrics derived from today's orders
    const todayOrders = useMemo(() => orders.filter(o => {
        const todayStr = new Date().toDateString();
        try {
            if (o.dueTime && o.dueTime.includes('T')) {
                return new Date(o.dueTime).toDateString() === todayStr;
            }
            return new Date(o.created_at).toDateString() === todayStr;
        } catch (e) {
            return new Date(o.created_at).toDateString() === todayStr;
        }
    }), [orders]);

    const todayPaidCount = useMemo(() => todayOrders.filter(o => o.paymentStatus === 'paid').length, [todayOrders]);
    const todayUnpaidCount = useMemo(() => todayOrders.filter(o => o.paymentStatus !== 'paid').length, [todayOrders]);
    const collectionRate = todayOrders.length > 0 ? (todayPaidCount / todayOrders.length) * 100 : 0;

    // TODAY REVENUE: delivery_date 为今日且已支付
    const todayRevenue = todayOrders.filter(o => o.paymentStatus === 'paid').reduce((acc, o) => acc + (o.amount || 0), 0);
    // PENDING: delivery_date 为今日且未支付
    const todayPending = todayOrders.filter(o => o.paymentStatus !== 'paid').reduce((acc, o) => acc + (o.amount || 0), 0);

    const goalPct = summary.monthlyGoal > 0 ? Math.min((summary.monthly / summary.monthlyGoal) * 100, 100) : 0;

    return (
        <div className="flex flex-col min-h-full" style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

            {/* ── HERO HEADER ──────────────────────────── */}
            <div className="relative pt-14 pb-6 px-5 overflow-hidden no-print">
                {/* Ambient glow */}
                <div className="absolute -top-20 -left-20 w-72 h-72 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -right-10 w-56 h-56 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10">
                    <p className="text-[9px] font-black text-indigo-400 tracking-[0.4em] uppercase mb-1">Kim Long Catering</p>
                    <h1 className="text-2xl font-black text-white tracking-tight">Account Management</h1>
                    <p className="text-slate-400 text-xs mt-0.5">
                        {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                    </p>
                </div>
            </div>

            <PullToRefresh onRefresh={loadAll}>
                <div className="px-4 pb-28 space-y-5">

                    {/* ── GLASSMORPHISM KPI CARDS ──────────── */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Today Total — full-width */}
                        <div
                            className="col-span-2 relative rounded-[32px] overflow-hidden p-8"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                backdropFilter: 'blur(30px)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                            }}
                        >
                            {/* Decorative elements */}
                            <div className="absolute -right-10 -top-10 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />
                            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl" />

                            <p className="text-[10px] font-black text-indigo-400 tracking-[0.5em] uppercase mb-4 text-center">Today Total</p>
                            {loading ? (
                                <div className="h-16 w-full bg-white/5 animate-pulse rounded-2xl mb-8" />
                            ) : (
                                <div className="text-center mb-8">
                                    <span className="text-6xl font-mono font-black text-white tracking-tighter drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] leading-none italic" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        RM {(todayRevenue + todayPending).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-2 pt-6 border-t border-white/5">
                                <div className="text-center">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Order Count</p>
                                    <p className="text-xl font-black text-white">{todayOrders.length}</p>
                                </div>
                                <div className="text-center border-x border-white/5">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">已收 (RM)</p>
                                    <p className="text-xl font-mono font-black text-[#10b981]">{todayRevenue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">待收 (RM)</p>
                                    <p className="text-xl font-mono font-black text-[#ef4444]">{todayPending.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        </div>

                        {/* Monthly KPI */}
                        <div
                            className="relative rounded-[28px] p-6 overflow-hidden"
                            style={{
                                background: 'rgba(99,102,241,0.1)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid rgba(99,102,241,0.2)',
                            }}
                        >
                            <p className="text-[9px] font-black text-indigo-300 tracking-[0.3em] uppercase mb-2">Monthly</p>
                            <p className="text-2xl font-mono font-black text-white">RM {summary.monthly.toLocaleString('en-MY', { minimumFractionDigits: 0 })}</p>
                            <p className="text-[9px] text-indigo-400/60 mt-2 font-bold uppercase tracking-tighter">本月累计已收</p>
                        </div>

                        {/* Collection Rate */}
                        <div
                            className="relative rounded-[28px] p-6 overflow-hidden"
                            style={{
                                background: 'rgba(16,185,129,0.08)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid rgba(16,185,129,0.15)',
                            }}
                        >
                            <p className="text-[9px] font-black text-emerald-300 tracking-[0.3em] uppercase mb-2">Collection</p>
                            <p className="text-2xl font-mono font-black text-white">{collectionRate.toFixed(0)}<span className="text-sm ml-0.5">%</span></p>
                            <p className="text-[9px] text-emerald-400/60 mt-2 font-bold uppercase tracking-tighter">{todayPaidCount}/{todayOrders.length} 订单已结清</p>
                        </div>
                    </div>

                    {/* ── MONTHLY GOAL PROGRESS ─────────────── */}
                    {summary.monthlyGoal > 0 && (
                        <div
                            className="rounded-[28px] p-6"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">月度回笼进度</p>
                                <span className="text-xs font-black text-indigo-400">{goalPct.toFixed(1)}%</span>
                            </div>
                            <div className="h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                                <div
                                    className="h-full rounded-full transition-all duration-1000 relative"
                                    style={{
                                        width: `${goalPct}%`,
                                        background: goalPct >= 100
                                            ? 'linear-gradient(90deg, #10b981, #059669)'
                                            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                        boxShadow: '0 0 20px rgba(99,102,241,0.3)'
                                    }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── FILTER TABS ───────────────────────── */}
                    <div className="space-y-2">
                        <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            {(['today', 'month', 'all'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setDateFilter(t)}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${dateFilter === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-500'}`}
                                >
                                    {t === 'today' ? '今日' : t === 'month' ? '本月' : '全部'}
                                </button>
                            ))}
                        </div>
                        <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            {(['all', 'paid', 'unpaid'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setPaidFilter(s)}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${paidFilter === s
                                        ? s === 'paid' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'
                                            : s === 'unpaid' ? 'bg-red-600 text-white shadow-lg shadow-red-900/50'
                                                : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                                        : 'text-slate-500'
                                        }`}
                                >
                                    {s === 'all' ? '全部' : s === 'paid' ? '✓ 已收' : '✗ 未收'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── ORDER CARD STREAM ─────────────────── */}
                    <div className="space-y-3">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-1">
                            对账单 ({filteredOrders.length} 笔)
                        </p>

                        {loading ? (
                            [1, 2, 3].map(i => (
                                <div key={i} className="rounded-[24px] p-5 animate-pulse" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div className="h-4 w-32 bg-white/10 rounded-lg mb-2" />
                                    <div className="h-3 w-20 bg-white/5 rounded-lg" />
                                </div>
                            ))
                        ) : filteredOrders.length === 0 ? (
                            <div className="flex flex-col items-center py-16 text-slate-600">
                                <span className="material-icons-round text-5xl mb-2">receipt_long</span>
                                <p className="text-sm font-bold">暂无符合条件的订单</p>
                            </div>
                        ) : (
                            filteredOrders.map(order => (
                                <div
                                    key={order.id}
                                    className="relative rounded-[24px] overflow-hidden transition-all duration-300"
                                    style={{
                                        background: order.paymentStatus === 'paid'
                                            ? 'rgba(16,185,129,0.08)'
                                            : 'rgba(239,68,68,0.07)',
                                        border: order.paymentStatus === 'paid'
                                            ? '1px solid rgba(16,185,129,0.2)'
                                            : '1px solid rgba(239,68,68,0.18)',
                                    }}
                                >
                                    {/* Left status bar */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-1 transition-colors duration-500"
                                        style={{ background: order.paymentStatus === 'paid' ? '#10b981' : '#ef4444' }}
                                    />

                                    <div className="pl-5 pr-4 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="text-[10px] font-mono font-bold text-slate-500">{order.id}</p>
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase ${order.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-violet-500/20 text-violet-400'}`}>
                                                        {order.status}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-black text-white truncate">{order.customerName}</p>
                                                <p className="text-[9px] text-slate-500 mt-0.5">
                                                    {PM_LABELS[order.paymentMethod] || order.paymentMethod || '-'} &nbsp;·&nbsp;
                                                    {order.created_at ? new Date(order.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </p>
                                            </div>

                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <span className="text-lg font-mono font-black text-white">RM {(order.amount || 0).toFixed(2)}</span>

                                                {/* Payment Toggle */}
                                                <button
                                                    onClick={() => handleTogglePaid(order)}
                                                    disabled={toggling === order.id}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg ${order.paymentStatus === 'paid'
                                                        ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                                                        : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'
                                                        } ${toggling === order.id ? 'opacity-50 pointer-events-none' : ''}`}
                                                >
                                                    {toggling === order.id ? (
                                                        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                                    ) : (
                                                        <span className="material-icons-round text-[12px]">
                                                            {order.paymentStatus === 'paid' ? 'check_circle' : 'radio_button_unchecked'}
                                                        </span>
                                                    )}
                                                    {order.paymentStatus === 'paid' ? '已收款' : '待收款'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* ── DAILY BREAKDOWN TABLE ─────────────── */}
                    <div
                        className="rounded-[24px] overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                        <div className="px-5 pt-5 pb-3 border-b border-white/5">
                            <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">每日销售明细</h3>
                        </div>
                        <div className="divide-y divide-white/5">
                            {[
                                { label: '今日订单总数', value: `${todayOrders.length} 单`, icon: 'receipt_long' },
                                { label: '今日总金额', value: `RM ${(todayRevenue + todayPending).toFixed(2)}`, icon: 'payments' },
                                { label: '已收金额', value: `RM ${todayRevenue.toFixed(2)}`, icon: 'check_circle', color: 'text-emerald-400' },
                                { label: '待收金额', value: `RM ${todayPending.toFixed(2)}`, icon: 'pending', color: 'text-rose-400' },
                                { label: '回笼进度', value: `${collectionRate.toFixed(1)}%`, icon: 'trending_up', color: collectionRate >= 80 ? 'text-emerald-400' : 'text-amber-400' },
                            ].map(row => (
                                <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className={`material-icons-round text-[16px] ${row.color || 'text-slate-500'}`}>{row.icon}</span>
                                        <span className="text-[11px] font-bold text-slate-400">{row.label}</span>
                                    </div>
                                    <span className={`text-[12px] font-mono font-black ${row.color || 'text-slate-200'}`}>{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </PullToRefresh>
        </div>
    );
};

export default AccountManagement;
