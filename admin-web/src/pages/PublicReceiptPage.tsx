import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Order } from '../types';

/**
 * 公共顾客账单页面
 * NOTE: 此页面为无需登录的公共路由，通过账单上的 QR Code 直接访问
 */
const PublicReceiptPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrder = async () => {
            if (!id) return;
            try {
                setLoading(true);
                const { data, error: sbError } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (sbError) throw sbError;
                setOrder(data);
            } catch (err: any) {
                console.error('PublicReceipt: Failed to fetch order:', err);
                setError('Unable to find this order. Please contact us directly.');
            } finally {
                setLoading(false);
            }
        };
        fetchOrder();
    }, [id]);

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Loading Receipt...</p>
        </div>
    );

    if (error || !order) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
            <span className="text-6xl mb-6">🔍</span>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Order Not Found</h2>
            <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">{error}</p>
            <p className="text-xs text-slate-400 mt-4 font-mono">{id}</p>
        </div>
    );

    const items: any[] = order.items || [];
    const deposit = (order as any).deposit || 0;
    const balance = (order as any).balance ?? (order.amount - deposit);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 py-6 sm:py-12 px-4">
            <div className="max-w-lg mx-auto bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-8 py-10 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-24 translate-x-24 blur-2xl pointer-events-none"></div>
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/20">
                        <span className="material-icons-round text-3xl">receipt_long</span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight uppercase mb-1">Official Receipt</h1>
                    <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.3em]">Kim Long Catering Sdn Bhd • 1519675-T</p>
                </div>

                <div className="p-8 space-y-8">
                    {/* Order Ref + Status */}
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Order Reference</p>
                            <h2 className="text-lg font-black text-slate-900 font-mono">#{order.order_number || order.id.slice(0, 12)}</h2>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {order.status === 'completed' ? '✓ Delivered' : 'Processing'}
                            </span>
                        </div>
                    </div>

                    {/* Customer Info */}
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer</p>
                                <p className="text-sm font-black text-slate-800 uppercase">{order.customerName}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Event Date</p>
                                <p className="text-sm font-black text-slate-800">
                                    {order.eventDate || ((order as any).dueTime ? new Date((order as any).dueTime).toLocaleDateString('en-MY') : '-')}
                                </p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Address</p>
                            <p className="text-sm font-bold text-slate-600 leading-snug">{order.address || 'Self Pickup'}</p>
                        </div>
                    </div>

                    {/* Items List */}
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-4 pl-1">Items Summary</p>
                        <div className="border border-slate-100 rounded-3xl overflow-hidden divide-y divide-slate-50">
                            {items.length > 0 ? items.map((item, idx) => (
                                <div key={idx} className="px-5 py-4 flex justify-between items-center hover:bg-slate-50 transition-all">
                                    <div>
                                        <p className="text-sm font-black text-slate-800 uppercase">{item.name || item.product_name}</p>
                                        {item.price && (
                                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">Unit: RM {Number(item.price).toFixed(2)}</p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0 ml-4">
                                        <p className="text-base font-black text-slate-900 font-mono">×{item.quantity}</p>
                                        {item.price && (
                                            <p className="text-[11px] font-black text-blue-600 font-mono">RM {(Number(item.price) * item.quantity).toFixed(2)}</p>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div className="px-5 py-6 text-center text-sm text-slate-400 font-bold italic">No items listed</div>
                            )}
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="bg-slate-900 rounded-[28px] p-7 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/20 rounded-full blur-3xl translate-x-12 -translate-y-12 pointer-events-none"></div>
                        <div className="space-y-4 relative z-10">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest opacity-60">
                                <span>Subtotal</span>
                                <span className="font-mono">RM {order.amount.toFixed(2)}</span>
                            </div>
                            {deposit > 0 && (
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-blue-400">
                                    <span>Deposit Paid</span>
                                    <span className="font-mono">- RM {deposit.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="pt-5 border-t border-white/10 flex justify-between items-end">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Balance Due</p>
                                <p className="text-3xl font-black font-mono tracking-tighter italic leading-none">RM {balance.toFixed(2)}</p>
                            </div>
                            <p className="text-[9px] opacity-40 font-bold uppercase tracking-widest text-right">Prices inclusive of 6% SST</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center pt-4 border-t border-slate-100 space-y-2">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Thank you for your business</p>
                        <p className="text-[9px] text-slate-200 font-bold">Kim Long Catering Sdn Bhd • No 120 & 121, Jalan Senai Utama, 81400 Senai, Johor</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicReceiptPage;
