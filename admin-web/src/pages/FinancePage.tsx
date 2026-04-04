import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SuperAdminService, AdminOrderService } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, FinanceData } from '../types';
import { PageHeader } from '../components/PageHeader';
import { NotificationBell } from '../components/NotificationBell';
import { FinanceTableRow } from '../components/FinanceTableRow';
import { useFinanceActions } from '../hooks/useFinanceActions';

export const FinancePage: React.FC = () => {
    const [range, setRange] = useState<'today' | 'month' | 'all'>('month');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FinanceData | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [eventDate, setEventDate] = useState<string>('');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const { search } = useLocation();

    // Use customized hook for logic
    const { handleUpdateField } = useFinanceActions(setOrders, setData);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const result = await SuperAdminService.getFinanceSummary(range, eventDate);
            setData(result as any);

            // Also fetch raw orders for the transaction list
            const ordersData = await AdminOrderService.getAll({
                event_date: eventDate || undefined
            });
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

        const findScrollContainer = () => {
            let el = document.querySelector('main .overflow-y-auto');
            if (!el) el = document.querySelector('.overflow-y-auto');
            return el;
        };

        const scrollContainer = findScrollContainer();
        if (!scrollContainer) return;

        const handleScroll = () => {
            setIsCollapsed(scrollContainer.scrollTop > 60);
        };

        scrollContainer.addEventListener('scroll', handleScroll);

        const channel = supabase
            .channel('finance-room')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadData(true);
            })
            .subscribe();

        return () => {
            scrollContainer.removeEventListener('scroll', handleScroll);
            supabase.removeChannel(channel);
        };
    }, [range, eventDate]);

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
        <div className="mt-10 mx-auto max-w-[1600px] px-4 pb-20">
            {/* 1. Header & Controls */}
            <div className="pt-8 pb-6">
                <PageHeader
                    title="Financials / 财务数据"
                    subtitle="Real-time net revenue and debt tracking"
                    showStats={false}
                    actions={
                        <div className="flex items-center gap-3">
                            <NotificationBell />
                            <div className="flex bg-white/50 backdrop-blur-xl p-1.5 rounded-2xl border border-white/60 shadow-sm">
                                {(['today', 'month', 'all'] as const).map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setRange(r)}
                                        className={`px-6 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-300 ${range === r ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-slate-600 hover:bg-white/50'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    }
                />
            </div>
            {/* 2. Metrics Bar (Sticky Mini-Dashboard Logic) */}
            <div className={`sticky top-16 z-20 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isCollapsed ? 'translate-y-[-56px]' : 'translate-y-0'} mb-8`}>
                <div 
                    className={`grid gap-6 transition-all duration-700 ${isCollapsed ? 'grid-cols-4 scale-[0.85] origin-top' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}
                >
                    
                    {/* 1. Revenue Card */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-0 h-auto opacity-0 pointer-events-none' : 'glass-card p-6 h-36 rounded-3xl hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="font-bold uppercase tracking-widest text-xs text-slate-500">
                                {range} Revenue
                            </p>
                            <span className="material-icons-round text-emerald-500/30 text-2xl">analytics</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-emerald-500 font-mono-finance text-xl">RM</span>
                            <h2 className="font-bold tracking-tight font-mono-finance text-3xl text-slate-800">
                                {(data?.periodRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* 2. Collection Data Card */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-0 h-auto opacity-0 pointer-events-none' : 'glass-card p-6 h-36 rounded-3xl hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl overflow-hidden'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="font-bold uppercase tracking-widest text-xs text-slate-500">
                                Collection Data
                            </p>
                            <span className="material-icons-round text-indigo-500/30 text-2xl">receipt_long</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            {data?.collections.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="material-icons-round text-[14px] text-slate-300">{getPaymentIcon(item.method)}</span>
                                        <span className="text-[12px] font-bold text-slate-500 truncate uppercase tracking-tight">{getPaymentLabel(item.method)}</span>
                                    </div>
                                    <span className="text-[12px] font-bold text-slate-800 font-mono-finance">RM{item.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. Unpaid Card (Neon Flow) */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-0 h-auto opacity-0 pointer-events-none' : `px-6 h-36 rounded-3xl hover:-translate-y-2 ${ (data?.totalUnpaidBalance || 0) > 0 ? 'neon-flow-red' : 'glass-card' }` }`}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="font-bold uppercase tracking-widest text-xs text-slate-500">
                                Unpaid Total
                            </p>
                            <span className={`material-icons-round text-2xl ${(data?.totalUnpaidBalance || 0) > 0 ? 'text-red-500 breathing-red' : 'text-slate-200'}`}>warning</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-bold font-mono-finance text-xl text-red-500">RM</span>
                            <h2 className="font-bold tracking-tight font-mono-finance text-3xl text-slate-800">
                                {(data?.totalUnpaidBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* 4. Orders Card */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-0 h-auto opacity-0 pointer-events-none' : 'glass-card px-6 h-36 rounded-3xl hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="font-bold uppercase tracking-widest text-xs text-slate-500">
                                {range} Orders
                            </p>
                            <span className="material-icons-round text-indigo-500/30 text-2xl">shopping_bag</span>
                        </div>
                        <h2 className="font-bold tracking-tight font-mono-finance text-3xl text-slate-800">
                            {data?.periodOrders || 0}
                        </h2>
                    </div>
                </div>
            </div>

            {/* 3. Main Content Grid */}
            <div className="grid grid-cols-1 gap-8 mt-12">
                
                {/* 3a. Transaction Table (Full Width) */}
                <div className="space-y-6">
                    <div className="glass-card rounded-[40px] overflow-hidden">
                        <div className="px-8 py-6 border-b border-white/60 flex items-center justify-between bg-white/30">
                            <div className="flex items-center gap-8">
                                <h4 className="font-bold text-slate-800 text-[13px] uppercase tracking-widest">Live Reconciliation</h4>
                                
                                <div className="flex items-center gap-4">
                                    {/* Option B: Dedicated Date Filter Bar */}
                                    <div className="flex items-center gap-2.5 bg-slate-100/60 px-4 py-2 rounded-full border border-slate-200/50 group focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:bg-white transition-all shadow-inner">
                                        <span className="material-icons-round text-slate-400 text-[16px]">event</span>
                                        <input
                                            type="date"
                                            value={eventDate}
                                            onChange={(e) => setEventDate(e.target.value)}
                                            className="bg-transparent border-none p-0 text-[11px] font-bold text-slate-700 focus:ring-0 outline-none uppercase tracking-wider cursor-pointer"
                                            title="Filter by Event Date"
                                        />
                                        {eventDate && (
                                            <button 
                                                onClick={() => setEventDate('')} 
                                                className="flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                                                title="Clear Date Filter"
                                            >
                                                <span className="material-icons-round text-[16px]">cancel</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex bg-slate-100/60 p-1.5 rounded-full border border-slate-200/50 shadow-inner">
                                        {(['all', 'paid', 'unpaid'] as const).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setStatusFilter(s)}
                                                className={`px-5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${statusFilter === s ? 'bg-slate-900 text-white shadow-lg scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button onClick={scrollToReconciliation} className="w-12 h-12 rounded-2xl bg-white/60 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-white transition-all shadow-sm">
                                <span className="material-icons-round">unfold_more</span>
                            </button>
                        </div>

                        {/* High-Density Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-[11px] font-black text-slate-900 uppercase tracking-widest bg-slate-50/80">
                                        <th className="px-5 py-5 text-left border-b border-slate-100"># (Order)</th>
                                        <th className="px-4 py-5 text-left border-b border-slate-100 whitespace-nowrap">Event Date</th>
                                        <th className="px-8 py-5 text-center border-b border-slate-100">Customer</th>
                                        <th className="px-5 py-5 text-center border-b border-slate-100">Method</th>
                                        <th className="px-5 py-5 text-right border-b border-slate-100">Total</th>
                                        <th className="px-5 py-5 text-center border-b border-slate-100">Received</th>
                                        <th className="px-5 py-5 text-right border-b border-slate-100">Balance</th>
                                        <th className="px-5 py-5 text-center border-b border-slate-100 min-w-[120px]">Status</th>
                                        <th className="px-5 py-5 text-left border-b border-slate-100">Photos</th>
                                        <th className="px-8 py-5 text-left border-b border-slate-100 w-52">Remark</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50">
                                    {orders
                                        .filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter)
                                        .filter(o => {
                                            if (range === 'all') return true;
                                            if (!o.dueTime) return false;
                                            const orderDate = new Date(o.dueTime);
                                            const now = new Date();
                                            if (range === 'today') {
                                                return orderDate.toDateString() === now.toDateString();
                                            }
                                            if (range === 'month') {
                                                return orderDate.getMonth() === now.getMonth() && 
                                                       orderDate.getFullYear() === now.getFullYear();
                                            }
                                            return true;
                                        })
                                        .map((order) => (
                                            <FinanceTableRow 
                                                key={order.id} 
                                                order={order} 
                                                onUpdateField={handleUpdateField}
                                                getPaymentIcon={getPaymentIcon}
                                                onViewPhoto={setLightboxUrl}
                                                expandedOrderId={expandedOrderId}
                                                setExpandedOrderId={setExpandedOrderId}
                                            />
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[9999] bg-slate-900/98 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300"
                    onClick={(e) => {
                        e.stopPropagation();
                        setLightboxUrl(null);
                    }}
                >
                    <div className="relative max-w-5xl w-full flex flex-col items-center">
                        <img src={lightboxUrl || ''} alt="Evidence" className="max-w-full max-h-[85vh] rounded-[40px] shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10" />
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
