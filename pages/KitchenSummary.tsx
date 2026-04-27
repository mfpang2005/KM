import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService } from '../src/services/api';
import { Order, OrderStatus } from '../types';
import { supabase } from '../src/lib/supabase';

interface MonthlyEvent {
    date: string; // format: MM-DD
    title: string;
    itemsCount: number;
    status: 'urgent' | 'normal' | 'large';
    customer?: string;
    orderId?: string;
}

interface AiStats {
    averageMonthlyProduction: number;
    topDishes: { name: string; quantity: number }[];
    insights: string;
}

const KitchenSummary: React.FC = () => {
    const navigate = useNavigate();
    const [view, setView] = useState<'stats' | 'schedule'>('schedule');
    const [aiStats, setAiStats] = useState<AiStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const data = await OrderService.getAll();
            setOrders(data);
        } catch (err) {
            console.error('Failed to fetch orders:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders();
        fetchAiInsights();

        // Real-time listener
        const channel = supabase.channel('kitchen-summary-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchOrders]);

    const fetchAiInsights = async () => {
        // Simplified AI logic for now
        setAiStats({
            averageMonthlyProduction: 4850,
            topDishes: [
                { name: "椰浆饭 (Nasi Lemak)", quantity: 1200 },
                { name: "沙爹鸡肉 (Chicken Satay)", quantity: 850 },
            ],
            insights: "下月预计制作量将超过平均水平 15%，建议提前锁定鸡肉供应商价格。"
        });
    };

    // Calculate weekly load for current month
    const weeklyLoad = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // 4 weeks representation
        const loads = [0, 0, 0, 0]; 
        
        orders.forEach(order => {
            if (!order.dueTime) return;
            const d = new Date(order.dueTime);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                const day = d.getDate();
                const weekIdx = Math.min(Math.floor((day - 1) / 7), 3);
                // Estimate pax/items (if missing, assume 10)
                const pax = order.totalAmount ? Math.floor(order.totalAmount / 10) : 10; 
                loads[weekIdx] += pax;
            }
        });

        // Normalize to 0-100 scale for chart (relative to 1500 per week avg)
        return loads.map(l => Math.min(Math.round((l / 1500) * 100), 100));
    }, [orders]);

    // Map real orders to MonthlyEvent list
    const futureOrders = useMemo(() => {
        const now = new Date();
        return orders
            .filter(o => {
                if (!o.dueTime) return false;
                const d = new Date(o.dueTime);
                return d >= now && o.status !== OrderStatus.COMPLETED;
            })
            .sort((a, b) => new Date(a.dueTime!).getTime() - new Date(b.dueTime!).getTime())
            .slice(0, 10)
            .map(o => ({
                date: o.dueTime!.substring(5, 10), // MM-DD
                title: o.customerName || '未命名订单',
                itemsCount: o.totalAmount ? Math.floor(o.totalAmount / 5) : 10, // Mock pax estimation
                status: (o.totalAmount || 0) > 1000 ? 'large' : 'normal' as any,
                customer: o.customerName,
                orderId: o.id
            }));
    }, [orders]);

    return (
        <div className="flex flex-col h-full bg-[#FDFBF7]">
            {/* 顶栏 (SHRINKED & ALIGNED) */}
            <header className="pt-12 pb-4 px-6 bg-white flex flex-col gap-4 sticky top-0 z-30 border-b border-slate-100/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/super-admin')} className="text-slate-400 active:scale-90 transition-transform">
                            <span className="material-icons-round text-xl">arrow_back</span>
                        </button>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight">后厨计划中心</h1>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                            onClick={() => setView('schedule')}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'schedule' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                        >
                            月度安排
                        </button>
                        <button 
                            onClick={() => setView('stats')}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'stats' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                        >
                            AI 统计
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
                {view === 'schedule' ? (
                    <>
                        {/* 11月 订单负荷预估 - KITCHEN APP STYLE */}
                        <section className="bg-[#1A1B2E] rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-[12px] font-black text-red-500 uppercase tracking-widest">{new Date().getMonth() + 1}月 订单负荷预估</h3>
                                        <p className="text-[10px] text-red-500/60 font-bold">平均每周制作: 1500 份</p>
                                    </div>
                                    <button className="text-[9px] font-black text-white/30 uppercase tracking-widest border border-white/10 px-4 py-1.5 rounded-full">
                                        打开完整日历
                                    </button>
                                </div>

                                {/* Bar Chart */}
                                <div className="flex items-end justify-between h-28 gap-1.5 px-2">
                                    {weeklyLoad.map((h, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                            <div className="w-full bg-white/5 rounded-t-sm h-full flex items-end">
                                                <div 
                                                    className={`w-full transition-all duration-700 ${h >= 80 ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-white/20'} rounded-t-sm`} 
                                                    style={{ height: `${h}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[8px] text-white/30 font-black">W{i+1}</span>
                                        </div>
                                    ))}
                                    {/* Fill the rest to maintain layout if month has 5 weeks */}
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i+4} className="flex-1 flex flex-col items-center gap-2">
                                            <div className="w-full bg-white/5 rounded-t-sm h-full flex items-end">
                                                <div className="w-full bg-white/5 rounded-t-sm" style={{ height: '10%' }}></div>
                                            </div>
                                            <span className="text-[8px] text-white/30 font-black">W{i+5}</span>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[10px] text-white/80 mt-8 font-bold leading-relaxed">
                                    <span className="text-red-500 font-black">AI 智能建议:</span> {aiStats?.insights}
                                </p>
                            </div>
                        </section>

                        {/* 下月核心大单排期 */}
                        <section className="space-y-4 pt-2">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">核心订单排期</h3>
                                <button className="text-[10px] font-black text-red-800 border-b border-red-800/20 uppercase tracking-tighter">视图切换</button>
                            </div>
                            <div className="space-y-3">
                                {futureOrders.length === 0 ? (
                                    <div className="py-12 text-center text-slate-300">
                                        <span className="material-icons-round text-3xl block mb-2">event_busy</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest">暂无未来大单</p>
                                    </div>
                                ) : (
                                    futureOrders.map((event, idx) => (
                                        <div key={idx} className="bg-white p-5 rounded-[40px] border border-slate-100 shadow-sm flex items-center gap-5 transition-all active:scale-[0.98]">
                                            <div className="flex flex-col items-center justify-center w-16 h-16 bg-slate-50 rounded-full border border-slate-100/50 shrink-0">
                                                <span className="text-[20px] font-black text-slate-900 leading-none">{event.date.split('-')[1]}</span>
                                                <span className="text-[10px] font-black text-slate-400 uppercase mt-1">{event.date.split('-')[0]}月</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-[15px] font-black text-slate-800 truncate">{event.title}</h4>
                                                <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                                                    估算分量: <span className="text-slate-900">{event.itemsCount} 份</span>
                                                </p>
                                            </div>
                                            <button 
                                                onClick={() => navigate(`/orders/${event.orderId}`)}
                                                className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center shrink-0"
                                            >
                                                <span className="material-icons-round text-xl">chevron_right</span>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </>
                ) : (
                    <div className="space-y-6">
                        {/* AI Stats Tab Content */}
                        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">平均每月制作单量 (AI 分析)</p>
                            <h2 className="text-5xl font-black text-red-900">{aiStats?.averageMonthlyProduction || "----"}</h2>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default KitchenSummary;
