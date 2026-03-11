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
        const originalOrders = [...orders];
        const originalData = data ? { ...data } : null;

        // Find the specific order to calculate impacts
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        let updatePayload: any = { [field]: value };
        let nextOrders = [...orders];
        let nextData = data ? { ...data } : null;

        // 1. Logic for Deposit Amount (Repayments)
        if (field === 'deposit_amount' && nextData) {
            const delta = value - (order.deposit_amount || 0);
            nextData.periodRevenue += delta;
            nextData.todayRevenue += delta;
            nextData.totalUnpaidBalance -= delta;

            // Auto-complete status if fully paid
            if (value >= order.amount && order.paymentStatus !== 'paid') {
                updatePayload.paymentStatus = 'paid';
                nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value, paymentStatus: 'paid' } : o);
            } else {
                nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value } : o);
            }
        } 
        // 2. Logic for Payment Status Toggle
        else if (field === 'paymentStatus' && nextData) {
            const oldStatus = (order.paymentStatus || 'unpaid').toLowerCase();
            const newStatus = (value as string).toLowerCase();
            const balance = order.amount - (order.deposit_amount || 0);

            if (oldStatus !== 'paid' && newStatus === 'paid') {
                // Changing to PAID: Assume remaining balance is now received
                if (balance > 0) {
                    updatePayload.deposit_amount = order.amount;
                    nextData.periodRevenue += balance;
                    nextData.todayRevenue += balance;
                    nextData.totalUnpaidBalance -= balance;
                    nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value, deposit_amount: order.amount } : o);
                } else {
                    nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value } : o);
                }
            } else if (oldStatus === 'paid' && newStatus !== 'paid') {
                // Reverting PAID: This is rare but we need to keep it consistent
                // For simplicity, we keep the deposit_amount as is (we don't "return" cash)
                // But it adds back to unpaid balance
                nextData.totalUnpaidBalance += balance; // balance would be 0 if it was truly paid
                nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value } : o);
            } else {
                nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value } : o);
            }
        } 
        // 3. Simple field update
        else {
            nextOrders = nextOrders.map(o => o.id === orderId ? { ...o, [field]: value } : o);
        }

        // Apply optimistic updates
        setOrders(nextOrders);
        if (nextData) setData(nextData);

        try {
            const { error } = await supabase.from('orders').update(updatePayload).eq('id', orderId);
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
                                    className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${range === r ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
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
                <div 
                    className={`grid gap-6 transition-all duration-700 ${isCollapsed ? 'grid-cols-4 bg-slate-900/90 backdrop-blur-2xl p-3 rounded-[24px] shadow-2xl border border-white/10 scale-95' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-[2fr_2fr_2fr_1fr]'}`}
                >
                    
                    {/* 1. Revenue Card */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-2 h-auto' : 'glass-card p-5 h-36 rounded-3xl hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-slate-400' : 'text-xs text-slate-700'}`}>
                                {range} Revenue
                            </p>
                            {!isCollapsed && <span className="material-icons-round text-emerald-500/20 text-2xl">analytics</span>}
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`font-black text-emerald-500 font-mono-finance ${isCollapsed ? 'text-xs' : 'text-lg'}`}>RM</span>
                            <h2 className={`font-black tracking-tighter font-mono-finance ${isCollapsed ? 'text-lg text-white' : 'text-3xl text-slate-800'}`}>
                                {(data?.periodRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* 2. Collection Data Card */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-2 overflow-hidden h-auto' : 'glass-card p-5 h-36 rounded-3xl hover:-translate-y-2 hover:shadow-indigo-500/10 hover:shadow-2xl overflow-hidden'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-slate-400' : 'text-xs text-slate-700'}`}>
                                Collection Data
                            </p>
                            {!isCollapsed && <span className="material-icons-round text-indigo-500/20 text-2xl">receipt_long</span>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {data?.collections.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                        <span className="material-icons-round text-[10px] text-slate-300">{getPaymentIcon(item.method)}</span>
                                        <span className="text-[9px] font-black text-slate-500 truncate uppercase tracking-tight">{getPaymentLabel(item.method)}</span>
                                    </div>
                                    <span className="text-[9px] font-black text-slate-800 font-mono-finance">RM{item.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. Unpaid Card (Neon Flow) */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-2 h-auto' : `px-5 h-36 rounded-3xl hover:-translate-y-2 ${ (data?.totalUnpaidBalance || 0) > 0 ? 'neon-flow-red' : 'glass-card' }` }`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-red-300' : 'text-xs text-slate-700'}`}>
                                Unpaid Total
                            </p>
                            {!isCollapsed && <span className={`material-icons-round text-2xl ${(data?.totalUnpaidBalance || 0) > 0 ? 'text-red-500 breathing-red' : 'text-slate-200'}`}>warning</span>}
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className={`font-black font-mono-finance ${isCollapsed ? 'text-xs text-red-400' : 'text-lg text-red-500'}`}>RM</span>
                            <h2 className={`font-black tracking-tighter font-mono-finance ${isCollapsed ? 'text-lg text-white' : 'text-3xl text-slate-800'}`}>
                                {(data?.totalUnpaidBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                    </div>

                    {/* 4. Orders Card */}
                    <div className={`group inner-border transition-all duration-500 flex flex-col justify-center ${isCollapsed ? 'bg-transparent border-none p-2 h-auto' : 'glass-card px-3 h-36 rounded-xl hover:-translate-y-1 hover:shadow-indigo-500/10 hover:shadow-xl'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <p className={`font-black uppercase tracking-[0.2em] transition-all ${isCollapsed ? 'text-[8px] text-slate-400' : 'text-xs text-slate-700'}`}>
                                {range} Orders
                            </p>
                            {!isCollapsed && <span className="material-icons-round text-indigo-500/20 text-xl">shopping_bag</span>}
                        </div>
                        <h2 className={`font-black tracking-tighter font-mono-finance ${isCollapsed ? 'text-lg text-white' : 'text-2xl text-slate-800'}`}>
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
                        <div className="px-8 py-5 border-b border-white/60 flex items-center justify-between bg-white/30">
                            <div className="flex items-center gap-6">
                                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-[0.1em]">Live Reconciliation</h4>
                                <div className="flex bg-slate-100/40 p-1 rounded-full border border-slate-200/50">
                                    {(['all', 'paid', 'unpaid'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${statusFilter === s ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
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
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">#</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Date</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Customer</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Method</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Status</th>
                                        <th className="px-4 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Total</th>
                                        <th className="px-4 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Balance</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Payment</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 w-48">Remark</th>
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
                                                    {isUnpaid && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                                                    <td className="px-4 py-3 font-mono-finance text-[11px] text-indigo-600 font-bold tracking-tight">
                                                        {order.id.slice(-6).toUpperCase() || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono-finance text-[10px] text-slate-500">
                                                        {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : '-'}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <p className="text-xs font-bold text-slate-800 tracking-tight">{order.customerName || 'Walk-in'}</p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">{order.customerPhone || '-'}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1.5 text-slate-500">
                                                            <span className="material-icons-round text-xs">{getPaymentIcon(order.paymentMethod || 'cash')}</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-tighter truncate max-w-[60px]">{order.paymentMethod || 'CASH'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={order.paymentStatus}
                                                            onChange={(e) => handleUpdateField(order.id, 'paymentStatus', e.target.value)}
                                                            className={`text-[9px] font-black px-2 py-1 rounded-full border transition-all cursor-pointer uppercase tracking-widest outline-none
                                                                ${order.paymentStatus?.toLowerCase() === 'paid' 
                                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' 
                                                                    : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}
                                                        >
                                                            <option value="paid">PAID</option>
                                                            <option value="unpaid">UNPAID</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono-finance text-[11px] font-bold text-slate-800">
                                                        {(order.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className={`px-4 py-3 text-right font-mono-finance text-[11px] font-black ${(balance || 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                        {(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-center">
                                                            <div className="relative group">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">RM</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder="0.00"
                                                                    className="w-20 pl-7 pr-2 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[11px] font-mono-finance font-bold focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                                                                    onBlur={(e) => {
                                                                        const val = parseFloat(e.target.value);
                                                                        if (!isNaN(val) && val !== 0) {
                                                                            handleUpdateField(order.id, 'deposit_amount', (order.deposit_amount || 0) + val); // Update deposit amount
                                                                            e.target.value = ''; // Reset after update
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <input
                                                            type="text"
                                                            defaultValue={order.remark || ''}
                                                            onBlur={(e) => handleUpdateField(order.id, 'remark', e.target.value)}
                                                            className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 transition-all outline-none text-[10px] text-slate-600 py-1"
                                                            placeholder="Add remark..."
                                                        />
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
