import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminOrderService } from '../services/api';
import type { Order } from '../types';
import { OrderStatus } from '../types';

const KitchenCalendarPage: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
    const [viewMonth, setViewMonth] = useState(new Date());

    useEffect(() => {
        const loadOrders = async () => {
            try {
                const data = await AdminOrderService.getAll();
                setOrders(data);
            } catch (error) {
                console.error("Failed to load orders for calendar:", error);
            } finally {
                setLoading(false);
            }
        };
        loadOrders();
    }, []);

    // ── 数据转换：将订单按日期分组 ──────────────────────────────────────────
    const groupedOrders = useMemo(() => {
        const groups: Record<string, Order[]> = {};
        orders.forEach(order => {
            if (order.dueTime) {
                const dateKey = order.dueTime.split('T')[0];
                if (!groups[dateKey]) groups[dateKey] = [];
                groups[dateKey].push(order);
            }
        });
        return groups;
    }, [orders]);

    // ── 统计数据 ─────────────────────────────────────────────────────────────
    // ... stats calculation removed as it was not used or used for load index

    // ── 日历生成逻辑 ─────────────────────────────────────────────────────────
    const renderCalendar = () => {
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        // 填充上月空白
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="h-24 bg-slate-50/30 rounded-2xl border border-transparent"></div>);
        }

        // 填充本月日期
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dateOrders = groupedOrders[dateStr] || [];
            const isSelected = selectedDate === dateStr;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            days.push(
                <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`h-24 p-2 rounded-2xl border transition-all flex flex-col items-start gap-1 relative group ${isSelected
                        ? 'bg-white border-blue-500 shadow-xl shadow-blue-500/10 z-10 -translate-y-1'
                        : isToday
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-lg'
                        }`}
                >
                    <span className={`text-xs font-black ${isSelected ? 'text-blue-600' : isToday ? 'text-blue-500' : 'text-slate-400'}`}>
                        {day}
                    </span>
                    <div className="flex flex-col gap-1 w-full overflow-hidden">
                        {dateOrders.slice(0, 2).map((o, idx) => (
                            <div key={idx} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md truncate w-full ${o.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                {o.customerName}
                            </div>
                        ))}
                        {dateOrders.length > 2 && (
                            <span className="text-[7px] font-black text-slate-400 ml-1">+{dateOrders.length - 2} more</span>
                        )}
                    </div>
                    {dateOrders.length > 0 && (
                        <div className="absolute top-2 right-2 flex gap-0.5">
                            <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                        </div>
                    )}
                </button>
            );
        }

        return (
            <div className="grid grid-cols-7 gap-3">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-[10px] font-black text-slate-400 text-center py-2 uppercase tracking-widest">{d}</div>
                ))}
                {days}
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Header / Month Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Kitchen Schedule</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Plan and monitor catering delivery flows</p>
                </div>
                <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                    <button
                        onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1))}
                        className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                    >
                        <span className="material-icons-round">chevron_left</span>
                    </button>
                    <span className="text-sm font-black text-slate-700 min-w-[120px] text-center">
                        {viewMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                        onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1))}
                        className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                    >
                        <span className="material-icons-round">chevron_right</span>
                    </button>
                    <div className="w-px h-6 bg-slate-100 mx-1"></div>
                    <button
                        onClick={() => setViewMonth(new Date())}
                        className="px-3 py-1 text-[10px] font-black text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        TODAY
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 日历主视图 */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-[32px] border border-white/50 shadow-xl shadow-slate-200/20">
                        {loading ? (
                            <div className="h-[400px] flex items-center justify-center">
                                <div className="animate-spin h-8 w-8 border-b-2 border-blue-500 rounded-full"></div>
                            </div>
                        ) : renderCalendar()}
                    </div>

                    {/* AI Insights (移植自 KitchenSummary) */}
                    <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden group">
                        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] group-hover:bg-blue-500/30 transition-colors duration-500"></div>
                        <div className="flex items-center gap-4 mb-6 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                                <span className="material-icons-round text-2xl">auto_awesome</span>
                            </div>
                            <div>
                                <h3 className="text-base font-black tracking-tight">AI Kitchen Insights</h3>
                                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-0.5">Automated Resource Forecasting</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                            <div className="space-y-4">
                                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                    Based on the <span className="text-white font-black">{orders.length}</span> active orders for this period, our AI predicts a production peak around <span className="text-blue-400 font-bold">W{Math.ceil(new Date().getDate() / 7)}</span>.
                                    Suggested to pre-order <span className="text-blue-400">20% extra</span> protein stock for upcoming weekend events.
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
                                        <p className="text-[8px] text-slate-400 font-black uppercase">Load Index</p>
                                        <p className="text-sm font-black text-white">Moderate (64%)</p>
                                    </div>
                                    <div className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
                                        <p className="text-[8px] text-slate-400 font-black uppercase">Staff Requirement</p>
                                        <p className="text-sm font-black text-white">Full Team</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Monthly Trend</p>
                                <div className="flex items-end gap-1.5 h-20">
                                    {[30, 45, 80, 50, 65, 40, 90, 75, 45, 60, 55, 30].map((v, i) => (
                                        <div key={i} className="flex-1 bg-white/10 rounded-t-sm h-full flex items-end">
                                            <div
                                                className={`w-full ${v > 80 ? 'bg-blue-500' : 'bg-white/40'} transition-all`}
                                                style={{ height: `${v}%` }}
                                            ></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 选定日期详情 */}
                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-[32px] shadow-xl border border-slate-100 flex flex-col h-full sticky top-24">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                                    {selectedDate ? new Date(selectedDate).toLocaleDateString('default', { month: 'short', day: 'numeric' }) : 'Select a Date'}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Daily Production Schedule</p>
                            </div>
                            {selectedDate && groupedOrders[selectedDate] && (
                                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black">
                                    {groupedOrders[selectedDate].length} Orders
                                </span>
                            )}
                        </div>

                        <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar pr-2 min-h-[400px]">
                            {selectedDate && groupedOrders[selectedDate] ? (
                                groupedOrders[selectedDate].map((order, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => navigate('/orders')}
                                        className="bg-slate-50 p-5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-white transition-all cursor-pointer group active:scale-95"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-sm font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{order.customerName}</h4>
                                            <span className="material-icons-round text-slate-300 text-sm">open_in_new</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
                                                <span className="material-icons-round text-[12px]">schedule</span>
                                                {new Date(order.dueTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
                                                <span className="material-icons-round text-[12px]">restaurant</span>
                                                {order.items.length} dishes
                                            </p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${order.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-600' :
                                                order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' :
                                                    'bg-blue-100 text-blue-600'
                                                }`}>
                                                {order.status}
                                            </span>
                                            <p className="text-[10px] font-black text-slate-900">RM {order.amount.toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center py-20 px-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                        <span className="material-icons-round text-3xl">event_available</span>
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">No events scheduled</p>
                                    <p className="text-[10px] font-bold mt-2">Try selecting another date to view the production plan.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KitchenCalendarPage;
