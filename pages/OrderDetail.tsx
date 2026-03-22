import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Order, OrderStatus } from '../types';
import { OrderService } from '../src/services/api';

const OrderDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrder = async () => {
            if (!id) return;
            try {
                setLoading(true);
                const data = await OrderService.getById(id);
                setOrder(data);
            } catch (err: any) {
                console.error('Failed to fetch order details:', err);
                setError(err.message || '获取订单详情失败');
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [id]);

    const statusLabels: Record<OrderStatus, string> = {
        [OrderStatus.PENDING]: '待处理',
        [OrderStatus.PREPARING]: '准备中',
        [OrderStatus.READY]: '待取餐',
        [OrderStatus.DELIVERING]: '配送中',
        [OrderStatus.COMPLETED]: '已完成',
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        [OrderStatus.PREPARING]: 'bg-blue-100 text-blue-700 border-blue-200',
        [OrderStatus.READY]: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        [OrderStatus.DELIVERING]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        [OrderStatus.COMPLETED]: 'bg-slate-100 text-slate-600 border-slate-200',
    };

    const statusProgress: Record<OrderStatus, number> = {
        [OrderStatus.PENDING]: 20,
        [OrderStatus.PREPARING]: 40,
        [OrderStatus.READY]: 60,
        [OrderStatus.DELIVERING]: 85,
        [OrderStatus.COMPLETED]: 100,
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-xs font-black text-slate-400 uppercase tracking-widest">Loading Order Details...</p>
        </div>
    );

    if (error || !order) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
            <span className="material-icons-round text-6xl text-slate-200 mb-4">error_outline</span>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Order Not Found</h2>
            <p className="text-sm text-slate-500 mt-2 font-medium">{error || '该订单不存在或已被删除'}</p>
            <button 
                onClick={() => navigate(-1)}
                className="mt-8 px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all"
            >
                返回上一页
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f8f9fc] pb-20">
            {/* Dynamic Status Banner */}
            <div className={`h-1.5 w-full ${statusColors[order.status].split(' ')[0].replace('bg-', 'bg-')}`}>
                <div 
                    className="h-full bg-current transition-all duration-1000 ease-out" 
                    style={{ width: `${statusProgress[order.status]}%` }}
                ></div>
            </div>

            {/* Header */}
            <header className="bg-white border-b border-slate-100 px-6 py-6 sticky top-0 z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-slate-400 active:scale-90 transition-transform">
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">订单详情</h1>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">#{order.order_number || order.id.slice(0, 12)}</p>
                    </div>
                </div>
                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColors[order.status]}`}>
                    {statusLabels[order.status]}
                </div>
            </header>

            <main className="p-6 max-w-2xl mx-auto space-y-6">
                {/* Status Progress Visual */}
                <section className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex items-center justify-between">
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusProgress[order.status] >= 20 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <span className="material-icons-round text-lg">receipt</span>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase">下单</span>
                    </div>
                    <div className={`flex-1 h-[2px] mx-2 ${statusProgress[order.status] > 20 ? 'bg-indigo-600' : 'bg-slate-100'}`}></div>
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusProgress[order.status] >= 40 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <span className="material-icons-round text-lg">restaurant</span>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase">制作</span>
                    </div>
                    <div className={`flex-1 h-[2px] mx-2 ${statusProgress[order.status] > 40 ? 'bg-indigo-600' : 'bg-slate-100'}`}></div>
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusProgress[order.status] >= 85 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <span className="material-icons-round text-lg">local_shipping</span>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase">配送</span>
                    </div>
                    <div className={`flex-1 h-[2px] mx-2 ${statusProgress[order.status] > 85 ? 'bg-indigo-600' : 'bg-slate-100'}`}></div>
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusProgress[order.status] >= 100 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <span className="material-icons-round text-lg">check_circle</span>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase">完成</span>
                    </div>
                </section>

                {/* Customer Info Card */}
                <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 flex flex-col gap-8">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Customer</p>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{order.customerName}</h2>
                            <p className="text-sm font-bold text-indigo-600 font-mono italic">{order.customerPhone}</p>
                        </div>
                        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                            <span className="material-icons-round text-2xl">person</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-[32px] border border-slate-100/50">
                            <span className="material-icons-round text-slate-400 mt-0.5">place</span>
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Address</p>
                                <p className="text-[13px] font-bold text-slate-600 leading-relaxed">{order.address}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[32px] border border-slate-100/50">
                            <span className="material-icons-round text-slate-400">schedule</span>
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Event Time / 创建日期</p>
                                <p className="text-[13px] font-bold text-slate-600">{order.dueTime ? new Date(order.dueTime).toLocaleString('zh-CN', { hour12: false }) : (order as any).created_at ? new Date((order as any).created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Payload / Items */}
                <section className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] pl-4">Payload Summary</h3>
                    <div className="bg-white border border-slate-100 rounded-[40px] shadow-sm overflow-hidden divide-y divide-slate-50">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="p-8 flex justify-between items-center group hover:bg-slate-50 transition-colors">
                                <div className="space-y-1">
                                    <p className="text-base font-black text-slate-800">{item.product_name || item.name}</p>
                                    <p className="text-[10px] font-black text-slate-300 tracking-widest uppercase">RM {Number(item.price || 0).toFixed(2)} / unit</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-indigo-600 font-mono">x{item.quantity}</p>
                                    <p className="text-[11px] font-black text-slate-400 font-mono">RM {(Number(item.price || 0) * item.quantity).toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Billing Summary */}
                <section className="bg-indigo-950 p-10 rounded-[48px] shadow-2xl shadow-indigo-900/40 text-white space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full"></div>
                    
                    <div className="space-y-4 relative z-10">
                        <div className="flex justify-between items-center opacity-40">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Subtotal</span>
                            <span className="text-sm font-black font-mono">RM {order.amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Deposit Paid</span>
                            <span className="text-sm font-black font-mono text-indigo-300">RM {((order as any).deposit || 0).toFixed(2)}</span>
                        </div>
                        <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">Balance Due</p>
                                <h4 className="text-5xl font-black font-mono tracking-tighter italic">RM {((order as any).balance ?? (order.amount - ((order as any).deposit || 0))).toFixed(2)}</h4>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Method</p>
                                <span className="px-4 py-2 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10">{order.paymentMethod || 'CASH'}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Additional Details */}
                {((order as any).remarks || (order as any).remark) && (
                    <section className="p-8 bg-amber-50 rounded-[32px] border border-amber-100">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="material-icons-round text-amber-500">sticky_note_2</span>
                            <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Administrative Remarks</h4>
                        </div>
                        <p className="text-sm font-bold text-amber-900/70 leading-relaxed italic">
                            "{ (order as any).remarks || (order as any).remark }"
                        </p>
                    </section>
                )}
            </main>
        </div>
    );
};

export default OrderDetail;
