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
    const [range, setRange] = useState<'today' | 'month' | 'all'>('month');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FinanceData | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [toggling, setToggling] = useState<string | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [viewingPhotos, setViewingPhotos] = useState<string[] | null>(null);

    // ── Load Data ──────────────────────────────────────────────────────────────
    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            // 1. Fetch Aggregated Aggregates (Mode: Today/Month/All)
            const summary = await SuperAdminService.getFinanceSummary(range);
            setData(summary);

            // 2. Fetch Raw Orders for Transaction List
            const allOrders = await OrderService.getAll();
            // Filter relevant for accounting (ready, delivering, completed)
            const relevant = allOrders.filter(o => 
                [OrderStatus.READY, OrderStatus.DELIVERING, OrderStatus.COMPLETED].includes(o.status)
            );
            setOrders(relevant.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()));
        } catch (error) {
            console.error('Failed to load finance data', error);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [range]);

    useEffect(() => {
        loadData();

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
    const handleTogglePaid = async (order: Order) => {
        if (toggling) return;
        setToggling(order.id);
        const newStatus = order.paymentStatus === 'paid' ? 'unpaid' : 'paid';
        try {
            // Direct Supabase update for <1s feeling
            await supabase.from('orders').update({ paymentStatus: newStatus }).eq('id', order.id);
            // Local optimistic update
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, paymentStatus: newStatus as any } : o));
            // Trigger summary refresh
            loadData(true);
        } catch (err) {
            console.error('Toggle payment failed', err);
        } finally {
            setToggling(null);
        }
    };

    const handleUpdateMethod = async (orderId: string, method: string) => {
        try {
            await supabase.from('orders').update({ paymentMethod: method }).eq('id', orderId);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentMethod: method as any } : o));
            loadData(true);
        } catch (err) {
            console.error('Update method failed', err);
        }
    };

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
        <div className="flex flex-col min-h-full pb-32" style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
            
            {/* 1. Header Section */}
            <div className="pt-14 pb-8 px-6 no-print">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-[10px] font-black text-indigo-400 tracking-[0.4em] uppercase mb-1 italic">Unified Financials</p>
                        <h1 className="text-2xl font-black text-white tracking-tight">Account Center / 财务对账</h1>
                    </div>
                    
                    {/* Range Selector - Same as Admin-Web */}
                    <div className="flex bg-white/5 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-xl">
                        {(['today', 'month', 'all'] as const).map((r) => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${range === r ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Metrics Bar (Sticky Mini-Dashboard Mode) */}
                <div className={`grid gap-4 transition-all duration-500 ${isCollapsed ? 'grid-cols-4 scale-[0.85] origin-top' : 'grid-cols-2 lg:grid-cols-4'}`}>
                    
                    {/* Revenue Card */}
                    <div className="glass-card p-6 rounded-[32px] relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                        <p className="text-[9px] font-black text-emerald-400 tracking-[0.3em] uppercase mb-3 italic">Revenue ({range})</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black text-emerald-500 font-mono-finance">RM</span>
                            <h2 className="text-3xl font-black text-white font-mono-finance drop-shadow-lg leading-none">
                                {(data?.periodRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* Collection Stats Card */}
                    <div className="glass-card p-6 rounded-[32px] overflow-hidden">
                        <p className="text-[9px] font-black text-indigo-300 tracking-[0.3em] uppercase mb-3 italic">Collections ({range})</p>
                        <div className="space-y-1.5">
                            {data?.collections.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[10px] font-bold">
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        <span className="material-icons-round text-[12px]">{getPaymentIcon(item.method)}</span>
                                        <span className="uppercase tracking-tighter truncate w-16">{PM_LABELS[item.method] || item.method}</span>
                                    </div>
                                    <span className="text-white font-mono-finance">RM{item.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Unpaid Card (Neon Flow Mode) */}
                    <div className={`p-6 rounded-[32px] transition-all duration-500 ${ (data?.totalUnpaidBalance || 0) > 0 ? 'neon-flow-red' : 'glass-card' }`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className={`text-[9px] font-black tracking-[0.3em] uppercase italic ${ (data?.totalUnpaidBalance || 0) > 0 ? 'text-red-400' : 'text-slate-400' }`}>
                                Unpaid Total
                            </p>
                            {(data?.totalUnpaidBalance || 0) > 0 && <span className="material-icons-round text-red-500 text-sm breathing-red">warning</span>}
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black text-red-500 font-mono-finance">RM</span>
                            <h2 className="text-3xl font-black text-white font-mono-finance leading-none">
                                {(data?.totalUnpaidBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* Orders Count Card */}
                    <div className="glass-card p-6 rounded-[32px]">
                        <p className="text-[9px] font-black text-slate-400 tracking-[0.3em] uppercase mb-3 italic">Volume ({range})</p>
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-3xl font-black text-white font-mono-finance leading-none">
                                {data?.periodOrders || 0}
                            </h2>
                            <span className="text-[10px] font-black text-slate-600 uppercase">Orders</span>
                        </div>
                    </div>
                </div>
            </div>

            <PullToRefresh onRefresh={loadData}>
                <div className="px-5 grid gap-6">
                    
                    {/* 3. Transaction List */}
                    <div className="glass-card rounded-[40px] overflow-hidden border-white/5 shadow-2xl">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-4">
                                <h4 className="font-black text-white text-[10px] uppercase tracking-[0.2em] italic">Live Ledger / 实时对账单</h4>
                                <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                                    {(['all', 'paid', 'unpaid'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.1em] transition-all ${statusFilter === s ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={exportToCSV} className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 transition-all">
                                <span className="material-icons-round text-sm">download</span>
                            </button>
                        </div>

                        <div className="divide-y divide-white/5">
                            {loading ? (
                                [1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse bg-white/5" />)
                            ) : orders.filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter).length === 0 ? (
                                <div className="py-20 flex flex-col items-center text-slate-600">
                                    <span className="material-icons-round text-5xl mb-2">auto_graph</span>
                                    <p className="text-xs font-black uppercase tracking-widest">No matching ledger entries</p>
                                </div>
                            ) : (
                                orders
                                .filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter)
                                .map(order => (
                                    <div key={order.id} className="relative group transition-all duration-300 hover:bg-white/[0.02]">
                                        {/* Status Sidebar */}
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${order.paymentStatus === 'paid' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        
                                        <div className="pl-6 pr-5 py-5 flex items-center justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono font-bold text-slate-500 italic">#{order.id.slice(-6)}</span>
                                                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">
                                                        {new Date(order.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <h5 className="text-sm font-black text-white truncate mb-2 uppercase tracking-tight">{order.customerName}</h5>
                                                
                                                <div className="flex items-center gap-3">
                                                    {/* Method Switcher */}
                                                    <select 
                                                        value={order.paymentMethod || 'cash'}
                                                        onChange={(e) => handleUpdateMethod(order.id, e.target.value)}
                                                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[9px] font-black text-indigo-300 uppercase outline-none"
                                                    >
                                                        <option value="cash" className="bg-slate-900">Cash</option>
                                                        <option value="bank_transfer" className="bg-slate-900">Bank Transfer</option>
                                                        <option value="ewallet" className="bg-slate-900">E-Wallet</option>
                                                        <option value="cheque" className="bg-slate-900">Cheque</option>
                                                    </select>
                                                    
                                                    {order.delivery_photos && order.delivery_photos.length > 0 && (
                                                        <button 
                                                            onClick={() => setViewingPhotos(order.delivery_photos!)}
                                                            className="text-indigo-400/60 hover:text-indigo-400 transition-colors"
                                                        >
                                                            <span className="material-icons-round text-sm">photo_library</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-3 shrink-0">
                                                <div className="text-lg font-black text-white font-mono-finance italic">
                                                    <span className="text-[10px] mr-1 text-slate-500 font-sans not-italic">RM</span>
                                                    {(order.amount || 0).toFixed(2)}
                                                </div>
                                                
                                                <button
                                                    onClick={() => handleTogglePaid(order)}
                                                    disabled={toggling === order.id}
                                                    className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 ${
                                                        order.paymentStatus === 'paid' 
                                                        ? 'bg-emerald-500 text-white hover:bg-emerald-400' 
                                                        : 'bg-red-500 text-white hover:bg-red-400'
                                                    }`}
                                                >
                                                    {toggling === order.id ? (
                                                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        order.paymentStatus === 'paid' ? '已收款' : '待收款'
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* 4. Daily Breakdown Summary */}
                    <div className="glass-card rounded-[32px] p-6 border-white/5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-icons-round text-indigo-400">equalizer</span>
                            <h4 className="font-black text-white text-[11px] uppercase tracking-widest italic">Daily Performance Summary</h4>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Today's Live Orders</span>
                                <span className="text-sm font-black text-white font-mono-finance">{data?.todayOrders || 0}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Gross Potential (Today)</span>
                                <span className="text-sm font-black text-indigo-400 font-mono-finance">RM {((data?.todayRevenue || 0) + (data?.totalUnpaidBalance || 0)).toLocaleString()}</span>
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
