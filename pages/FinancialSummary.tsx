import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../src/lib/supabase';
import { api, SuperAdminService, OrderService } from '../src/services/api';
import PullToRefresh from '../src/components/PullToRefresh';
import { Order, OrderStatus, PaymentMethod } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceData {
    periodRevenue: number;
    periodOrders: number;
    todayRevenue: number;
    todayOrders: number;
    totalUnpaidBalance: number;
    collections: Array<{ method: string; amount: number; count: number }>;
}

const PM_LABELS: Record<string, string> = {
    cash: 'CASH',
    bank_transfer: 'BANK TRF',
    ewallet: 'E-WALLET',
    cheque: 'CHEQUE',
};

const FinancialSummary: React.FC = () => {
    const [range, setRange] = useState<'today' | 'month' | 'all' | 'custom'>('today');
    const [dateFrom, setDateFrom] = useState<string>(new Date().toISOString().slice(0, 10));
    const [dateTo, setDateTo] = useState<string>(new Date().toISOString().slice(0, 10));
    const [loading, setLoading] = useState(true);
    const [showCalendar, setShowCalendar] = useState(false);
    const [data, setData] = useState<FinanceData | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [viewingPhotos, setViewingPhotos] = useState<string[] | null>(null);

    // ── Load Data ──────────────────────────────────────────────────────────────
    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            // 1. Fetch Aggregated Aggregates (Mode: Today/Month/All/Custom)
            const summary = await SuperAdminService.getFinanceSummary(
                range, 
                range === 'custom' ? dateFrom : undefined,
                range === 'custom' ? dateTo : undefined
            );
            setData(summary);

            // 2. Fetch Raw Orders for Transaction List
            const allOrders = await OrderService.getAll();
            // Sync with backend: display all orders in the ledger (like admin-web does)
            const relevant = allOrders;
            setOrders(relevant.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()));
        } catch (error: any) {
            console.error('Failed to load finance data', error);
            // Optionally, we could show a toast here, but we'll ensure state is handled
        } finally {
            if (!silent) setLoading(false);
        }
    }, [range, dateFrom, dateTo]);

    useEffect(() => {
        loadData();
    }, [range, dateFrom, dateTo]);

    useEffect(() => {
        // ── Real-time Sync ──────────────────────────────────────────────────
        const channel = supabase
            .channel('finance-room')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadData(true);
            })
            .subscribe();

        // Scroll listener for sticky collapse effect
        const handleScroll = () => {
            setIsCollapsed(window.scrollY > 100);
        };
        window.addEventListener('scroll', handleScroll);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [loadData]);

    // ── Actions ────────────────────────────────────────────────────────────────

    const getPaymentIcon = (method: string) => {
        switch (method.toLowerCase()) {
            case 'cash': return 'payments';
            case 'bank_transfer': return 'account_balance';
            case 'ewallet': return 'contactless';
            default: return 'receipt';
        }
    };

    // ── Export ─────────────────────────────────────────────────────────────────
    const exportToCSV = () => {
        const filtered = orders.filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter);
        if (filtered.length === 0) return;

        const headers = ['Order ID', 'Customer', 'Date', 'Amount', 'Status', 'Payment'];
        const rows = filtered.map(o => [
            o.id,
            `"${o.customerName}"`,
            new Date(o.created_at || '').toLocaleDateString(),
            o.amount,
            o.status,
            o.paymentStatus
        ]);
        
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `KM_Finance_${range}_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
    };

    return (
        <div className="flex flex-col min-h-full pb-32 bg-background-beige">
            
            {/* 1. Header Section */}
            <div className="pt-14 pb-8 px-6 no-print">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <p className="text-[9px] font-black text-primary/40 tracking-[0.3em] uppercase mb-1">Unified Financials</p>
                        <h1 className="text-3xl font-black text-primary tracking-tight">Account Viewer</h1>
                    </div>
                    
                    {/* Range Selector & Date Picker Group */}
                    <div className="flex items-center gap-2 self-start flex-nowrap">
                        <div className="flex bg-white/60 backdrop-blur-xl p-1 rounded-2xl border border-primary/5 shadow-xl">
                            {(['today', 'month', 'all'] as const).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setRange(r)}
                                    className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${range === r ? 'bg-primary text-white shadow-lg' : 'text-primary-light/40 hover:text-primary hover:bg-primary/5'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>

                        {/* Super Admin Style Range Picker */}
                        <div className="relative">
                            <div 
                                onClick={() => setShowCalendar(!showCalendar)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all duration-300 shadow-sm cursor-pointer ${range === 'custom' ? 'bg-primary/5 border-primary shadow-primary/10' : 'bg-white/60 backdrop-blur-xl border-primary/5'}`}
                            >
                                <span className={`material-icons-round text-sm ${range === 'custom' ? 'text-primary' : 'text-slate-400'}`}>calendar_month</span>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${range === 'custom' ? 'text-primary' : 'text-slate-500'}`}>
                                    {range === 'custom' ? `${dateFrom.slice(5)} - ${dateTo.slice(5)}` : 'Event Date'}
                                </span>
                            </div>

                            {/* Premium Range Picker Modal ( Centered ) */}
                            {showCalendar && (
                                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
                                    {/* Backdrop */}
                                    <div 
                                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
                                        onClick={() => setShowCalendar(false)}
                                    />
                                    
                                    {/* Modal Content */}
                                    <div className="relative bg-white rounded-[40px] shadow-2xl border border-slate-100 p-8 w-full max-w-[340px] animate-in fade-in zoom-in duration-300">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h4 className="text-[13px] font-black text-slate-800 uppercase tracking-widest">Select Date</h4>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-tight">Specify your analysis period</p>
                                            </div>
                                            <button 
                                                onClick={() => setShowCalendar(false)} 
                                                className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full text-slate-400 hover:text-slate-900 transition-all"
                                            >
                                                <span className="material-icons-round text-lg">close</span>
                                            </button>
                                        </div>

                                        <div className="grid gap-6">
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</p>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-icons-round text-slate-300 text-sm">calendar_today</span>
                                                    <input 
                                                        type="date" 
                                                        className="w-full bg-slate-50 border-none rounded-2xl pl-10 pr-4 py-3.5 text-[11px] font-black text-slate-700 focus:ring-2 ring-primary/20 transition-all"
                                                        value={dateFrom}
                                                        onChange={(e) => {
                                                            setDateFrom(e.target.value);
                                                            setRange('custom');
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</p>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-icons-round text-slate-300 text-sm">calendar_today</span>
                                                    <input 
                                                        type="date" 
                                                        className="w-full bg-slate-50 border-none rounded-2xl pl-10 pr-4 py-3.5 text-[11px] font-black text-slate-700 focus:ring-2 ring-primary/20 transition-all"
                                                        value={dateTo}
                                                        onChange={(e) => {
                                                            setDateTo(e.target.value);
                                                            setRange('custom');
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => setShowCalendar(false)}
                                                className="w-full py-4 mt-2 bg-slate-900 text-white rounded-[24px] text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-900/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-icons-round text-sm">search</span>
                                                Search
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Clear Button */}
                            {range === 'custom' && !showCalendar && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRange('today');
                                        const today = new Date().toISOString().slice(0, 10);
                                        setDateFrom(today);
                                        setDateTo(today);
                                    }}
                                    className="absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/60 rounded-full border border-primary/5 text-primary/40 hover:text-primary transition-all active:scale-90"
                                >
                                    <span className="material-icons-round text-sm">close</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Metrics Bar (Hybrid Stack/Grid Mode) */}
                <div className={`flex flex-col gap-6 transition-all duration-500 ${isCollapsed ? 'scale-[0.85] origin-top' : ''}`}>
                    
                    {/* Top Tier: Critical Financials (Full Width Stack) */}
                    <div className="flex flex-col gap-6">
                        {/* 1. Revenue Card */}
                        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[32px] border border-white/60 relative overflow-hidden group shadow-xl shadow-primary/5">
                            <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                            <p className="text-[9px] font-black text-primary/30 tracking-[0.2em] uppercase mb-3">Revenue ({range})</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xs font-black text-primary-warm font-mono">RM</span>
                                <h2 className="text-3xl font-black text-primary font-mono leading-none tracking-tighter">
                                    {(data?.periodRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                            </div>
                        </div>

                        {/* 2. Unpaid Card (Neon Flow Mode) */}
                        <div className={`p-6 rounded-[32px] transition-all duration-500 shadow-xl border ${ (data?.totalUnpaidBalance || 0) > 0 ? 'bg-red-500/5 border-red-500/30 shadow-red-500/10' : 'bg-white/80 backdrop-blur-xl border-white/60 shadow-primary/5' }`}>
                            <div className="flex items-center justify-between mb-3">
                                <p className={`text-[9px] font-black tracking-[0.2em] uppercase ${ (data?.totalUnpaidBalance || 0) > 0 ? 'text-red-500' : 'text-primary/30' }`}>
                                    Unpaid Total
                                </p>
                                {(data?.totalUnpaidBalance || 0) > 0 && <span className="material-icons-round text-red-500 text-sm animate-pulse">warning</span>}
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xs font-black text-red-600 font-mono">RM</span>
                                <h2 className="text-3xl font-black text-red-600 font-mono leading-none tracking-tighter">
                                    {(data?.totalUnpaidBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Tier: Operational Details (Side-by-Side) */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* 3. Collection Stats Card */}
                        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[32px] border border-white/60 overflow-hidden shadow-xl shadow-primary/5 flex flex-col justify-between">
                            <p className="text-[9px] font-black text-primary-light/40 tracking-[0.2em] uppercase mb-3">Collections</p>
                            <div className="space-y-1.5">
                                {data?.collections.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-[8px] font-bold">
                                        <div className="flex items-center gap-1 text-primary-light/30">
                                            <span className="material-icons-round text-[10px]">{getPaymentIcon(item.method)}</span>
                                            <span className="uppercase tracking-tighter truncate w-12">{PM_LABELS[item.method] || item.method}</span>
                                        </div>
                                        <span className="text-primary font-mono font-black text-[9px]">RM{item.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. Orders Count Card */}
                        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[32px] border border-white/60 shadow-xl shadow-primary/5 flex flex-col justify-center">
                            <p className="text-[9px] font-black text-primary-light/20 tracking-[0.2em] uppercase mb-3">Volume</p>
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-3xl font-black text-primary font-mono leading-none tracking-tighter">
                                    {data?.periodOrders || 0}
                                </h2>
                                <span className="text-[9px] font-black text-primary/10 uppercase tracking-widest">Orders</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <PullToRefresh onRefresh={loadData}>
                <div className="px-5 grid gap-6">
                    
                    {/* 3. Transaction List */}
                    <div className="bg-white/90 backdrop-blur-2xl rounded-[40px] overflow-hidden border border-primary/5 shadow-2xl shadow-primary/5">
                        <div className="px-6 py-5 border-b border-primary/5 flex items-center justify-between bg-primary/[0.01]">
                            <div className="flex items-center gap-4">
                                <h4 className="font-black text-primary text-[9px] uppercase tracking-[0.2em]">Live Ledger / 实时对账单</h4>
                                <div className="flex bg-primary/5 p-1 rounded-full border border-primary/5">
                                    {(['all', 'paid', 'unpaid'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.1em] transition-all ${statusFilter === s ? 'bg-primary text-white shadow-lg' : 'text-primary-light/40 hover:text-primary'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={exportToCSV} className="w-8 h-8 rounded-full bg-primary/5 text-primary-light flex items-center justify-center hover:bg-primary/10 transition-all">
                                <span className="material-icons-round text-sm">download</span>
                            </button>
                        </div>

                        <div className="divide-y divide-primary/5">
                            {loading ? (
                                [1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse bg-white/5" />)
                            ) : orders.filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter).length === 0 ? (
                                <div className="py-20 flex flex-col items-center text-slate-600">
                                    <span className="material-icons-round text-5xl mb-2">auto_graph</span>
                                    <p className="text-[9px] font-black uppercase tracking-widest">No matching ledger entries</p>
                                </div>
                            ) : (
                                orders
                                .filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter)
                                .filter(o => {
                                    if (range === 'all') return true;
                                    const dateStr = o.created_at || (o as any).dueTime;
                                    if (!dateStr) return false;
                                    const orderDate = new Date(dateStr);
                                    const now = new Date();
                                    
                                    if (range === 'custom') {
                                        const start = new Date(dateFrom);
                                        const end = new Date(dateTo);
                                        start.setHours(0, 0, 0, 0);
                                        end.setHours(23, 59, 59, 999);
                                        return orderDate >= start && orderDate <= end;
                                    }
                                    if (range === 'today') {
                                        return orderDate.toDateString() === now.toDateString();
                                    }
                                    if (range === 'month') {
                                        return orderDate.getMonth() === now.getMonth() &&
                                               orderDate.getFullYear() === now.getFullYear();
                                    }
                                    return true;
                                })
                                .map(order => (
                                    <div key={order.id} className="relative group transition-all duration-300">
                                        {/* Status Sidebar */}
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${order.paymentStatus === 'paid' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        
                                        <div className="pl-6 pr-5 py-5 flex items-center justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-[9px] font-mono font-bold text-primary-light/20">#{order.id.slice(-6)}</span>
                                                    <span className="w-1 h-1 rounded-full bg-primary/10"></span>
                                                    <span className="text-[9px] font-black text-primary-light/60 uppercase tracking-widest">
                                                        {new Date(order.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                    </span>
                                                </div>
                                                <h5 className="text-sm font-black text-primary truncate mb-3 uppercase tracking-tight">{order.customerName}</h5>
                                                
                                                <div className="flex items-center gap-2">
                                                    {/* Method Display */}
                                                    <div className="bg-primary/5 border border-primary/5 rounded-lg px-2 py-1 text-[8px] font-black text-primary-light/60 uppercase tracking-widest">
                                                        {order.paymentMethod || 'CASH'}
                                                    </div>
                                                    
                                                    {order.delivery_photos && order.delivery_photos.length > 0 && (
                                                        <button 
                                                            onClick={() => setViewingPhotos(order.delivery_photos!)}
                                                            className="w-6 h-6 rounded-lg bg-primary/5 flex items-center justify-center text-primary-light/40 hover:text-primary transition-colors border border-primary/5"
                                                        >
                                                            <span className="material-icons-round text-sm">photo_library</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <div className="text-xl font-black text-primary font-mono tracking-tighter">
                                                    <span className="text-[10px] mr-1 text-primary-light/20 font-sans">RM</span>
                                                    {(order.amount || 0).toFixed(2)}
                                                </div>
                                                
                                                <div
                                                    className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] shadow-lg ${
                                                        order.paymentStatus === 'paid' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                    }`}
                                                >
                                                    {order.paymentStatus === 'paid' ? '已收款 (PAID)' : '待收款 (UNPAID)'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* 4. Daily Breakdown Summary */}
                    <div className="bg-white/80 backdrop-blur-xl rounded-[32px] p-6 border border-primary/5 shadow-xl shadow-primary/5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-icons-round text-primary/40">equalizer</span>
                            <h4 className="font-black text-primary text-[9px] uppercase tracking-widest">Daily Performance Summary</h4>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-primary/5">
                                <span className="text-[9px] font-bold text-primary-light/40 uppercase tracking-widest">Today's Live Orders</span>
                                <span className="text-sm font-black text-primary font-mono">{data?.todayOrders || 0}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[9px] font-bold text-primary-light/40 uppercase tracking-widest">Gross Potential (Today)</span>
                                <span className="text-sm font-black text-primary-warm font-mono">RM {((data?.todayRevenue || 0) + (data?.totalUnpaidBalance || 0)).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </PullToRefresh>

            {/* Evidence Modal */}
            {viewingPhotos && (
                <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col p-6 animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-white uppercase tracking-widest italic">Delivery Evidence</h3>
                        <button onClick={() => setViewingPhotos(null)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar">
                        {viewingPhotos.map((url, idx) => (
                            <img key={idx} src={url} className="w-full h-auto rounded-3xl border border-white/10 shadow-2xl" alt="Evidence" />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialSummary;
