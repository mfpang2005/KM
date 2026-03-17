
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { OrderService, FleetService, api } from '../src/services/api';
import { OrderStatus, Order } from '../types';

interface FleetDriver {
    id: string;
    name: string;
    phone: string;
    avatar_url?: string;
    activeOrders: Order[];
    completedToday: number;
    vehicle_info?: string;
    status: 'Available' | 'On Duty' | 'Offline';
}

const DriverList: React.FC = () => {
    const navigate = useNavigate();
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'All' | 'Available' | 'Busy'>('All');
    const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState<Order | null>(null);
    const [isAssigningOrder, setIsAssigningOrder] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [fleetData, ordersRes] = await Promise.all([
                FleetService.getFleetStatus(),
                api.get('/orders').catch(() => ({ data: [] }))
            ]);

            const allOrders: Order[] = ('status' in ordersRes && ordersRes.status === 200) ? (ordersRes.data as Order[]) : (ordersRes.data as Order[] || []);
            const today = new Date().toISOString().split('T')[0];

            // Filter pending orders (READY/PREPARING/PENDING but no driver assigned)
            const pending = allOrders.filter(o => 
                (o.status === OrderStatus.READY || o.status === OrderStatus.PREPARING || o.status === OrderStatus.PENDING) && 
                !o.driverId
            );
            setPendingOrders(pending);

            const mappedDrivers: FleetDriver[] = (fleetData || []).map((d: any) => {
                const driverOrders = allOrders.filter(o => o.driverId === d.id);
                const activeAssignment = d.assignments?.find((a: any) => a.status === 'active');
                
                return {
                    id: d.id,
                    name: d.name || '未命名司机',
                    phone: d.phone || '',
                    avatar_url: d.avatar_url,
                    activeOrders: driverOrders.filter(o => o.status === OrderStatus.DELIVERING || o.status === OrderStatus.READY),
                    completedToday: driverOrders.filter(o => 
                        o.status === OrderStatus.COMPLETED && o.created_at?.startsWith(today)
                    ).length,
                    vehicle_info: activeAssignment?.vehicle ? `${activeAssignment.vehicle.model} (${activeAssignment.vehicle.plate_no})` : '未绑定车辆',
                    status: driverOrders.some(o => o.status === OrderStatus.DELIVERING) ? 'On Duty' : (activeAssignment ? 'Available' : 'Offline')
                };
            });

            setDrivers(mappedDrivers);
        } catch (error) {
            console.error('Failed to load fleet data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const channels = [
            supabase.channel('driver-list-users').on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadData()).subscribe(),
            supabase.channel('driver-list-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData()).subscribe(),
            supabase.channel('driver-list-assignments').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_assignments' }, () => loadData()).subscribe()
        ];
        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [loadData]);

    const filteredDrivers = useMemo(() => {
        if (filter === 'All') return drivers;
        if (filter === 'Available') return drivers.filter(d => d.status === 'Available');
        return drivers.filter(d => d.status === 'On Duty');
    }, [drivers, filter]);

    const handleAssignOrder = async (driverId: string) => {
        if (!selectedOrderForAssignment) return;
        setIsAssigningOrder(true);
        try {
            await api.patch(`/orders/${selectedOrderForAssignment.id}`, { 
                driverId, 
                status: OrderStatus.DELIVERING 
            });
            setSelectedOrderForAssignment(null);
            loadData();
        } catch (e: any) {
            alert(`指派订单失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigningOrder(false);
        }
    };

    const handleWhatsAppOrderDetails = (order: Order) => {
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        const itemsList = order.items.map(m => `- ${m.product_name || m.name} (x${m.quantity})`).join('%0A');
        const message = `[金龙餐饮] 订单详情确认%0A----------------------%0A订单编号: ${order.order_number || order.id.slice(0, 8)}%0A客户姓名: ${order.customerName}%0A配送地址: ${order.address}%0A%0A订购项目:%0A${itemsList}%0A%0A合计金额: RM ${(order.amount || 0).toFixed(2)}%0A----------------------%0A感谢您的订购！如有疑问请联系我们。`;
        
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const handleWhatsAppDeparture = (order: Order) => {
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        const message = `[金龙餐饮] 出发通知%0A----------------------%0A尊敬的 ${order.customerName}，您的订单 ${order.order_number || order.id.slice(0, 8)} 司机已整装出发！%0A%0A预计近期送达，请保持电话畅通。%0A配送地址: ${order.address}%0A%0A祝您用餐愉快！`;
        
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const handleWhatsApp = (driver: FleetDriver) => {
        const cleanPhone = driver.phone.replace(/\D/g, '');
        const currentOrder = driver.activeOrders && driver.activeOrders.length > 0 ? driver.activeOrders[0] : null;
        const message = currentOrder
            ? `[金龙餐饮调度] 你好 ${driver.name}, 请确认订单 ${currentOrder.id.slice(0, 8)} (${currentOrder.customerName}) 的配送进度，预计几点到达？`
            : `[金龙餐饮调度] 你好 ${driver.name}, 有新的配送任务准备指派，请回复确认当前位置。`;
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
        try {
            await OrderService.updateStatus(orderId, status);
            loadData();
        } catch (error) {
            console.error('Failed to update order status', error);
        }
    };

    const handleReassign = async (orderId: string) => {
        if (window.confirm('确认撤回该订单重新调度吗？(Return to pending queue)')) {
            try {
                await api.patch(`/orders/${orderId}`, { 
                    driverId: null, 
                    status: OrderStatus.READY 
                });
                loadData();
            } catch (error) {
                console.error('Failed to reassign driver', error);
            }
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center bg-[#f8f6f6]"><div className="animate-spin h-8 w-8 border-b-2 border-slate-900 rounded-full"></div></div>;

    return (
        <div className="flex flex-col h-full bg-[#f8f6f6] relative">
            <header className="pt-12 pb-4 px-6 bg-white border-b border-slate-100 flex flex-col gap-4 sticky top-0 z-30 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/admin')} className="text-slate-400 p-1 active:scale-90 transition-transform">
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                        <h1 className="text-xl font-black text-slate-800">调度中心 <span className="text-blue-600">Dispatch</span></h1>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {['All', 'Available', 'Busy'].map((t) => (
                            <button
                                key={t}
                                onClick={() => setFilter(t as any)}
                                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filter === t ? 'bg-white text-primary shadow-sm' : 'text-slate-400'
                                    }`}
                            >
                                {t === 'All' ? '全部' : t === 'Available' ? '空闲' : '忙碌'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 space-y-10 no-scrollbar pb-32">
                {/* 待指派任务池 (Premium UI Port) */}
                {pendingOrders.length > 0 && (
                    <section className="space-y-6 animate-in slide-in-from-top-4 duration-700">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">待指派订单池 <span className="text-blue-600 ml-2">Pending</span> ({pendingOrders.length})</h2>
                            <div className="h-px flex-1 mx-8 bg-gradient-to-r from-slate-200 to-transparent"></div>
                        </div>
                        <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-4 px-4 font-sans">
                            {pendingOrders.map(order => (
                                <div key={order.id} className="min-w-[300px] bg-white border border-slate-100 p-6 rounded-[2.5rem] shadow-xl shadow-slate-900/5 hover:border-blue-500/30 transition-all flex flex-col gap-5 group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 blur-3xl -mr-12 -mt-12 group-hover:bg-blue-100/50 transition-all"></div>
                                    <div className="flex justify-between items-start relative">
                                        <div>
                                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                                                Order #{order.order_number || order.id.slice(0, 8)}
                                            </p>
                                            <h3 className="text-sm font-black text-slate-800 line-clamp-1">{order.customerName}</h3>
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex flex-col items-center justify-center text-blue-600 border border-blue-100">
                                            <span className="text-[9px] font-black leading-none">{order.dueTime ? new Date(order.dueTime).getHours() : '--'}</span>
                                            <span className="text-[9px] font-black leading-none opacity-50">{order.dueTime ? String(new Date(order.dueTime).getMinutes()).padStart(2, '0') : '--'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 text-slate-500 bg-slate-50/80 p-3 rounded-xl border border-slate-100/50">
                                        <span className="material-icons-round text-blue-400 text-base mt-0.5">location_on</span>
                                        <p className="text-[10px] font-bold leading-relaxed line-clamp-2">{order.address}</p>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedOrderForAssignment(selectedOrderForAssignment?.id === order.id ? null : order)}
                                        className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedOrderForAssignment?.id === order.id ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-slate-900 text-white shadow-lg active:scale-95'}`}
                                    >
                                        {selectedOrderForAssignment?.id === order.id ? '取消指派' : '指派任务'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 司机列表 (Fleet Center Premium Port) */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">车队实时状态 <span className="text-blue-600 ml-2">Fleet Detail</span></h2>
                        <div className="h-px flex-1 mx-8 bg-gradient-to-r from-slate-200 to-transparent"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-8">
                        {filteredDrivers.map(driver => (
                            <div key={driver.id} id={`driver-${driver.id}`} className="group relative bg-slate-900 border border-white/5 rounded-[3rem] p-8 shadow-2xl overflow-hidden transition-all hover:translate-y-[-4px] hover:shadow-blue-500/10">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full group-hover:bg-blue-500/20 transition-all pointer-events-none"></div>
                                
                                <div className="relative flex flex-col md:flex-row gap-8 items-start">
                                    {/* Driver Identity */}
                                    <div className="flex flex-row md:flex-col items-center md:items-start gap-4 shrink-0">
                                        <div className="relative">
                                            <div className="w-20 h-20 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center text-white/20 overflow-hidden shadow-inner">
                                                {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="material-icons-round text-4xl">person</span>}
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-xl border-2 border-slate-900 flex items-center justify-center shadow-xl ${driver.status === 'On Duty' ? 'bg-orange-500' : driver.status === 'Available' ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                                                <span className="material-icons-round text-white text-base">{driver.status === 'On Duty' ? 'local_shipping' : driver.status === 'Available' ? 'check' : 'power_settings_new'}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-white tracking-tight">{driver.name}</h3>
                                            <div className="flex items-center gap-2 mt-1 opacity-60">
                                                <span className="material-icons-round text-blue-400 text-sm">phone</span>
                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{driver.phone || 'No Phone'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status & Tasks Info */}
                                    <div className="flex-1 space-y-6 w-full">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white/5 rounded-[1.5rem] p-4 border border-white/5 backdrop-blur-md">
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">当前车辆 Vehicle</p>
                                                <p className="text-sm font-black text-white font-mono truncate">{driver.vehicle_info || '---'}</p>
                                            </div>
                                            <div className="bg-white/5 rounded-[1.5rem] p-4 border border-white/5 backdrop-blur-md">
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">今日任务 Done</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-xl font-black text-white font-mono">{driver.completedToday}</span>
                                                    <span className="text-[8px] font-black text-slate-500 uppercase">Tasks</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Active Tasks (Specific for Admin) */}
                                        {driver.activeOrders.length > 0 && (
                                            <div className="space-y-3">
                                                {driver.activeOrders.map(o => (
                                                    <div key={o.id} className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">{o.status === OrderStatus.DELIVERING ? 'On Delivery' : 'Preparing'}</p>
                                                                <h4 className="text-xs font-black text-white mt-1">{o.customerName}</h4>
                                                            </div>
                                                            <span className="text-[9px] font-black text-slate-500 font-mono">#{o.order_number || o.id.slice(0, 8)}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {o.status === OrderStatus.READY && (
                                                                <button onClick={() => handleUpdateOrderStatus(o.id, OrderStatus.DELIVERING)} className="flex-1 py-1.5 bg-orange-500 text-white rounded-lg text-[9px] font-black uppercase">出发</button>
                                                            )}
                                                            {o.status === OrderStatus.DELIVERING && (
                                                                <button onClick={() => handleUpdateOrderStatus(o.id, OrderStatus.COMPLETED)} className="flex-1 py-1.5 bg-green-500 text-white rounded-lg text-[9px] font-black uppercase">完成</button>
                                                            )}
                                                            <div className="flex gap-2 w-full mt-1">
                                                                <button onClick={() => handleWhatsAppOrderDetails(o)} className="flex-1 py-1 px-2 bg-emerald-500/10 text-emerald-500 rounded-lg text-[8px] font-black uppercase border border-emerald-500/20">详情</button>
                                                                <button onClick={() => handleWhatsAppDeparture(o)} className="flex-1 py-1 px-2 bg-blue-500/10 text-blue-500 rounded-lg text-[8px] font-black uppercase border border-blue-500/20">通知出发</button>
                                                                <button onClick={() => handleReassign(o.id)} className="px-2 py-1 bg-red-500/10 text-red-500 rounded-lg text-[8px] font-black uppercase border border-red-500/20">撤回</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between gap-4 pt-2">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => window.location.href = `tel:${driver.phone}`} className="w-10 h-10 bg-white/5 hover:bg-white/10 text-blue-400 rounded-xl flex items-center justify-center transition-all border border-white/5 active:scale-95"><span className="material-icons-round text-lg">phone</span></button>
                                                <button onClick={() => handleWhatsApp(driver)} className="w-10 h-10 bg-white/5 hover:bg-white/10 text-green-400 rounded-xl flex items-center justify-center transition-all border border-white/5 active:scale-95"><img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-5 h-5 opacity-70" alt="WA" /></button>
                                            </div>

                                            {selectedOrderForAssignment ? (
                                                <button 
                                                    disabled={isAssigningOrder || driver.status === 'Offline'}
                                                    onClick={() => handleAssignOrder(driver.id)}
                                                    className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all shadow-xl animate-pulse disabled:opacity-30 disabled:animate-none"
                                                >
                                                    {isAssigningOrder ? '指派中...' : `指派给 ${driver.name.split(' ')[0]}`}
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${driver.status === 'Available' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></span>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{driver.status === 'Available' ? 'Standby' : driver.status === 'Offline' ? 'Offline' : 'Busy'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {selectedOrderForAssignment && (
                <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-900 text-white rounded-t-[40px] z-[40] animate-in slide-in-from-bottom duration-300 shadow-2xl border-t border-white/10">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">正在调度模式</p>
                                <h4 className="text-sm font-bold truncate">订单: {selectedOrderForAssignment.customerName}</h4>
                            </div>
                            <button onClick={() => setSelectedOrderForAssignment(null)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-slate-400 active:scale-95">
                                <span className="material-icons-round text-sm">close</span>
                            </button>
                        </div>
                        <p className="text-xs font-bold text-slate-400 leading-relaxed">请在下方列表中点击<span className="text-blue-400 font-black">“指派给 X”</span>来完成分配。任务将实时下发至司机 App。</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverList;
