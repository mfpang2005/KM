import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import 'react-datepicker/dist/react-datepicker.css';
import { AdminOrderService, SuperAdminService } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, User } from '../types';
import { OrderStatus } from '../types';

const KitchenCalendarPage: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [drivers, setDrivers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
    const [viewMonth, setViewMonth] = useState(new Date());

    const loadOrders = async () => {
        try {
            const data = await AdminOrderService.getAll();
            setOrders(data);
        } catch (error) {
            console.error("Failed to load orders for calendar:", error);
        }
    };

    const loadDrivers = async () => {
        try {
            const data = await SuperAdminService.getUsers();
            setDrivers(data.filter((u: User) => u.role === 'driver'));
        } catch (error) {
            console.error("Failed to load drivers:", error);
        }
    };

    useEffect(() => {
        setLoading(true);
        // NOTE: Promise.all 配合单独的 catch，记录失败但不阻塞 Promise.all 的完成
        Promise.all([
            loadOrders().catch(e => console.error("Orders load failed", e)),
            loadDrivers().catch(e => console.error("Drivers load failed", e))
        ]).finally(() => setLoading(false));

        // NOTE: Supabase Realtime 监听，实现日历实时同步
        const channel = supabase.channel('calendar-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    loadOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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

    // ── 日历生成逻辑 ─────────────────────────────────────────────────────────
    const renderCalendar = () => {
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="h-24 bg-slate-50/30 rounded-2xl border border-transparent"></div>);
        }

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
                    </div>
                    {dateOrders.length > 0 && (
                        <div className="absolute top-2 right-2 flex gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
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
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Calendar Monitoring</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Real-time catering order & dispatch schedule</p>
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

                    {/* Driver & Vehicle Monitoring Section */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-teal-500 flex items-center justify-center text-white">
                                    <span className="material-icons-round">local_shipping</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-800">Vehicle & Driver Dispatch</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Real-time Availability</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {drivers.map(driver => {
                                const activeOrders = orders.filter(o => o.driverId === driver.id && o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.READY);
                                const isBusy = activeOrders.length > 0;
                                return (
                                    <div key={driver.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-md transition-all">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                                                    {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="material-icons-round text-slate-400">person</span>}
                                                </div>
                                                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isBusy ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-800 truncate">{driver.name || driver.email}</p>
                                                <p className={`text-[9px] font-bold ${isBusy ? 'text-orange-500' : 'text-green-600'}`}>
                                                    {isBusy ? 'In Delivery' : 'Available'}
                                                </p>
                                            </div>
                                        </div>
                                        {isBusy && (
                                            <div className="px-2 py-1 bg-white rounded-lg border border-slate-100">
                                                <p className="text-[8px] font-black text-slate-400 uppercase">Assigned Order</p>
                                                <p className="text-[9px] font-bold text-slate-700 truncate">{activeOrders[0].customerName}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
                                                <span className="material-icons-round text-[12px]">local_shipping</span>
                                                {order.driverId ? drivers.find(d => d.id === order.driverId)?.name || 'Assigned' : 'Unassigned'}
                                            </p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${order.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-600' :
                                                order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' :
                                                    'bg-blue-100 text-blue-600'
                                                }`}>
                                                {order.status}
                                            </span>
                                            <p className="text-[10px] font-black text-slate-900">RM {order.amount?.toFixed(2) || '0.00'}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center py-20 px-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                        <span className="material-icons-round text-3xl">event_available</span>
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">No events scheduled</p>
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
