import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
    const navigate = useNavigate();
    const { search } = useLocation();

    const handleDrillDown = (type: 'orders' | 'accounts' | 'unpaid') => {
        if (type === 'orders') {
            navigate('/orders?date=today&status=completed');
        } else if (type === 'unpaid') {
            setStatusFilter('unpaid');
            scrollToReconciliation();
        } else {
            navigate('/config?tab=accounts');
        }
    };

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

    const handleTogglePayment = async (orderId: string, currentStatus: string | undefined) => {
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        try {
            const { error } = await supabase.from('orders').update({ paymentStatus: newStatus }).eq('id', orderId);
            if (error) throw error;
        } catch (err) {
            console.error('Failed to toggle payment status', err);
            alert('Update failed');
        }
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

        const channel = supabase
            .channel('finance-room')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadData(true);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Period Insights (Specific to Finance Page) */}
                <div
                    onClick={() => handleDrillDown('unpaid')}
                    className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-blue-100 shadow-[0_8px_30px_rgba(37,99,235,0.04)] relative overflow-hidden group hover:-translate-y-1 transition-all cursor-pointer"
                >
                    <div className="absolute top-4 right-4 p-4 text-blue-400 opacity-20 group-hover:opacity-100 transition-all">
                        <span className="material-icons-round">north_east</span>
                    </div>
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-blue-600 group-hover:rotate-12 transition-transform">
                        <span className="material-icons-round text-9xl">analytics</span>
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-3">Net Period Revenue ({range})</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-blue-400/60 font-mono">RM</span>
                            <h2 className="text-5xl font-black text-slate-800 tracking-tighter font-mono">
                                {data?.periodRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                        </div>
                        <div className="mt-6 pt-6 border-t border-slate-50 flex items-center gap-6">
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Growth</p>
                                <p className="text-sm font-bold text-emerald-600">Stable</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transactions</p>
                                <p className="text-sm font-bold text-slate-700">{data?.collections.reduce((a, b) => a + b.count, 0)} items</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Business Insights (Simplified) */}
                <div
                    onClick={() => handleDrillDown('accounts')}
                    className="bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-200 p-8 text-white relative overflow-hidden group hover:-translate-y-1 transition-all cursor-pointer"
                >
                    <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
                    <div className="relative z-10 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h4 className="font-black text-sm uppercase tracking-wider">Business Intelligence</h4>
                            <span className="material-icons-round text-white/50 group-hover:text-white transition-colors">arrow_outward</span>
                        </div>
                        <div className="mb-auto">
                            <p className="text-[10px] text-indigo-200 font-black uppercase tracking-widest mb-1">Period Total Revenue</p>
                            <h2 className="text-4xl font-black tracking-tighter mb-4 font-mono">RM {(data?.periodRevenue || 0).toFixed(2)}</h2>
                            <p className="text-xs text-indigo-100 font-medium leading-relaxed opacity-80">
                                This reflects the total net collections for the selected period. Click to view monthly details.
                            </p>
                        </div>
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-indigo-200 tracking-widest uppercase">Summary Status</span>
                                <span className="text-sm font-black uppercase tracking-widest">Active</span>
                            </div>
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

                {/* Info Card */}
                <div className="bg-slate-900 rounded-[32px] p-8 text-white flex flex-col shadow-xl">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                            <span className="material-icons-round text-blue-400">info</span>
                        </div>
                        <h4 className="font-black text-sm uppercase tracking-widest">Financial Policy</h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium mb-auto">
                        All revenue data is calculated based on "Paid" status orders. Pending payments are not included in the primary revenue totals to ensure accurate audit tracking.
                    </p>
                    <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Real-time Sync</p>
                        <p className="text-[10px] text-slate-500">Last updated: Just now</p>
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
                    <span className="material-icons-round text-slate-300">account_balance_wallet</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                <th className="px-8 py-4">Order ID</th>
                                <th className="px-8 py-4">Customer</th>
                                <th className="px-8 py-4">Total</th>
                                <th className="px-8 py-4">Payment Method</th>
                                <th className="px-8 py-4">Payment</th>
                                <th className="px-8 py-4">Remark</th>
                                <th className="px-8 py-4">Evidence</th>
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
                                            {order.amount.toFixed(2)}
                                        </td>
                                        <td className="px-8 py-4">
                                            <select
                                                value={order.paymentMethod || 'cash'}
                                                onChange={(e) => handleUpdateField(order.id, 'paymentMethod', e.target.value)}
                                                className="bg-transparent border-none text-xs font-bold uppercase text-slate-600 focus:ring-0 cursor-pointer hover:text-indigo-600 transition-colors"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="bank_transfer">Transfer</option>
                                                <option value="cheque">Cheque</option>
                                                <option value="ewallet">E-Wallet</option>
                                            </select>
                                        </td>
                                        <td className="px-8 py-4">
                                            <button
                                                onClick={() => handleTogglePayment(order.id, order.paymentStatus)}
                                                className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${order.paymentStatus === 'paid'
                                                    ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                                                    : 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20 shadow-sm'
                                                    }`}
                                            >
                                                {order.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                                            </button>
                                        </td>
                                        <td className="px-8 py-4">
                                            <input
                                                type="text"
                                                defaultValue={order.remark || ''}
                                                onBlur={(e) => handleUpdateField(order.id, 'remark', e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                                placeholder="Add remark..."
                                                className="w-full bg-slate-50 border-none rounded-lg px-3 py-1.5 text-xs text-slate-600 placeholder:text-slate-300 focus:ring-1 focus:ring-indigo-100 transition-all"
                                            />
                                        </td>
                                        <td className="px-8 py-4 text-right lg:text-left">
                                            {order.delivery_photos && order.delivery_photos.length > 0 ? (
                                                <button
                                                    onClick={() => setLightboxUrl(order.delivery_photos![0])}
                                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                                >
                                                    <span className="material-icons-round text-[14px]">photo_library</span>
                                                    Proof
                                                </button>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No Proof</span>
                                            )}
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
