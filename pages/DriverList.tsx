
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface Driver {
    id: string;
    name: string;
    phone: string;
    status: 'Available' | 'On Duty' | 'Offline';
    currentOrderId: string | null;
    currentOrderDetails?: {
        customer: string;
        address: string;
    };
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

const MOCK_DRIVERS: Driver[] = [
    { 
        id: '1', 
        name: '阿杰 (Ah Jack)', 
        phone: '60123456789', 
        status: 'On Duty', 
        currentOrderId: 'KL-468167', 
        currentOrderDetails: { customer: 'Alice Wong', address: 'KL Sentral, Kuala Lumpur' },
        taskCount: 5, 
        vehicle: 'Toyota Hiace (VNZ 8821)', 
        img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZnnLYlTfkxNz0bDfw9XrL63qvDkeps9ojYKowAsW6_ibm2prNRJ9pQeAdh0jje0WmIYPEZ9gt1HJOwCgCIUQQQC1FrEvlBa6czn2RSPcTGPdqXT8wzi8TnvuNXaRXK-tpg_kicZ6JoGRysicOIiBoY_Fpn1BaE4iQ4MYOvlxb-zYTVTt_DFVBBEYCf77OjEGCfqp-8jy1yT0OHey_bJ9oNyzKucAx8rM0VX3F43wPKJqkHiFfkWPR9YVULi4S2TInyYyQTAlHTOka' 
    },
    { 
        id: '2', 
        name: 'Ali Ahmad', 
        phone: '60198765432', 
        status: 'Available', 
        currentOrderId: null, 
        taskCount: 2, 
        vehicle: 'Lorry 3-Ton (BCC 4492)', 
        img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCr1A0UkYD47bPyjINVhOMMiB-pdO6Vk9GkIst7TGBPcENh6mor-beIE0m-zai1jb8ISvg0dfAHur75hz38kljvdLDYDhZL-2ExznnuKSVz_DC0ZJEAL2uTdFO5HUVg3AYRyECUgerFv4RSqf8DUrKNHpID4Dd5JhD0TnTCZbd2A9ZDW4MCHQT65EjZTHjvSdZf_OqT0CAh_1IQOS7JVmm59EG9tT5QDfeexTdpUkUFKHXXnZwE66rkmWOuJ0Q7WWSPtN1nUcxBxRf' 
    },
    { 
        id: '3', 
        name: 'Tan Wei', 
        phone: '60172233445', 
        status: 'Offline', 
        currentOrderId: null, 
        taskCount: 0, 
        vehicle: 'Van (WWR 1102)', 
        img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDLlyYiZxjedNYrM_16MJem_-z8phukD8Y0feARWqrmek1SnFPW4HVi7sm7VddsZtD-UU756Kogt_EUqpzfEUqXDDKMI3s2g6IxxLz3NBeqHkMSSCG0Cf-z3HYu02DWkNOFWb-bA9YVclQyaW35kBs0WTXA2ImEqpPqbRazqVCsx-z2c2OHILM7zBpNigWz9_gIcnizGf9SOcVa0elsIXsnl6J_ZOWF6G9MeORyCWaoUvIAua6w0WMg-Z4HRcPizWY5q-0CMfhjjIz8' 
    },
];

const MOCK_PENDING: PendingOrder[] = [
    { id: 'KL-99201', customer: 'Bangsar Office', address: 'Bangsar South, KL', time: '02:30 PM' },
    { id: 'KL-99205', customer: 'MidValley Event', address: 'The Gardens, MidValley', time: '03:00 PM' },
];

const DriverList: React.FC = () => {
    const navigate = useNavigate();
    const [drivers, setDrivers] = useState<Driver[]>(MOCK_DRIVERS);
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>(MOCK_PENDING);
    const [filter, setFilter] = useState<'All' | 'Available' | 'Busy'>('All');
    const [assigningOrder, setAssigningOrder] = useState<PendingOrder | null>(null);

    const filteredDrivers = useMemo(() => {
        if (filter === 'All') return drivers;
        if (filter === 'Available') return drivers.filter(d => d.status === 'Available');
        return drivers.filter(d => d.status === 'On Duty');
    }, [drivers, filter]);

    const handleAssign = (driverId: string) => {
        if (!assigningOrder) return;
        setDrivers(prev => prev.map(d => 
            d.id === driverId 
            ? { 
                ...d, 
                status: 'On Duty', 
                currentOrderId: assigningOrder.id, 
                currentOrderDetails: { customer: assigningOrder.customer, address: assigningOrder.address },
                taskCount: d.taskCount + 1 
            } 
            : d
        ));
        setPendingOrders(prev => prev.filter(o => o.id !== assigningOrder.id));
        setAssigningOrder(null);
    };

    const handleWhatsApp = (driver: Driver) => {
        // WhatsApp API 要求电话号码不含 + 号或前导零，仅数字
        const cleanPhone = driver.phone.replace(/\D/g, '');
        const message = driver.currentOrderId 
            ? `[金龙餐饮调度] 你好 ${driver.name}, 请确认订单 ${driver.currentOrderId} (${driver.currentOrderDetails?.customer}) 的配送进度，预计几点到达？`
            : `[金龙餐饮调度] 你好 ${driver.name}, 有新的配送任务准备指派，请回复确认当前位置。`;
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleReassign = (driverId: string) => {
        const driver = drivers.find(d => d.id === driverId);
        if (driver && driver.currentOrderId) {
            setPendingOrders(prev => [
                ...prev, 
                { 
                    id: driver.currentOrderId!, 
                    customer: driver.currentOrderDetails?.customer || '未知客户', 
                    address: driver.currentOrderDetails?.address || '重新指派中', 
                    time: 'ASAP' 
                }
            ]);
            setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, status: 'Available', currentOrderId: null, currentOrderDetails: undefined } : d));
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
                                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                    filter === t ? 'bg-white text-primary shadow-sm' : 'text-slate-400'
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
                                        <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${
                                            d.status === 'Available' ? 'bg-green-500' : d.status === 'On Duty' ? 'bg-orange-500' : 'bg-slate-300'
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
                                        {d.currentOrderId ? (
                                            <div className="mt-3 bg-orange-50/50 p-3 rounded-2xl border border-orange-100 animate-in zoom-in duration-300">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="text-[9px] font-black text-orange-600 uppercase">任务进行中</span>
                                                    <div className="h-px flex-1 bg-orange-200"></div>
                                                </div>
                                                <h4 className="text-[11px] font-black text-slate-800">{d.currentOrderDetails?.customer}</h4>
                                                <p className="text-[10px] text-slate-500 truncate mt-0.5">{d.currentOrderDetails?.address}</p>
                                                <p className="text-[9px] font-black text-primary mt-1">Order: {d.currentOrderId}</p>
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
                                        <>
                                            {d.status === 'On Duty' && (
                                                <button 
                                                    onClick={() => handleReassign(d.id)}
                                                    className="flex-1 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase active:scale-95 transition-all"
                                                >
                                                    改派/回收
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => window.location.href = `tel:${d.phone}`}
                                                className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
                                            >
                                                <span className="material-icons-round text-[18px]">phone</span>
                                            </button>
                                            <button 
                                                onClick={() => handleWhatsApp(d)}
                                                className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
                                            >
                                                <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-5 h-5" alt="WA" />
                                            </button>
                                        </>
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
