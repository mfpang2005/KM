import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Order, OrderStatus } from '../types';
import { OrderService } from '../src/services/api';
import { getGoogleMapsUrl } from '../src/utils/maps';

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
        [OrderStatus.PENDING]: '分析中',
        [OrderStatus.PREPARING]: '准备中',
        [OrderStatus.READY]: '待取餐',
        [OrderStatus.DELIVERING]: '配送中',
        [OrderStatus.COMPLETED]: '已完成',
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
        [OrderStatus.PREPARING]: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
        [OrderStatus.READY]: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
        [OrderStatus.DELIVERING]: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
        [OrderStatus.COMPLETED]: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
    };


    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A]">
            <div className="relative">
                <div className="absolute inset-0 bg-sky-500/20 blur-3xl animate-pulse"></div>
                <div className="w-16 h-16 border-[3px] border-sky-600/30 border-t-sky-500 rounded-full animate-spin relative z-10"></div>
            </div>
            <p className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] animate-pulse">正在加载订单详情...</p>
        </div>
    );

    if (error || !order) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A] p-10 text-center">
            <div className="w-24 h-24 bg-rose-500/10 rounded-[40px] flex items-center justify-center text-rose-500 mb-8 border border-rose-500/20 shadow-glow shadow-rose-500/10">
                <span className="material-icons-round text-4xl">warning_amber</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic">未找到订单</h2>
            <p className="text-[10px] text-slate-400 mt-4 font-black tracking-widest uppercase italic">{error || '该订单 ID 在中心数据库中不存在'}</p>
            <button 
                onClick={() => navigate('/driver')}
                className="mt-12 px-12 py-5 bg-white text-slate-900 rounded-[28px] text-[11px] font-black uppercase tracking-[0.4em] shadow-3xl active:scale-95 transition-all font-bold"
            >
                返回列表
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0F172A] text-white selection:bg-sky-500/30">
            {/* Header */}
            <header className="bg-slate-900/60 backdrop-blur-3xl px-8 py-8 h-[100px] sticky top-0 z-50 flex items-center justify-between border-b border-white/5 shadow-2xl">
                <div className="flex items-center gap-6">
                    <button onClick={() => navigate(-1)} className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl text-slate-400 active:scale-90 transition-all hover:bg-white/10">
                        <span className="material-icons-round text-xl">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-base font-black text-white tracking-widest uppercase leading-none mb-1.5">任务详情</h1>
                        <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.3em] font-mono">#{order.order_number || order.id.slice(0, 12)}</p>
                    </div>
                </div>
                <div className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-glow ${statusColors[order.status]}`}>
                    {statusLabels[order.status]}
                </div>
            </header>

            <main className="p-8 max-w-xl mx-auto space-y-10 pb-32 relative z-10">
                {/* 装饰光效 */}
                <div className="fixed -top-40 -left-40 w-96 h-96 bg-sky-600/10 rounded-full blur-[120px] pointer-events-none"></div>
                <div className="fixed -bottom-40 -right-40 w-96 h-96 bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none"></div>


                {/* Mission Payload */}
                <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] pl-6 italic">配送项目清单 / ITEMS</h3>
                    <div className="bg-white/[0.02] border border-white/5 rounded-[48px] shadow-3xl overflow-hidden backdrop-blur-3xl">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="p-8 flex justify-between items-center border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-all group">
                                <div className="space-y-1">
                                    <p className="text-base font-black text-white uppercase tracking-tight italic group-hover:text-sky-400 transition-colors">{item.product_name || item.name}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic opacity-40">ITEM CODE: {item.id.slice(0, 8)}</p>
                                </div>
                                <div className="bg-sky-600/10 px-6 py-3 rounded-2xl border border-sky-500/20 shadow-glow shadow-sky-500/10 active:scale-95 transition-all">
                                    <p className="text-2xl font-black text-white font-mono italic leading-none">x{item.quantity}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Ultra-Compact Unified Info Card: Customer + Financials */}
                <section className="bg-white/[0.03] rounded-[24px] border border-white/5 backdrop-blur-3xl overflow-hidden shadow-2xl">
                    {/* Customer & Logistics Grid */}
                    <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 px-1">
                            <div className="min-w-0">
                                <p className="text-[7px] font-black text-sky-400 uppercase tracking-widest opacity-60 mb-0.5">顾客 / CUSTOMER</p>
                                <h2 className="text-lg font-black text-white tracking-tight uppercase italic truncate">{order.customerName}</h2>
                            </div>
                            <div className="text-right shrink-0">
                                <a 
                                    href={`https://wa.me/${order.customerPhone.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl group hover:bg-emerald-500/20 transition-all font-bold"
                                >
                                    <span className="material-icons-round text-xs text-emerald-500">chat</span>
                                    <p className="text-[10px] font-black text-emerald-400 font-mono italic tracking-tighter">{order.customerPhone}</p>
                                </a>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <a 
                                href={getGoogleMapsUrl(order.address)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex flex-col gap-1 p-3 bg-white/[0.02] rounded-[16px] border border-white/5 group hover:bg-white/[0.04] transition-all"
                            >
                                <div className="flex justify-between items-center">
                                    <span className="material-icons-round text-sky-400 text-sm">place</span>
                                    <span className="text-[6px] font-black text-sky-400 uppercase bg-sky-500/10 px-1 py-0.5 rounded tracking-tighter shadow-glow shadow-sky-500/20">GPS</span>
                                </div>
                                <p className="text-[11px] font-black text-slate-300 leading-tight uppercase italic truncate">{order.address}</p>
                            </a>
                            <div className="flex flex-col gap-1 p-3 bg-white/[0.02] rounded-[16px] border border-white/5">
                                <div className="flex items-center gap-1.5">
                                    <span className="material-icons-round text-slate-500 text-sm">schedule</span>
                                    <span className="text-[6px] font-black text-slate-500 uppercase tracking-tighter">TIME</span>
                                </div>
                                <p className="text-[11px] font-black text-slate-300 font-mono italic truncate">
                                    {order.eventDate || order.dueTime ? (
                                        <>
                                            {order.eventDate && <span>{order.eventDate.split('-').slice(1).join('/')} </span>}
                                            {order.dueTime && <span>{order.dueTime.includes('T') ? new Date(order.dueTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) : order.dueTime}</span>}
                                        </>
                                    ) : '-'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Financial Summary: Streamlined Bottom Bar */}
                    <div className="bg-white p-4 border-t border-slate-200 text-slate-950 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-sky-50/50 to-white -z-10"></div>
                        <div className="flex items-center justify-between gap-4 relative z-10">
                            <div className="flex gap-4">
                                <div>
                                    <p className="text-[7px] font-black uppercase tracking-widest opacity-40 leading-none mb-1">总额</p>
                                    <p className="text-[10px] font-black font-mono leading-none">RM {order.amount.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-[7px] font-black uppercase tracking-widest text-sky-600 leading-none mb-1">定金</p>
                                    <p className="text-[10px] font-black font-mono leading-none text-sky-600">-RM {((order as any).deposit || 0).toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="pl-4 border-l border-slate-900/10 text-right">
                                <p className="text-[8px] font-black uppercase tracking-widest text-sky-600 mb-0.5 leading-none">应收余款</p>
                                <h4 className="text-xl font-black font-mono tracking-tighter italic leading-none">
                                    RM {((order as any).balance ?? (order.amount - ((order as any).deposit || 0))).toFixed(2)}
                                </h4>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Dispatch Comms */}
                {((order as any).remarks || (order as any).remark) && (
                    <section className="p-10 bg-sky-500/10 rounded-[48px] border border-sky-500/20 backdrop-blur-3xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-sky-500 shadow-glow shadow-sky-500/50"></div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center text-white shadow-glow shadow-sky-500/20">
                                <span className="material-icons-round text-xl text-white">sticky_note_2</span>
                            </div>
                            <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-[0.5em]">备注信息 / REMARKS</h4>
                        </div>
                        <p className="text-[16px] font-black text-sky-100 leading-relaxed italic tracking-tight pl-2">
                            "{ (order as any).remarks || (order as any).remark }"
                        </p>
                    </section>
                )}
            </main>
        </div>
    );
};

export default OrderDetail;
