import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService } from '../src/services/api';
import { Order, OrderStatus, PaymentMethod } from '../types';

import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { getGoogleMapsUrl } from '../src/utils/maps';

interface Vehicle {
    id: string;
    model: string;
    plate: string;
    type: string;
    status: 'good' | 'maintenance';
}

const MOCK_VEHICLES: Vehicle[] = [
    { id: 'v1', model: 'Toyota Hiace', plate: 'VNZ 8821', type: '冷链运输', status: 'good' },
    { id: 'v2', model: 'Lorry 3-Ton', plate: 'BCC 4492', type: '常温大货', status: 'good' },
    { id: 'v3', model: 'Nissan Urvan', plate: 'WWR 1102', type: '市区小型', status: 'maintenance' },
];

const DriverSchedule: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [currentView, setCurrentView] = useState<'tasks' | 'history' | 'profile'>('tasks');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [notifiedOrders, setNotifiedOrders] = useState<Set<string>>(new Set());
    const [now, setNow] = useState(new Date());

    // Profile State
    const [driverName, setDriverName] = useState('阿杰');
    const [driverPhone, setDriverPhone] = useState('6012345678');
    const [driverImg, setDriverImg] = useState('https://lh3.googleusercontent.com/aida-public/AB6AXuDZnnLYlTfkxNz0bDfw9XrL63qvDkeps9ojYKowAsW6_ibm2prNRJ9pQeAdh0jje0WmIYPEZ9gt1HJOwCgCIUQQQC1FrEvlBa6czn2RSPcTGPdqXT8wzi8TnvuNXaRXK-tpg_kicZ6JoGRysicOIiBoY_Fpn1BaE4iQ4MYOvlxb-zYTVTt_DFVBBEYCf77OjEGCfqp-8jy1yT0OHey_bJ9oNyzKucAx8rM0VX3F43wPKJqkHiFfkWPR9YVULi4S2TInyYyQTAlHTOka');

    // Vehicle State
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle>(MOCK_VEHICLES[0]);
    const [isVehicleDeclaring, setIsVehicleDeclaring] = useState(false);
    const [declaredTime, setDeclaredTime] = useState<string | null>(null);

    // PTT States
    const [isPttOpen, setIsPttOpen] = useState(false);
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [pttStatus, setPttStatus] = useState<'IDLE' | 'CONNECTING' | 'LISTENING' | 'TALKING'>('IDLE');

    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sessionRef = useRef<any>(null);

    const fetchOrders = async () => {
        try {
            const allOrders = await OrderService.getAll();
            // Driver sees orders that are READY (to handle) or DELIVERING (handling) or COMPLETED (history)
            // Filter might be better done in backend for performance, but frontend filter ok for now
            setOrders(allOrders);
        } catch (error) {
            console.error("Failed to fetch driver orders", error);
        }
    };

    useEffect(() => {
        fetchOrders();
        const timer = setInterval(() => {
            setNow(new Date());
            fetchOrders();
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const taskOrders = useMemo(() => orders.filter(o =>
        o.status === OrderStatus.READY || o.status === OrderStatus.DELIVERING
    ), [orders]);

    const historyOrders = useMemo(() => orders.filter(o => o.status === OrderStatus.COMPLETED), [orders]);

    const activeOrder = taskOrders.find(o => o.status === OrderStatus.DELIVERING) || taskOrders[0]; // If no delivering, show first ready
    const upcomingOrders = taskOrders.filter(o => o.id !== activeOrder?.id);

    const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
        try {
            await OrderService.updateStatus(orderId, status);
            fetchOrders();
        } catch (e) {
            console.error("Failed to update status", e);
        }
    };

    const isNoticeTime = useMemo(() => {
        if (!activeOrder || !activeOrder.dueTime) return false;
        try {
            const [time, period] = activeOrder.dueTime.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            const due = new Date();
            due.setHours(hours, minutes, 0);
            const diffMins = Math.floor((due.getTime() - now.getTime()) / 60000);
            return diffMins <= 30 && diffMins > 0;
        } catch (e) { return false; }
    }, [activeOrder, now]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setDriverImg(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const startPttSession = async () => {
        setPttStatus('CONNECTING');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: "你现在是金龙餐饮的总台调度员。你正在通过对讲机与司机交流。回复要简短专业，像真正的对讲机通话。Over。"
                },
                callbacks: {
                    onopen: () => setPttStatus('IDLE'),
                    onmessage: async (message: LiveServerMessage) => {
                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData && audioContextRef.current) {
                            setPttStatus('LISTENING');
                            const bytes = atob(audioData);
                            const array = new Uint8Array(bytes.length);
                            for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
                            const dataInt16 = new Int16Array(array.buffer);
                            const buffer = audioContextRef.current.createBuffer(1, dataInt16.length, 24000);
                            const channelData = buffer.getChannelData(0);
                            for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
                            const source = audioContextRef.current.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioContextRef.current.destination);
                            source.onended = () => setPttStatus('IDLE');
                            source.start();
                        }
                    },
                    onclose: () => setPttStatus('IDLE'),
                    onerror: () => setPttStatus('IDLE')
                }
            });
            sessionRef.current = await sessionPromise;
        } catch (e) {
            setPttStatus('IDLE');
        }
    };

    const handlePttDown = () => { if (sessionRef.current) { setIsTransmitting(true); setPttStatus('TALKING'); } };
    const handlePttUp = () => { setIsTransmitting(false); setPttStatus('IDLE'); };
    const stopPttSession = () => { sessionRef.current?.close(); streamRef.current?.getTracks().forEach(t => t.stop()); setIsPttOpen(false); setPttStatus('IDLE'); };

    const handleWhatsApp = (order: Order, type: 'general' | 'arrival' = 'general') => {
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        let message = `你好 ${order.customerName}，我是金龙餐饮的配送司机。我正在配送您的订单 ${order.id}，预计于 ${order.dueTime} 左右到达。`;
        if (type === 'arrival') {
            message = `【抵达预告】你好 ${order.customerName}，我是金龙餐饮司机。您的订单 ${order.id} 预计将在 30 分钟内抵达 (${order.address})，请准备签收。`;
            setNotifiedOrders(prev => new Set(prev).add(order.id));
        }
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleDeclareVehicle = (vehicle: Vehicle) => {
        setSelectedVehicle(vehicle);
        setDeclaredTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setIsVehicleDeclaring(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f6f6] relative">
            <header className="pt-12 pb-6 px-6 bg-white sticky top-0 z-30 shadow-sm flex items-center justify-between no-print">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20 p-0.5">
                        <img src={driverImg} className="w-full h-full object-cover rounded-full" alt="Driver" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">{driverName}, 你好!</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {currentView === 'tasks' ? `今日配送: ${taskOrders.length} 趟` : currentView === 'history' ? `累计交付: ${historyOrders.length} 趟` : '个人资料管理'}
                        </p>
                    </div>
                </div>
                {currentView === 'tasks' && (
                    <div className="flex gap-2">
                        <button onClick={() => { window.location.href = `tel:${driverPhone}`; }} className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90">
                            <span className="material-icons-round text-sm">headset_mic</span>
                        </button>
                        <button onClick={() => { if (!isPttOpen) { setIsPttOpen(true); startPttSession(); } }} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-90 ${isPttOpen ? 'bg-primary text-white animate-pulse' : 'bg-white text-slate-400 border border-slate-100'}`}>
                            <span className="material-icons-round text-sm">radio</span>
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32 no-print">
                {currentView === 'tasks' && (
                    <>
                        {activeOrder && (
                            <section>
                                <div className="flex items-center justify-between px-2 mb-3">
                                    <h2 className="text-[10px] font-black text-primary uppercase tracking-widest">正在配送 (ACTIVE)</h2>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeOrder.dueTime} 交付</span>
                                </div>
                                <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden relative">
                                    <div className={`px-6 py-2 flex items-center justify-between transition-colors ${notifiedOrders.has(activeOrder.id) ? 'bg-green-500 text-white' : isNoticeTime ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="material-icons-round text-sm">{notifiedOrders.has(activeOrder.id) ? 'check_circle' : 'notifications'}</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider">
                                                {notifiedOrders.has(activeOrder.id) ? '已告知客人即将抵达' : isNoticeTime ? '建议发送抵达预告' : '系统监控中...'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-6 bg-white space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{activeOrder.customerName}</h3>
                                                <p className="text-[10px] font-black text-slate-300 uppercase mt-1 tracking-widest">ORDER: {activeOrder.id}</p>
                                            </div>
                                            <button onClick={() => setSelectedOrder(activeOrder)} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 active:scale-95 transition-transform">
                                                <span className="material-icons-round">inventory_2</span>
                                            </button>
                                        </div>


                                        // ... (in component)
                                        <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                                            <span className="material-icons-round text-primary mt-0.5">place</span>
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-slate-600 leading-relaxed">{activeOrder.address}</p>
                                                <a
                                                    href={getGoogleMapsUrl(activeOrder.address)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 mt-2 text-[10px] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded-lg active:scale-95 transition-transform"
                                                >
                                                    <span className="material-icons-round text-xs">navigation</span>
                                                    Google Maps 导航
                                                </a>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => handleWhatsApp(activeOrder, 'arrival')} className={`py-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all border-2 ${notifiedOrders.has(activeOrder.id) ? 'bg-green-50 border-green-100 text-green-600' : 'bg-primary/5 border-primary text-primary shadow-lg shadow-primary/10'}`}>
                                                <span className="material-icons-round text-sm">near_me</span> 抵达预告
                                            </button>
                                            <button onClick={() => { window.location.href = `tel:${activeOrder.customerPhone}`; }} className="py-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase border border-blue-100">
                                                <span className="material-icons-round text-sm">phone</span> 拨号
                                            </button>
                                        </div>
                                        {activeOrder.status === OrderStatus.READY ? (
                                            <button onClick={() => handleUpdateStatus(activeOrder.id, OrderStatus.DELIVERING)} className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black text-sm uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
                                                <span className="material-icons-round">local_shipping</span> 装车出发 (START)
                                            </button>
                                        ) : (
                                            <button onClick={() => navigate('/driver/confirm', { state: { orderId: activeOrder.id } })} className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black text-sm uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
                                                <span className="material-icons-round">camera_alt</span> 交付拍照 (FINISH)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}
                        {upcomingOrders.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">后续排程 (NEXT)</h2>
                                <div className="space-y-3">
                                    {upcomingOrders.map(order => (
                                        <div key={order.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all" onClick={() => setSelectedOrder(order)}>
                                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100">
                                                <span className="text-[14px] font-black text-slate-800 leading-none">{order.dueTime.split(':')[0]}</span>
                                                <span className="text-[8px] font-black text-slate-400 uppercase mt-0.5">PM</span>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-xs font-black text-slate-800">{order.customerName}</h4>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 truncate max-w-[150px]">{order.address}</p>
                                            </div>
                                            <span className="material-icons-round text-slate-200">chevron_right</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}

                {currentView === 'history' && (
                    <section className="space-y-4 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">历史交付记录 (PAST DELIVERIES)</h2>
                        </div>
                        <div className="space-y-3">
                            {historyOrders.map(order => (
                                <div key={order.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all" onClick={() => setSelectedOrder(order)}>
                                    <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 border border-green-100">
                                        <span className="material-icons-round">task_alt</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-xs font-black text-slate-800">{order.customerName}</h4>
                                            <span className="text-[10px] font-black text-primary">RM {order.amount.toFixed(2)}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{order.id} • 已完成</p>
                                    </div>
                                    <span className="material-icons-round text-slate-200">chevron_right</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {currentView === 'profile' && (
                    <section className="space-y-6 animate-in fade-in duration-300 pb-10">
                        <div className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <span className="material-icons-round text-8xl">local_shipping</span>
                            </div>
                            <div className="flex flex-col items-center mb-6 relative z-10">
                                <div className="relative group">
                                    <img src={driverImg} className="w-24 h-24 rounded-full object-cover border-4 border-primary/20 shadow-xl" alt="Driver Profile" />
                                    <label className="absolute bottom-0 right-0 bg-primary w-9 h-9 rounded-full flex items-center justify-center cursor-pointer shadow-lg active:scale-90 transition-transform">
                                        <span className="material-icons-round text-white text-sm">camera_alt</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                    </label>
                                </div>
                                <div className="mt-4 text-center">
                                    <h2 className="text-2xl font-black tracking-tight">{driverName}</h2>
                                    <p className="text-[10px] text-primary font-black uppercase tracking-widest">认证司机 ID: #D-88219</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">本月评分</p>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xl font-black">4.9</span>
                                        <span className="material-icons-round text-yellow-500 text-sm">star</span>
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">准点率</p>
                                    <p className="text-xl font-black text-green-400">98%</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-[32px] p-6 border border-slate-100 space-y-4 shadow-sm">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">个人资料设定</h3>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-300 uppercase ml-2 tracking-widest">姓名 (NAME)</label>
                                    <input value={driverName} onChange={e => setDriverName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:bg-white focus:border-primary/20 transition-all outline-none" placeholder="输入姓名" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-300 uppercase ml-2 tracking-widest">电话号码 (PHONE)</label>
                                    <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:bg-white focus:border-primary/20 transition-all outline-none" placeholder="输入电话号码" />
                                </div>
                            </div>
                        </div>

                        {/* Vehicle Selection Section */}
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">车辆信息</h3>
                            <button
                                onClick={() => setIsVehicleDeclaring(true)}
                                className={`w-full bg-white rounded-[32px] p-6 border transition-all flex items-center justify-between text-left group active:scale-[0.98] ${declaredTime ? 'border-primary/30 ring-4 ring-primary/5' : 'border-slate-100'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${declaredTime ? 'bg-primary text-white' : 'bg-slate-50 text-slate-400'}`}>
                                        <span className="material-icons-round">local_shipping</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800">{selectedVehicle.model}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedVehicle.plate} • {selectedVehicle.type}</p>
                                        {declaredTime && (
                                            <p className="text-[8px] text-primary font-black uppercase mt-1">已申报使用: {declaredTime}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="bg-green-50 text-green-600 text-[8px] font-black uppercase px-2 py-1 rounded-md">运行良好</span>
                                    <span className="text-[10px] font-black text-slate-300 group-hover:text-primary transition-colors">修改车辆</span>
                                </div>
                            </button>
                            <p className="text-[9px] text-primary font-bold text-center mt-2 uppercase tracking-tighter">
                                加入选择车辆 每次使用都必须申报
                            </p>
                        </div>

                        <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                            <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50">
                                <div className="flex items-center gap-3">
                                    <span className="material-icons-round text-slate-400">settings</span>
                                    <span className="text-xs font-bold text-slate-700">系统设置</span>
                                </div>
                                <span className="material-icons-round text-slate-200">chevron_right</span>
                            </button>
                            <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-red-500" onClick={() => navigate('/login')}>
                                <div className="flex items-center gap-3">
                                    <span className="material-icons-round">logout</span>
                                    <span className="text-xs font-bold">退出登录</span>
                                </div>
                                <span className="material-icons-round text-slate-200">chevron_right</span>
                            </button>
                        </div>
                    </section>
                )}
            </main>

            {/* Vehicle Declaration Modal */}
            {isVehicleDeclaring && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex flex-col justify-end animate-in fade-in duration-300 no-print">
                    <div className="bg-white w-full max-w-md mx-auto rounded-t-[48px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
                        <header className="flex justify-between items-start mb-8 flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">车辆申报中心</h2>
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">请选择今日配送使用的车辆</p>
                            </div>
                            <button onClick={() => setIsVehicleDeclaring(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 active:scale-90 shadow-sm">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-6">
                            {MOCK_VEHICLES.map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => handleDeclareVehicle(v)}
                                    disabled={v.status === 'maintenance'}
                                    className={`w-full p-6 rounded-[32px] border transition-all text-left flex items-center justify-between group active:scale-[0.98] ${selectedVehicle.id === v.id ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5' : 'bg-slate-50 border-slate-100'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${selectedVehicle.id === v.id ? 'bg-primary text-white' : 'bg-white text-slate-300'}`}>
                                            <span className="material-icons-round text-2xl">local_shipping</span>
                                        </div>
                                        <div>
                                            <h4 className={`text-sm font-black ${selectedVehicle.id === v.id ? 'text-slate-900' : 'text-slate-700'}`}>{v.model}</h4>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{v.plate} • {v.type}</p>
                                        </div>
                                    </div>
                                    {v.status === 'maintenance' ? (
                                        <span className="bg-red-50 text-red-500 text-[8px] font-black uppercase px-2 py-1 rounded-md">维保中</span>
                                    ) : (
                                        <span className={`text-[10px] font-black uppercase ${selectedVehicle.id === v.id ? 'text-primary' : 'text-slate-300'}`}>
                                            {selectedVehicle.id === v.id ? '正在使用' : '选择此车'}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="bg-orange-50 p-5 rounded-3xl border border-orange-100 mb-6 flex items-start gap-3">
                            <span className="material-icons-round text-orange-500 text-sm mt-0.5">info</span>
                            <p className="text-[10px] text-orange-700 font-bold leading-relaxed uppercase">
                                根据公司规定，每次开始配送前必须进行车辆申报，以确保物流追踪的准确性与安全性。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* PTT / Zello Overlay */}
            {isPttOpen && (
                <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300 px-8">
                    <div className="absolute top-12 left-0 right-0 px-8 flex justify-between items-center">
                        <div className="flex items-center gap-3 text-white">
                            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                                <span className="material-icons-round">radio</span>
                            </div>
                            <div>
                                <h2 className="font-black text-sm uppercase tracking-widest">总台对讲频道</h2>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Channel: Central Dispatch 01</p>
                            </div>
                        </div>
                        <button onClick={stopPttSession} className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center w-full gap-12 text-center">
                        <div>
                            <div className={`text-4xl font-black mb-2 tracking-tighter ${pttStatus === 'TALKING' ? 'text-primary' : pttStatus === 'LISTENING' ? 'text-green-500' : 'text-slate-500'}`}>
                                {pttStatus === 'CONNECTING' ? '正在连接...' : pttStatus === 'TALKING' ? '正在发射...' : pttStatus === 'LISTENING' ? '总台传讯中' : '等待呼叫'}
                            </div>
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">{pttStatus === 'IDLE' ? '长按圆形按钮说话' : '松手发送给总台'}</p>
                        </div>
                        <div className="flex items-end justify-center gap-1.5 h-24 w-full px-12">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1].map((v, i) => (
                                <div key={i} className={`flex-1 rounded-full transition-all duration-200 ${pttStatus === 'TALKING' ? 'bg-primary' : pttStatus === 'LISTENING' ? 'bg-green-500' : 'bg-slate-800'}`}
                                    style={{ height: pttStatus === 'IDLE' ? '4px' : `${20 + Math.random() * 80}%` }}></div>
                            ))}
                        </div>
                        <button onMouseDown={handlePttDown} onMouseUp={handlePttUp} onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }} className={`w-48 h-48 rounded-full border-8 transition-all flex items-center justify-center shadow-2xl relative active:scale-95 ${isTransmitting ? 'bg-primary border-white/20 scale-110 shadow-primary/50' : 'bg-slate-800 border-white/5 shadow-black/50'}`}>
                            {isTransmitting && <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30"></div>}
                            <span className="material-icons-round text-6xl text-white">{isTransmitting ? 'mic' : 'mic_none'}</span>
                        </button>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex flex-col justify-end animate-in fade-in duration-300 no-print">
                    <div className="bg-white w-full max-w-md mx-auto rounded-t-[48px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[88vh] flex flex-col">
                        <header className="flex justify-between items-start mb-8 flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">配送单明细</h2>
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">NO: {selectedOrder.id} • {selectedOrder.status === OrderStatus.COMPLETED ? '已完成' : '待处理'}</p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform shadow-sm">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">收货方资料</h4>
                                <div className="bg-slate-50 p-5 rounded-[28px] border border-slate-100/50 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-50">
                                            <span className="material-icons-round text-sm">person</span>
                                        </div>
                                        <span className="text-sm font-black text-slate-800">{selectedOrder.customerName}</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-50 shrink-0">
                                            <span className="material-icons-round text-sm">place</span>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-xs font-bold text-slate-500 leading-relaxed block">{selectedOrder.address}</span>
                                            <a
                                                href={getGoogleMapsUrl(selectedOrder.address)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-1 text-[9px] font-black text-blue-500 uppercase tracking-wider"
                                            >
                                                <span className="material-icons-round text-[10px]">open_in_new</span>
                                                打开地图
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">菜品清单 (ITEMS)</h4>
                                <div className="bg-white border border-slate-100 rounded-[28px] divide-y divide-slate-50 overflow-hidden shadow-sm">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="p-4 flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 border border-slate-50">
                                                    <span className="material-icons-round text-sm">fastfood</span>
                                                </div>
                                                <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                            </div>
                                            <span className="text-xs font-black text-primary">x {item.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-slate-900 p-6 rounded-[32px] text-white flex justify-between items-center shadow-xl shadow-slate-900/20">
                                <div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">应收金额 (PORTABLE)</p>
                                    <h4 className="text-3xl font-black tracking-tighter">RM {selectedOrder.amount.toFixed(2)}</h4>
                                </div>
                                <div className="text-right">
                                    <span className="bg-white/10 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-white/5">支付方式: 现金/到付</span>
                                </div>
                            </div>
                        </div>
                        <div className="pt-6 flex gap-3">
                            <button onClick={() => setSelectedOrder(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">关闭详情</button>
                            {selectedOrder.status !== OrderStatus.COMPLETED && (
                                <button onClick={() => { handleWhatsApp(selectedOrder); setSelectedOrder(null); }} className="px-6 py-4 bg-green-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-green-200 active:scale-95 transition-all">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-5 h-5" alt="WA" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around items-start pt-4 safe-bottom h-[96px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[32px] no-print z-40">
                <button onClick={() => setCurrentView('tasks')} className={`flex flex-col items-center gap-1 transition-all ${currentView === 'tasks' ? 'text-primary' : 'text-slate-400'}`}>
                    <span className="material-icons-round">local_shipping</span>
                    <span className={`text-[9px] font-black uppercase tracking-tighter ${currentView === 'tasks' ? 'opacity-100' : 'opacity-60'}`}>配送任务</span>
                    {currentView === 'tasks' && <div className="w-1 h-1 bg-primary rounded-full mt-0.5"></div>}
                </button>
                <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center gap-1 transition-all ${currentView === 'history' ? 'text-primary' : 'text-slate-400'}`}>
                    <span className="material-icons-round">history</span>
                    <span className={`text-[9px] font-black uppercase tracking-tighter ${currentView === 'history' ? 'opacity-100' : 'opacity-60'}`}>配送历史</span>
                    {currentView === 'history' && <div className="w-1 h-1 bg-primary rounded-full mt-0.5"></div>}
                </button>
                <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center gap-1 transition-all ${currentView === 'profile' ? 'text-primary' : 'text-slate-400'}`}>
                    <span className="material-icons-round">person</span>
                    <span className={`text-[9px] font-black uppercase tracking-tighter ${currentView === 'profile' ? 'opacity-100' : 'opacity-60'}`}>个人中心</span>
                    {currentView === 'profile' && <div className="w-1 h-1 bg-primary rounded-full mt-0.5"></div>}
                </button>
            </nav>
        </div>
    );
};

export default DriverSchedule;