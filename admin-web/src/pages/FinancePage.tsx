import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SuperAdminService, AdminOrderService } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, FinanceData, AiSummary } from '../types';
import { PageHeader } from '../components/PageHeader';

export const FinancePage: React.FC = () => {
    const [range, setRange] = useState<'today' | 'month' | 'all'>('month');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FinanceData | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
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

    const loadAiSummary = async () => {
        try {
            const result = await SuperAdminService.getAiSummary();
            setAiSummary(result);
        } catch (error) {
            console.error('Failed to load AI summary', error);
        }
    };

    const scrollToReconciliation = () => {
        const el = document.getElementById('payment-reconciliation');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    const handleUpdateField = async (orderId: string, field: string, value: any) => {
        try {
            const { error } = await supabase.from('orders').update({ [field]: value }).eq('id', orderId);
            if (error) throw error;
        } catch (err) {
            console.error(`Failed to update ${field}`, err);
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
        loadAiSummary();

        const handleScroll = () => {
            setIsCollapsed(window.scrollY > 100);
        };

        window.addEventListener('scroll', handleScroll);

        const channel = supabase
            .channel('finance-room')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadData(true);
                loadAiSummary();
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
        <div className="pb-20">
            {/* Sticky Header Wrapper */}
            <div className={`sticky top-0 z-[60] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isCollapsed ? 'bg-white/80 backdrop-blur-md shadow-lg border-b border-slate-100 py-3 mb-4' : 'bg-transparent py-0 mb-0'}`}>
                <div className={`transition-all duration-500 overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-[200px] opacity-100'}`}>
                    <PageHeader
                        title="Financials / 财务数据"
                        subtitle="Real-time net revenue and tax tracking"
                        actions={
                            <div className="flex bg-white/50 backdrop-blur p-1 rounded-2xl border border-slate-200">
                                {(['today', 'month', 'all'] as const).map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setRange(r)}
                                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${range === r ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        }
                    />
                </div>

                {/* Metrics Bar */}
                <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] px-1 ${isCollapsed ? 'grid-cols-4 gap-4 max-w-7xl mx-auto' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4'}`}>
                    {/* 1. Today Revenue */}
                    <div className={`relative group overflow-hidden transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-0 flex items-center gap-2' : 'bg-white/40 backdrop-blur-xl border border-white/60 p-6 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.04)] hover:-translate-y-1'}`}>
                        <div className={`transition-all duration-500 ${isCollapsed ? 'scale-75 opacity-100' : 'absolute top-0 right-0 p-4 opacity-10 text-slate-900 group-hover:scale-110'}`}>
                            <span className={`material-icons-round ${isCollapsed ? 'text-lg text-emerald-500' : 'text-4xl'}`}>payments</span>
                        </div>
                        <div className={`${isCollapsed ? 'flex items-baseline gap-1' : ''}`}>
                            <p className={`font-black uppercase tracking-widest transition-all duration-500 ${isCollapsed ? 'text-[8px] text-slate-400 mr-1' : 'text-[10px] text-slate-400 mb-3'}`}>Today Rev</p>
                            <div className="flex items-baseline gap-0.5">
                                <span className={`font-black text-emerald-500/60 font-mono transition-all duration-500 ${isCollapsed ? 'text-xs' : 'text-xl'}`}>RM</span>
                                <h2 className={`font-black text-slate-800 tracking-tighter font-mono transition-all duration-500 ${isCollapsed ? 'text-sm' : 'text-3xl'}`}>
                                    {(data?.todayRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* 2. Today Orders */}
                    <div className={`relative group overflow-hidden transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-0 flex items-center gap-2' : 'bg-white/40 backdrop-blur-xl border border-white/60 p-6 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.04)] hover:-translate-y-1'}`}>
                        <div className={`transition-all duration-500 ${isCollapsed ? 'scale-75 opacity-100' : 'absolute top-0 right-0 p-4 opacity-10 text-slate-900 group-hover:scale-110'}`}>
                            <span className={`material-icons-round ${isCollapsed ? 'text-lg text-indigo-500' : 'text-4xl'}`}>receipt_long</span>
                        </div>
                        <div className={`${isCollapsed ? 'flex items-baseline gap-1' : ''}`}>
                            <p className={`font-black uppercase tracking-widest transition-all duration-500 ${isCollapsed ? 'text-[8px] text-slate-400 mr-1' : 'text-[10px] text-slate-400 mb-3'}`}>Orders</p>
                            <h2 className={`font-black text-slate-800 tracking-tighter font-mono transition-all duration-500 ${isCollapsed ? 'text-sm' : 'text-3xl'}`}>
                                {data?.todayOrders || 0}
                            </h2>
                        </div>
                    </div>

                    {/* 3. Total Unpaid Balance */}
                    <div className={`relative group overflow-hidden transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-0 flex items-center gap-2' : 'bg-white/40 backdrop-blur-xl border border-red-100 p-6 rounded-[32px] shadow-[0_8px_32px_rgba(239,68,68,0.04)] hover:-translate-y-1'}`}>
                        <div className={`transition-all duration-500 ${isCollapsed ? 'scale-75 opacity-100' : 'absolute top-0 right-0 p-4 opacity-10 text-red-500 group-hover:scale-110'}`}>
                            <span className={`material-icons-round ${isCollapsed ? 'text-lg text-red-500' : 'text-4xl'}`}>warning</span>
                        </div>
                        <div className={`${isCollapsed ? 'flex items-baseline gap-1' : ''}`}>
                            <p className={`font-black uppercase tracking-widest transition-all duration-500 ${isCollapsed ? 'text-[8px] text-red-400 mr-1' : 'text-[10px] text-red-400 mb-3'}`}>Unpaid</p>
                            <div className="flex items-baseline gap-0.5">
                                <span className={`font-black text-red-500/60 font-mono transition-all duration-500 ${isCollapsed ? 'text-xs' : 'text-xl'}`}>RM</span>
                                <h2 className={`font-black text-red-600 tracking-tighter font-mono transition-all duration-500 ${isCollapsed ? 'text-sm' : 'text-3xl'}`}>
                                    {(data?.totalUnpaidBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* 4. Monthly Growth */}
                    <div className={`relative group overflow-hidden transition-all duration-500 ${isCollapsed ? 'bg-transparent border-none p-0 flex items-center gap-2' : 'bg-slate-900 p-6 rounded-[32px] shadow-xl hover:-translate-y-1'}`}>
                        <div className={`transition-all duration-500 ${isCollapsed ? 'scale-75 opacity-100' : 'absolute top-0 right-0 p-4 opacity-10 text-white'}`}>
                            <span className={`material-icons-round ${isCollapsed ? 'text-lg text-indigo-400' : 'text-4xl'}`}>auto_graph</span>
                        </div>
                        <div className={`${isCollapsed ? 'flex items-baseline gap-1' : ''}`}>
                            <p className={`font-black uppercase tracking-widest transition-all duration-500 ${isCollapsed ? 'text-[8px] text-indigo-400 mr-1' : 'text-[10px] text-indigo-400 mb-3'}`}>Growth</p>
                            <h2 className={`font-black tracking-tighter font-mono transition-all duration-500 ${isCollapsed ? 'text-sm text-slate-800' : 'text-3xl text-white'}`}>
                                {aiSummary?.monthly_growth !== undefined ? (aiSummary.monthly_growth * 100).toFixed(1) : '0.0'}%
                            </h2>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Payment Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                        <h4 className="font-black text-slate-800 text-sm uppercase tracking-wider">Payment Collections</h4>
                        <span className="material-icons-round text-slate-300">pie_chart</span>
                    </div>
                    <div className="p-8 flex-1">
                        {!data?.collections || data.collections.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center py-10 opacity-40">
                                <span className="material-icons-round text-4xl mb-2">empty_dashboard</span>
                                <p className="text-xs font-bold uppercase tracking-widest">No data for this range</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {data.collections.map((item, idx) => {
                                    const percent = (item.amount / (data.periodRevenue || 1)) * 100;
                                    return (
                                        <div key={idx} className="group">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                        <span className="material-icons-round">{getPaymentIcon(item.method)}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-800">{getPaymentLabel(item.method)}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{item.count} Transactions</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-slate-800 font-mono">RM {item.amount.toFixed(2)}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{percent.toFixed(1)}%</p>
                                                </div>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-slate-900 group-hover:bg-indigo-600 transition-all duration-500"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Card - AI Status (Replacing Financial Policy) */}
                <div className="bg-slate-900 rounded-[32px] p-8 text-white flex flex-col shadow-xl border border-white/5 text-left">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20">
                            <span className="material-icons-round text-indigo-400">insights</span>
                        </div>
                        <h4 className="font-black text-sm uppercase tracking-widest text-left">Growth Analytics</h4>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-left">MTD Growth (MoM)</p>
                                <p className="text-xs font-black font-mono">
                                    {(aiSummary?.monthly_growth || 0) >= 0 ? '+' : ''}{((aiSummary?.monthly_growth || 0) * 100).toFixed(1)}%
                                </p>
                            </div>
                            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-1000 ${(aiSummary?.today_vs_avg.ratio || 0) < 0.3 ? 'bg-red-500' : 'bg-indigo-500'
                                        }`}
                                    style={{ width: `${Math.min((aiSummary?.today_vs_avg.ratio || 0) * 100, 100)}%` }}
                                />
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-slate-400 leading-relaxed font-medium text-left">
                                AI Supervisor is actively monitoring {range} transactions. System health is optimal based on historical seasonality.
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                        <div className="text-left">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 text-left">AI Audit</p>
                            <p className="text-[10px] text-slate-500 text-left">Stability: High</p>
                        </div>
                        <span className="material-icons-round text-emerald-400 text-lg">verified</span>
                    </div>
                </div>
            </div>

            {/* Transaction List & Payment Reconciliation */}
            <div id="payment-reconciliation" className="mt-8 bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h4 className="font-black text-slate-800 text-sm uppercase tracking-wider">Payment Reconciliation</h4>
                        <div className="flex items-center gap-2 mt-1">
                            {(['all', 'paid', 'unpaid'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                <th className="px-8 py-4">Order ID</th>
                                <th className="px-8 py-4">Customer</th>
                                <th className="px-8 py-4">Total</th>
                                <th className="px-8 py-4 text-emerald-600">Deposit</th>
                                <th className="px-8 py-4 text-red-500">Balance</th>
                                <th className="px-8 py-4">Method</th>
                                <th className="px-8 py-4">Status</th>
                                <th className="px-8 py-4">Remark</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                            {orders
                                .filter(o => statusFilter === 'all' || o.paymentStatus === statusFilter)
                                .map((order) => (
                                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-8 py-4 font-mono font-bold text-slate-800">{order.id.slice(0, 8)}</td>
                                        <td className="px-8 py-4">
                                            <p className="font-bold text-slate-800">{order.customerName}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{order.customerPhone}</p>
                                        </td>
                                        <td className="px-8 py-4 font-black text-slate-800 font-mono">
                                            <span className="text-[10px] text-slate-400 mr-0.5 font-sans">RM</span>
                                            {order.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-8 py-4 font-black text-emerald-600 font-mono">
                                            <span className="text-[10px] text-emerald-300 mr-0.5 font-sans">RM</span>
                                            {(order.deposit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-8 py-4 font-black text-red-600 font-mono">
                                            <span className="text-[10px] text-red-300 mr-0.5 font-sans">RM</span>
                                            {(order.amount - (order.deposit_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-8 py-4">
                                            <select
                                                value={order.paymentMethod || 'cash'}
                                                onChange={(e) => handleUpdateField(order.id, 'paymentMethod', e.target.value)}
                                                className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[11px] font-black uppercase text-slate-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="bank_transfer">Transfer</option>
                                                <option value="cheque">Cheque</option>
                                                <option value="ewallet">E-Wallet</option>
                                            </select>
                                        </td>
                                        <td className="px-8 py-4">
                                            <button
                                                onClick={() => handleUpdateField(order.id, 'paymentStatus', order.paymentStatus === 'paid' ? 'unpaid' : 'paid')}
                                                className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${order.paymentStatus === 'paid'
                                                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                                                    : 'bg-red-500 text-white shadow-sm shadow-red-500/20'
                                                    }`}
                                            >
                                                {order.paymentStatus || 'unpaid'}
                                            </button>
                                        </td>
                                        <td className="px-8 py-4">
                                            <input
                                                type="text"
                                                defaultValue={order.remark || ''}
                                                onBlur={(e) => handleUpdateField(order.id, 'remark', e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                                placeholder="..."
                                                className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-xs text-slate-600 placeholder:text-slate-300 focus:ring-1 focus:ring-indigo-100 transition-all font-medium"
                                            />
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Lightbox Modal */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300"
                    onClick={() => setLightboxUrl(null)}
                >
                    <div className="relative max-w-4xl w-full flex flex-col items-center">
                        <img src={lightboxUrl} alt="Evidence" className="max-w-full max-h-[80vh] rounded-3xl shadow-2xl border border-white/10" />
                        <button
                            className="mt-6 px-8 py-3 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
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
