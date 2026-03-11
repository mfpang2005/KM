import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SuperAdminService, AdminOrderService } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, FinanceData } from '../types';
import { PageHeader } from '../components/PageHeader';

export const FinancePage: React.FC = () => {
    const [range, setRange] = useState<'today' | 'month' | 'all'>('month');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FinanceData | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { search } = useLocation();

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const result = await SuperAdminService.getFinanceSummary(range);
            setData(result as any);

            // Also fetch raw orders for the transaction list
            const ordersData = await AdminOrderService.getAll();
            setOrders(ordersData.slice(0, 50));
        } catch (error) {
            console.error('Failed to load finance data', error);
        } finally {
            if (!silent) setLoading(false);
        }
    };


    const scrollToReconciliation = () => {
        const el = document.getElementById('payment-reconciliation');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    const handleUpdateField = async (orderId: string, field: string, value: any) => {
        // --- Optimistic UI Update ---
        // 1. Snapshot previous state
        const originalOrders = [...orders];
        const originalData = data ? { ...data } : null;

        // 2. Find and update the order locally
        const updatedOrders = orders.map(o => o.id === orderId ? { ...o, [field]: value } : o);
        setOrders(updatedOrders);

        // 3. If field is paymentStatus, update revenue stats optimistically
        if (field === 'paymentStatus' && data) {
            const order = orders.find(o => o.id === orderId);
            if (order) {
                const oldStatus = order.paymentStatus || 'unpaid';
                const newStatus = value;
                const balance = order.amount - (order.deposit_amount || 0);

                // If changing to 'paid', increase revenue. If changing from 'paid', decrease.
                let revDiff = 0;
                if (oldStatus !== 'paid' && newStatus === 'paid') revDiff = balance;
                else if (oldStatus === 'paid' && newStatus !== 'paid') revDiff = -balance;

                if (revDiff !== 0) {
                    setData({
                        ...data,
                        periodRevenue: data.periodRevenue + revDiff,
                        todayRevenue: data.todayRevenue + revDiff,
                        totalUnpaidBalance: data.totalUnpaidBalance - revDiff // revDiff is positive if status became PAID
                    });
                }
            }
        }

        try {
            const { error } = await supabase.from('orders').update({ [field]: value }).eq('id', orderId);
            if (error) throw error;
            
            // Success: silently refresh to ensure server consistency
            loadData(true);
        } catch (err) {
            console.error(`Failed to update ${field}`, err);
            // Rollback on failure
            setOrders(originalOrders);
            setData(originalData);
            alert(`Failed to update ${field}. Please try again.`);
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(search);
        const filter = params.get('filter');
        if (filter === 'unpaid' || filter === 'paid' || filter === 'all') {
            setStatusFilter(filter);
            if (filter === 'unpaid') {
                setTimeout(scrollToReconciliation, 100);
            }
        }
    }, [search]);

    useEffect(() => {
        loadData();

        const handleScroll = () => {
            setIsCollapsed(window.scrollY > 100);
        };

        window.addEventListener('scroll', handleScroll);

        const channel = supabase
            .channel('finance-room')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadData(true);
            })
            .subscribe();

        return () => {
            window.removeEventListener('scroll', handleScroll);
            supabase.removeChannel(channel);
        };
    }, [range]);

    if (loading && !data) {
        return (
            <div className="h-full flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Calculating Ledger...</p>
            </div>
        );
    }

    const getPaymentIcon = (method: string) => {
        switch (method.toLowerCase()) {
            case 'cash': return 'payments';
            case 'bank_transfer': return 'account_balance';
            case 'ewallet': return 'contactless';
            default: return 'receipt';
        }
    };

    const getPaymentLabel = (method: string) => {
        switch (method.toLowerCase()) {
            case 'cash': return 'Cash';
            case 'bank_transfer': return 'Bank Transfer';
            case 'ewallet': return 'E-Wallet';
            default: return method;
        }
    };

    return (
        <div className="pb-20 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            {/* 1. Header & Controls */}
            <div className="pt-8 pb-4">
                <PageHeader
                    title="Financials / 财务数据"
                    subtitle="Real-time net revenue and debt tracking"
                    showStats={false}
                    actions={
                        <div className="flex bg-white/40 backdrop-blur-xl p-1 rounded-2xl border border-white/60 shadow-sm">
                            {(['today', 'month', 'all'] as const).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setRange(r)}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${range === r ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    }
                />
            </div>

            {/* 2. Metrics Bar (Sticky Mini-Dashboard Logic) */}
            <div className={`sticky top-4 z-[70] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isCollapsed ? 'translate-y-0' : 'translate-y-0'}`}>
                <div className={`grid gap-6 transition-all duration-700 ${isCollapsed ? 'grid-cols-3 bg-slate-900/90 backdrop-blur-2xl p-3 rounded-[24px] shadow-2xl border border-white/10 scale-95' : 'grid-cols-1 md:grid-cols-3'}`}>
                    
                    {/* Revenue Card */}
                    <div className={`group inner-border transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-2' : 'glass-card p-8 rounded-[40px] hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-slate-400' : 'text-[11px] text-slate-400'}`}>
                                {range} Revenue
                            </p>
                            {!isCollapsed && <span className="material-icons-round text-emerald-500/20 text-3xl">analytics</span>}
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`font-black text-emerald-500 font-mono-finance ${isCollapsed ? 'text-xs' : 'text-xl'}`}>RM</span>
                            <h2 className={`font-black tracking-tighter font-mono-finance ${isCollapsed ? 'text-lg text-white' : 'text-4xl text-slate-800'}`}>
                                {(data?.periodRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* Orders Card */}
                    <div className={`group inner-border transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-2' : 'glass-card p-8 rounded-[40px] hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-slate-400' : 'text-[11px] text-slate-400'}`}>
                                {range} Orders
                            </p>
                            {!isCollapsed && <span className="material-icons-round text-indigo-500/20 text-3xl">shopping_bag</span>}
                        </div>
                        <h2 className={`font-black tracking-tighter font-mono-finance ${isCollapsed ? 'text-lg text-white' : 'text-4xl text-slate-800'}`}>
                            {data?.periodOrders || 0}
                        </h2>
                    </div>

                    {/* Unpaid Card (Neon Flow) */}
                    <div className={`group inner-border transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-2' : `p-8 rounded-[40px] hover:-translate-y-2 ${ (data?.totalUnpaidBalance || 0) > 0 ? 'neon-flow-red' : 'glass-card' }` }`}>
                        <div className="flex items-center justify-between mb-4">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-red-300' : 'text-[11px] text-slate-400'}`}>
                                Unpaid Total
                            </p>
                            {!isCollapsed && <span className={`material-icons-round text-3xl ${(data?.totalUnpaidBalance || 0) > 0 ? 'text-red-500 breathing-red' : 'text-slate-200'}`}>warning</span>}
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`font-black font-mono-finance ${isCollapsed ? 'text-xs text-red-400' : 'text-xl text-red-500'}`}>RM</span>
                            <h2 className={`font-black tracking-tighter font-mono-finance ${isCollapsed ? 'text-lg text-white' : 'text-4xl text-slate-800'}`}>
                                {(data?.totalUnpaidBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
                
                {/* 3a. Payment Breakdown (Side Panel) */}
                <div className="lg:col-span-1">
                    <div className="glass-card rounded-[40px] p-8 h-full">
                        <div className="flex items-center justify-between mb-8">
                            <h4 className="font-black text-slate-800 text-sm uppercase tracking-[0.2em]">Collection Mix</h4>
                            <span className="material-icons-round text-slate-300">donut_large</span>
                        </div>
                        
                        <div className="space-y-8">
                            {data?.collections.map((item, idx) => {
                                const percent = (item.amount / (data.periodRevenue || 1)) * 100;
                                return (
                                    <div key={idx} className="group cursor-default">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm group-hover:shadow-indigo-500/20">
                                                    <span className="material-icons-round text-xl">{getPaymentIcon(item.method)}</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-800 tracking-tight">{getPaymentLabel(item.method)}</p>
                                                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{item.count} Txns</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-slate-800 font-mono-finance">RM {item.amount.toFixed(2)}</p>
                                                <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">{percent.toFixed(1)}%</p>
                                            </div>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-slate-900 group-hover:bg-indigo-600 transition-all duration-700 ease-out shadow-sm"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 3b. Transaction Table (Main Panel) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card rounded-[40px] overflow-hidden">
                        {/* Table Controls */}
                        <div className="px-8 py-6 border-b border-white/60 flex items-center justify-between bg-white/30">
                            <div>
                                <h4 className="font-black text-slate-800 text-sm uppercase tracking-[0.2em]">Live Reconciliation</h4>
                                <div className="flex items-center gap-2 mt-3">
                                    {(['all', 'paid', 'unpaid'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${statusFilter === s ? 'bg-slate-900 text-white shadow-lg' : 'bg-white/60 text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={scrollToReconciliation} className="w-10 h-10 rounded-full bg-white/60 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all shadow-sm">
                                <span className="material-icons-round">unfold_more</span>
                            </button>
                        </div>

                        {/* High-Density Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                                        <th className="px-6 py-3 w-16">#</th>
                                        <th className="px-6 py-3 w-32">Customer</th>
                                        <th className="px-6 py-3 w-28">Total</th>
                                        <th className="px-6 py-3 w-28 text-emerald-600">Deposit</th>
                                        <th className="px-6 py-3 w-32 text-red-500">Balance</th>
                                        <th className="px-6 py-3 w-28 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50">
                                    {orders
                                        .filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter)
                                        .map((order) => {
                                            const balance = order.amount - (order.deposit_amount || 0);
                                            const isUnpaid = order.paymentStatus !== 'paid';
                                            return (
                                                <tr key={order.id} className={`hover:bg-indigo-50/30 transition-all duration-300 group relative ${isUnpaid ? 'bg-red-50/5' : ''}`}>
                                                    <td className="px-6 py-2.5">
                                                        {isUnpaid && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                                                        <span className="font-mono-finance font-bold text-slate-400 text-[11px]">{order.id.slice(-6).toUpperCase()}</span>
                                                    </td>
                                                    <td className="px-6 py-2.5 truncate">
                                                        <p className="font-black text-slate-800 text-xs tracking-tight">{order.customerName}</p>
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">{order.customerPhone}</p>
                                                    </td>
                                                    <td className="px-6 py-2.5 font-mono-finance font-black text-slate-600 text-xs">
                                                        RM{order.amount.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-2.5 font-mono-finance font-black text-emerald-600 text-xs">
                                                        RM{(order.deposit_amount || 0).toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-2.5">
                                                        <div className={`inline-flex px-3 py-1 rounded-full font-mono-finance font-black text-xs ${balance > 0 ? 'bg-red-50 text-red-600 ring-1 ring-red-100 shadow-sm shadow-red-500/10' : 'text-slate-300'}`}>
                                                            RM{balance.toFixed(2)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-2.5 text-center">
                                                        <button
                                                            onClick={() => handleUpdateField(order.id, 'paymentStatus', isUnpaid ? 'paid' : 'unpaid')}
                                                            className={`px-4 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all duration-500 shadow-sm active:scale-95 ${!isUnpaid
                                                                ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20'
                                                                : 'bg-white text-slate-400 hover:bg-slate-900 hover:text-white border border-slate-100'
                                                                }`}
                                                        >
                                                            {isUnpaid ? 'Confirm' : 'Paid'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Lightbox Modal */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-500"
                    onClick={() => setLightboxUrl(null)}
                >
                    <div className="relative max-w-5xl w-full flex flex-col items-center">
                        <img src={lightboxUrl} alt="Evidence" className="max-w-full max-h-[85vh] rounded-[40px] shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10" />
                        <button
                            className="mt-10 px-12 py-4 glass-dark rounded-2xl font-black uppercase tracking-[0.3em] hover:bg-white hover:text-slate-900 transition-all duration-500 active:scale-95"
                            onClick={() => setLightboxUrl(null)}
                        >
                            Close Preview
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
