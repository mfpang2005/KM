
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface Driver {
    id: string;
    name: string;
    phone: string;
    status: 'Available' | 'On Duty' | 'Offline';
    activeOrders: any[];
    taskCount: number;
    vehicle: string;
    img: string;
}

interface PendingOrder {
    id: string;
    customer: string;
    address: string;
    time: string;
}

import { supabase } from '../src/lib/supabase';
import { OrderService } from '../src/services/api';
import { OrderStatus } from '../types';

const MOCK_PENDING: PendingOrder[] = [
    { id: 'KL-99201', customer: 'Bangsar Office', address: 'Bangsar South, KL', time: '02:30 PM' },
    { id: 'KL-99205', customer: 'MidValley Event', address: 'The Gardens, MidValley', time: '03:00 PM' },
];

const DriverList: React.FC = () => {
    const navigate = useNavigate();
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [filter, setFilter] = useState<'All' | 'Available' | 'Busy'>('All');
    const [assigningOrder, setAssigningOrder] = useState<PendingOrder | null>(null);

    const fetchData = async () => {
        try {
            // 1. 获取所有的司机数据
            const { data: usersData } = await supabase.from('users').select('*').eq('role', 'driver');

            // 2. 获取所有的订单及关联关系
            const allOrders = await OrderService.getAll();

            if (usersData) {
                const mappedDrivers: Driver[] = usersData.map(u => {
                    // 找出当前司机正在配送的活动的订单 (状态为 DELIVERING 或 READY)
                    const activeOrders = allOrders.filter(o => o.driverId === u.id && (o.status === OrderStatus.DELIVERING || o.status === OrderStatus.READY));
                    // 找出当前司机已指派的当天任务总数
                    const taskCount = allOrders.filter(o => o.driverId === u.id).length;

                    return {
                        id: u.id,
                        name: u.name || '未命名司机',
                        phone: u.phone || '',
                        status: activeOrders.length > 0 ? 'On Duty' : (u.vehicle_status === 'busy' ? 'Available' : 'Offline'), // 若申报了车辆即可接单
                        activeOrders,
                        taskCount,
                        vehicle: u.vehicle_model ? `${u.vehicle_model} (${u.vehicle_plate})` : '未申报车辆',
                        img: u.avatar_url || 'https://via.placeholder.com/150'
                    };
                });
                setDrivers(mappedDrivers);
            }

            // 3. 找出所有已打包完毕(READY)但还未被接单的订单，作为待调度列表
            // 或者：即使已经被分配了 driverId，只要状态还是 READY 的，也可以调度？
            // 按照业务逻辑，如果是 READY 且还需要调度，就放入 pending。
            const pending = allOrders
                .filter(o => o.status === OrderStatus.READY && !o.driverId)
                .map(o => ({
                    id: o.id,
                    customer: o.customerName,
                    address: o.address,
                    time: o.dueTime || '-'
                }));
            setPendingOrders(pending);
        } catch (error) {
            console.error('Failed to fetch drivers and orders data', error);
        }
    };

    React.useEffect(() => {
        fetchData();
        const ch = supabase.channel('driver-list-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const filteredDrivers = useMemo(() => {
        if (filter === 'All') return drivers;
        if (filter === 'Available') return drivers.filter(d => d.status === 'Available');
        return drivers.filter(d => d.status === 'On Duty');
    }, [drivers, filter]);

    const handleAssign = async (driverId: string) => {
        if (!assigningOrder) return;
        try {
            // Update order with driverId and change status to DELIVERING
            // Note: in a real app, maybe driver confirms first. For now, admin forces assign
            await supabase.from('orders').update({
                driverId: driverId,
                status: OrderStatus.DELIVERING
            }).eq('id', assigningOrder.id);
            setAssigningOrder(null);
            fetchData();
        } catch (error) {
            console.error('Failed to assign driver', error);
        }
    };

    const handleWhatsApp = (driver: Driver) => {
        const cleanPhone = driver.phone.replace(/\D/g, '');
        const currentOrder = driver.activeOrders && driver.activeOrders.length > 0 ? driver.activeOrders[0] : null;
        const message = currentOrder
            ? `[金龙餐饮调度] 你好 ${driver.name}, 请确认订单 ${currentOrder.id.slice(0, 8)} (${currentOrder.customerName}) 的配送进度，预计几点到达？`
            : `[金龙餐饮调度] 你好 ${driver.name}, 有新的配送任务准备指派，请回复确认当前位置。`;
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleReassign = async (orderId: string) => {
        if (window.confirm('确认撤回该订单重新调度吗？(Return to pending queue)')) {
            try {
                // Reverse assignment
                await supabase.from('orders').update({
                    driverId: null,
                    status: OrderStatus.READY
                }).eq('id', orderId);
                fetchData();
            } catch (error) {
                console.error('Failed to reassign driver', error);
            }
        }
    };

    const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
        try {
            await supabase.from('orders').update({ status }).eq('id', orderId);
            fetchData();
        } catch (error) {
            console.error('Failed to update order status', error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f6f6] relative">
            <header className="pt-12 pb-4 px-6 bg-white border-b border-slate-100 flex flex-col gap-4 sticky top-0 z-30 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/admin')} className="text-slate-400 p-1 active:scale-90 transition-transform">
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                        <h1 className="text-xl font-black text-slate-800">调度中心</h1>
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

            <main className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32">
                {/* 待指派任务池 */}
                {pendingOrders.length > 0 && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">待指派订单 ({pendingOrders.length})</h2>
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        </div>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            {pendingOrders.map(order => (
                                <div key={order.id} className="min-w-[220px] bg-slate-900 text-white p-5 rounded-[32px] shadow-xl flex flex-col gap-3 border border-white/5">
                                    <div>
                                        <p className="text-[9px] font-black text-primary uppercase mb-1 tracking-widest">Order ID: {order.id}</p>
                                        <h3 className="text-sm font-bold truncate">{order.customer}</h3>
                                        <div className="flex items-start gap-1 mt-1 opacity-60">
                                            <span className="material-icons-round text-[12px]">location_on</span>
                                            <p className="text-[10px] truncate leading-tight">{order.address}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setAssigningOrder(order)}
                                        className="w-full py-2.5 bg-white text-slate-900 rounded-2xl text-[10px] font-black uppercase active:scale-95 transition-transform"
                                    >
                                        立即指派司机
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 司机列表 */}
                <section className="space-y-4">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">车队状态管理 (实时任务详情)</h2>
                    <div className="space-y-4">
                        {filteredDrivers.map((d) => (
                            <div key={d.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-4 animate-in fade-in duration-300">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <img src={d.img} className="w-16 h-16 rounded-[24px] object-cover border-2 border-slate-50 shadow-sm" alt={d.name} />
                                        <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${d.status === 'Available' ? 'bg-green-500' : d.status === 'On Duty' ? 'bg-orange-500' : 'bg-slate-300'
                                            }`}>
                                            <span className="material-icons-round text-white text-[12px]">
                                                {d.status === 'Available' ? 'check' : d.status === 'On Duty' ? 'local_shipping' : 'power_settings_new'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[15px] font-black text-slate-900">{d.name}</h3>
                                            <span className="text-[9px] font-black text-slate-300 uppercase">今日: {d.taskCount}单</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{d.vehicle}</p>

                                        {/* 核心改动：显示正在执行的任务详情 */}
                                        {d.activeOrders && d.activeOrders.length > 0 ? (
                                            <div className="mt-3 space-y-2">
                                                {d.activeOrders.map(order => (
                                                    <div key={order.id} className="bg-orange-50/50 p-2.5 rounded-2xl border border-orange-100 flex flex-col gap-2 animate-in zoom-in duration-300">
                                                        <div>
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest leading-none bg-orange-100/50 px-1.5 py-0.5 rounded-md">{order.status === OrderStatus.DELIVERING ? '配送中 (On Route)' : '待取餐 (Ready/Prep)'}</span>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase">ID: {order.id.slice(0, 8)}</span>
                                                            </div>
                                                            <h4 className="text-[11px] font-black text-slate-800 mt-1.5 leading-tight">{order.customerName}</h4>
                                                            <div className="flex items-start gap-1 mt-0.5">
                                                                <span className="material-icons-round text-[10px] text-slate-400 mt-0.5">place</span>
                                                                <p className="text-[10px] text-slate-500 leading-tight line-clamp-2">{order.address}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1.5 mt-1">
                                                            {order.status !== OrderStatus.DELIVERING && order.status !== OrderStatus.COMPLETED && (
                                                                <button
                                                                    onClick={() => handleUpdateOrderStatus(order.id, OrderStatus.DELIVERING)}
                                                                    className="flex-1 py-2 bg-orange-500 text-white rounded-xl text-[9px] font-black uppercase shadow-sm active:scale-95 transition-transform"
                                                                >
                                                                    出发 Deliver
                                                                </button>
                                                            )}
                                                            {order.status === OrderStatus.DELIVERING && (
                                                                <button
                                                                    onClick={() => handleUpdateOrderStatus(order.id, OrderStatus.COMPLETED)}
                                                                    className="flex-1 py-2 bg-green-500 text-white rounded-xl text-[9px] font-black uppercase shadow-sm active:scale-95 transition-transform"
                                                                >
                                                                    完成 Done
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleReassign(order.id)}
                                                                className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 active:scale-95 transition-transform shadow-sm"
                                                            >
                                                                Recall / 退回
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-2 flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'Offline' ? 'bg-slate-300' : 'bg-green-500 animate-pulse'}`}></span>
                                                <p className={`text-[10px] font-black ${d.status === 'Offline' ? 'text-slate-400' : 'text-green-600'}`}>
                                                    {d.status === 'Offline' ? '离线 (Offline)' : '空闲待命 (Standby)'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    {assigningOrder ? (
                                        <button
                                            disabled={d.status === 'Offline'}
                                            onClick={() => handleAssign(d.id)}
                                            className="flex-1 py-3.5 bg-primary text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:bg-slate-200"
                                        >
                                            指派给 {d.name.split(' ')[0]}
                                        </button>
                                    ) : (
                                        <div className="flex gap-2 w-full justify-end">
                                            <button
                                                onClick={() => window.location.href = `tel:${d.phone}`}
                                                className="flex-1 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center active:scale-90 transition-transform font-bold text-xs gap-1.5"
                                            >
                                                <span className="material-icons-round text-[18px]">phone</span> Call
                                            </button>
                                            <button
                                                onClick={() => handleWhatsApp(d)}
                                                className="flex-1 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center active:scale-90 transition-transform font-bold text-xs gap-1.5"
                                            >
                                                <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-[18px] h-[18px]" alt="WA" /> WhatsApp
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {assigningOrder && (
                <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-900 text-white rounded-t-[40px] z-[40] animate-in slide-in-from-bottom duration-300 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">正在调度订单: {assigningOrder.id}</p>
                        <button onClick={() => setAssigningOrder(null)} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-slate-400">
                            <span className="material-icons-round text-sm">close</span>
                        </button>
                    </div>
                    <p className="text-xs font-bold leading-relaxed mb-4">点击上方列表中的<span className="text-primary font-black">“指派”</span>按钮进行分配。只有空闲或忙碌司机可接受任务。</p>
                </div>
            )}
        </div>
    );
};

export default DriverList;
