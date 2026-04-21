import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Order, OrderStatus } from '../types';
import { supabase } from '../src/lib/supabase';

const PublicReceipt: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrder = async () => {
            if (!id) return;
            try {
                setLoading(true);
                // Directly query supabase for public read if RLS allows or use a public-safe fetch
                const { data, error: sbError } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (sbError) throw sbError;
                setOrder(data);
            } catch (err: any) {
                console.error('Failed to fetch order details:', err);
                setError('Unable to find this order. Please check the QR code or contact us.');
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [id]);

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Loading Document...</p>
        </div>
    );

    if (error || !order) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center text-slate-800">
            <span className="material-icons-round text-6xl text-rose-500 mb-6 font-bold">report_problem</span>
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Order Not Found</h2>
            <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">{error}</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-100 py-6 sm:py-12 px-4 selection:bg-blue-100">
            <div className="max-w-xl mx-auto bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden relative">
                {/* Visual Header */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white text-center relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 blur-2xl"></div>
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
                        <span className="material-icons-round text-3xl">verified</span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight mb-1 uppercase">Official Receipt</h1>
                    <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.3em]">Kim Long Catering Sdn Bhd</p>
                </div>

                <div className="p-8 space-y-8">
                    {/* Header Details */}
                    <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Ref</p>
                            <h2 className="text-lg font-black text-slate-900 font-mono">#{order.order_number || order.id.slice(0, 12)}</h2>
                        </div>
                        <div className="text-right space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100">
                                {order.status === OrderStatus.COMPLETED ? 'Delivered' : 'Processing'}
                            </span>
                        </div>
                    </div>

                    {/* Customer Info Card */}
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</p>
                                <p className="text-sm font-black text-slate-800 uppercase">{order.customerName}</p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Event Date</p>
                                <p className="text-sm font-black text-slate-800">{order.eventDate || (order.dueTime ? new Date(order.dueTime).toLocaleDateString() : '-')}</p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-200/60">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Address</p>
                            <p className="text-sm font-bold text-slate-600 leading-snug uppercase italic">{order.address || 'Self Pickup'}</p>
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] pl-2 italic">Items Summary</h3>
                        <div className="border border-slate-100 rounded-3xl overflow-hidden divide-y divide-slate-50">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="p-5 flex justify-between items-center group hover:bg-slate-50 transition-all">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.name || item.product_name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase italic">Unit Price: RM {item.price?.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-base font-black text-slate-900 font-mono italic">x{item.quantity}</p>
                                        <p className="text-[11px] font-black text-blue-600 font-mono">RM {(item.price * item.quantity).toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Financials Recap */}
                    <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden shadow-xl shadow-blue-900/20">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl translate-x-10 -translate-y-10"></div>
                        <div className="space-y-4 relative z-10">
                            <div className="flex justify-between items-center text-xs opacity-60 font-bold uppercase tracking-widest">
                                <span>Subtotal Amount</span>
                                <span className="font-mono">RM {order.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-blue-400 font-bold uppercase tracking-widest">
                                <span>Deposit Paid</span>
                                <span className="font-mono">- RM {((order as any).deposit || 0).toFixed(2)}</span>
                            </div>
                            <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300 mb-1">Final Balance Due</p>
                                    <p className="text-3xl font-black font-mono italic tracking-tighter leading-none">RM {((order as any).balance ?? (order.amount - ((order as any).deposit || 0))).toFixed(2)}</p>
                                </div>
                                <div className="text-right bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-sm">
                                    <p className="text-[8px] font-black uppercase tracking-widest mb-0.5">SST 6%</p>
                                    <p className="text-[10px] font-bold opacity-60 leading-none italic uppercase">Included</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Auth */}
                    <div className="pt-8 text-center border-t border-slate-100">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.5em] mb-4 italic">Thank you for choosing Kim Long Catering</p>
                        <div className="flex justify-center gap-1.5 grayscale opacity-20">
                           <div className="w-8 h-8 rounded-full border-2 border-slate-400"></div>
                           <div className="w-8 h-8 rounded-full border-2 border-slate-400"></div>
                           <div className="w-8 h-8 rounded-full border-2 border-slate-400"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicReceipt;
