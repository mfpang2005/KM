import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { Order, OrderStatus } from '../types';

const EventCalendar: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [viewMonth, setViewMonth] = useState(new Date());
    const [userRole, setUserRole] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Fetch orders from Supabase (Real-time linkage)
    const loadOrders = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .order('dueTime', { ascending: true });
            
            if (error) throw error;
            setOrders(data || []);
        } catch (error) {
            console.error("Failed to load orders for calendar:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();

        // Fetch current user role
        const fetchRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                if (profile) setUserRole(profile.role);
            }
        };
        fetchRole();

        // Realtime subscription
        const channel = supabase.channel('mobile-calendar-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Group orders by date
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

    // Calendar logic
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const monthName = viewMonth.toLocaleString('default', { month: 'long' });

    const prevMonth = () => setViewMonth(new Date(year, month - 1));
    const nextMonth = () => setViewMonth(new Date(year, month + 1));

    const selectedDayOrders = groupedOrders[selectedDate] || [];

    return (
        <>
            <div className="min-h-full bg-background-beige pb-20 animate-in fade-in duration-500">
            {/* Header */}
            <div className="p-6 pb-2">
                <div className="flex items-center justify-between mb-6">
                    <button 
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 active:scale-95 transition-all"
                    >
                        <span className="material-icons-round">chevron_left</span>
                    </button>
                    <div className="text-center">
                        <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">活动日历</h1>
                        <p className="text-[10px] font-black text-blue-600 tracking-[0.2em] uppercase">Event Calendar</p>
                    </div>
                    <button 
                        onClick={loadOrders}
                        className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 active:scale-95 transition-all"
                    >
                        <span className="material-icons-round text-lg">refresh</span>
                    </button>
                </div>

                {/* Month Selector */}
                <div className="flex items-center justify-between bg-white/60 backdrop-blur-md p-2 rounded-2xl border border-white shadow-sm mb-4">
                    <button onClick={prevMonth} className="p-2 text-slate-400 active:scale-90"><span className="material-icons-round">chevron_left</span></button>
                    <span className="text-sm font-black text-slate-800 uppercase tracking-widest">{monthName} {year}</span>
                    <button onClick={nextMonth} className="p-2 text-slate-400 active:scale-90"><span className="material-icons-round">chevron_right</span></button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="px-4">
                <div className="bg-white rounded-[32px] p-4 shadow-xl shadow-slate-200/20 border border-white/50">
                    <div className="grid grid-cols-7 mb-2">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                            <div key={`${d}-${i}`} className="text-center text-[10px] font-black text-slate-300 py-2">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                            <div key={`empty-${i}`} className="h-10"></div>
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const d = i + 1;
                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isSelected = selectedDate === dateStr;
                            const hasEvents = (groupedOrders[dateStr]?.length || 0) > 0;
                            const isToday = new Date().toISOString().split('T')[0] === dateStr;

                            return (
                                <button
                                    key={d}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`h-11 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-90 ${
                                        isSelected 
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                                        : isToday 
                                            ? 'bg-blue-50 text-blue-600 font-black' 
                                            : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className={`text-xs font-black ${isSelected ? 'text-white' : ''}`}>{d}</span>
                                    {hasEvents && !isSelected && (
                                        <div className={`w-1 h-1 rounded-full mt-0.5 ${isToday ? 'bg-blue-600' : 'bg-blue-400/60'}`}></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Event List */}
            <div className="mt-8 px-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                        {selectedDate === new Date().toISOString().split('T')[0] ? '今日活动' : `${selectedDate.split('-')[2]}日 活动`}
                    </h2>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                        {selectedDayOrders.length} Events
                    </span>
                </div>

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[10px] font-black uppercase tracking-widest">加载中...</p>
                    </div>
                ) : selectedDayOrders.length > 0 ? (
                    selectedDayOrders.map((order, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => {
                                        if (userRole === 'KITCHEN') {
                                            setSelectedOrder(order);
                                        } else {
                                            navigate(`/orders/${order.id}`);
                                        }
                                    }}
                                    className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between active:scale-[0.98] transition-all"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                                            order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                                        }`}>
                                            <span className="text-xs font-black leading-none">
                                                {new Date(order.dueTime).getHours().toString().padStart(2, '0')}
                                            </span>
                                            <span className="text-[8px] font-black uppercase opacity-60">
                                                {new Date(order.dueTime).getMinutes().toString().padStart(2, '0')}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{order.customerName}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                                    order.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-600' :
                                                    order.status === OrderStatus.PREPARING ? 'bg-blue-100 text-blue-600' :
                                                    'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {order.status}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400 truncate">{order.address.split(',')[0]}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="material-icons-round text-slate-200">chevron_right</span>
                                </div>
                            ))
                        ) : (
                            <div className="py-20 bg-white/40 rounded-[32px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                                <span className="material-icons-round text-4xl mb-2">event_busy</span>
                                <p className="text-[10px] font-black uppercase tracking-widest">今日暂无安排</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Order Detail Popup for Kitchen */}
                {selectedOrder && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div 
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
                            onClick={() => setSelectedOrder(null)}
                        />
                        <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
                            {/* Popup Header */}
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                        <span className="material-icons-round">receipt_long</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">订单详情</h4>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{selectedOrder.id.slice(0, 8)}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedOrder(null)}
                                    className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-400"
                                >
                                    <span className="material-icons-round text-lg">close</span>
                                </button>
                            </div>

                            {/* Popup Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Customer Info */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">顾客姓名</span>
                                        <p className="text-base font-black text-slate-800 uppercase italic">{selectedOrder.customerName}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">配送时间</span>
                                        <p className="text-sm font-black text-blue-600 uppercase italic">
                                            {new Date(selectedOrder.dueTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="space-y-3">
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">菜品清单 / ITEMS</h5>
                                    <div className="space-y-2">
                                        {selectedOrder.items && selectedOrder.items.length > 0 ? (
                                            selectedOrder.items.map((item, i) => (
                                                <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <span className="text-sm font-black text-slate-700 uppercase italic">{item.product_name || item.name}</span>
                                                    <span className="bg-white px-3 py-1 rounded-xl border border-slate-200 text-xs font-black text-slate-800 italic shadow-sm">x{item.quantity}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-center py-4 text-[10px] font-black text-slate-300 uppercase italic">未找到菜品明细</p>
                                        )}
                                    </div>
                                </div>

                                {/* Remarks */}
                                {(selectedOrder as any).remarks && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="material-icons-round text-amber-500 text-sm">sticky_note_2</span>
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">备注</span>
                                        </div>
                                        <p className="text-xs font-bold text-amber-800 italic">{(selectedOrder as any).remarks}</p>
                                    </div>
                                )}
                            </div>

                            {/* Popup Footer */}
                            <div className="p-6 bg-slate-50 border-t border-slate-100">
                                <button 
                                    onClick={() => setSelectedOrder(null)}
                                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
                                >
                                    我知道了
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    };

export default EventCalendar;
