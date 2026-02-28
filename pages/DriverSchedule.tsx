import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService } from '../src/services/api';
import { Order, OrderStatus } from '../types';
import GoEasy from 'goeasy';
import { supabase } from '../src/lib/supabase';
import { getGoogleMapsUrl } from '../src/utils/maps';

// NOTE: GoEasy 配置 — 对应控制台 [IM即时通讯] KIM_LONG_COMUNITY 应用
const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';
const CHANNEL = 'KIM_LONG_COMUNITY';

/** 司机端聊天消息数据结构 */
interface DriverChatMsg {
    id: string;
    senderId: string;
    senderLabel: string;
    senderRole: string;
    content: string;
    timestamp: number;
    isMine: boolean;
}

interface Vehicle {
    id: string;
    model: string;
    plate: string;
    type: string;
    status: 'good' | 'maintenance' | 'available' | 'busy' | 'repair';
}

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
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
    const [isVehicleDeclaring, setIsVehicleDeclaring] = useState(false);
    const [declaredTime, setDeclaredTime] = useState<string | null>(null);

    // PTT / GoEasy States
    const [isPttOpen, setIsPttOpen] = useState(false);
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [pttStatus, setPttStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'TALKING' | 'LISTENING'>('IDLE');
    // NOTE: 聊天消息状态
    const [driverChatMessages, setDriverChatMessages] = useState<DriverChatMsg[]>([]);
    const [driverChatInput, setDriverChatInput] = useState('');

    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    // NOTE: GoEasy 单例，避免重复初始化
    const goEasyRef = useRef<InstanceType<typeof GoEasy> | null>(null);
    const driverIdRef = useRef<string>(`driver-${Math.random().toString(36).slice(2, 9)}`);
    // NOTE: Supabase Presence channel ref，PTT 开启时加入，让 admin-web 可以看到司机在线
    const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);

    const fetchOrders = async () => {
        try {
            const allOrders = await OrderService.getAll();
            setOrders(allOrders);
        } catch (error) {
            console.error("Failed to fetch driver orders", error);
        }
    };

    const fetchVehicles = async () => {
        try {
            const { data, error } = await supabase.from('vehicles').select('*');
            if (data && !error) {
                // translate db columns to Vehicle interface
                const mappedVehicles: Vehicle[] = data.map(v => ({
                    id: v.id,
                    model: v.model,
                    plate: v.plate_no || v.plate,
                    type: v.type,
                    status: v.status as any
                }));
                setVehicles(mappedVehicles);
                if (!selectedVehicle && mappedVehicles.length > 0) {
                    setSelectedVehicle(mappedVehicles[0]);
                }
            }
        } catch (error) {
            console.error("Failed to fetch vehicles", error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchVehicles();

        // Supabase Realtime Listener for Vehicles
        const vehicleChannel = supabase.channel('public:vehicles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, payload => {
                fetchVehicles(); // Reload vehicles when there's a change
            })
            .subscribe();

        const timer = setInterval(() => {
            setNow(new Date());
            fetchOrders();
        }, 5000);

        return () => {
            clearInterval(timer);
            supabase.removeChannel(vehicleChannel);
        };
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

    /** 将 Blob 转为 Base64 */
    const blobToBase64 = (blob: Blob): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    /** 播放收到的音频（Base64 → ArrayBuffer → Web Audio） */
    const playAudio = useCallback(async (base64: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        try {
            const binary = atob(base64);
            const buf = new ArrayBuffer(binary.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
            const audioBuf = await audioContextRef.current.decodeAudioData(buf);
            const src = audioContextRef.current.createBufferSource();
            src.buffer = audioBuf;
            src.connect(audioContextRef.current.destination);
            src.onended = () => setPttStatus('CONNECTED');
            src.start(0);
            setPttStatus('LISTENING');
        } catch (err) {
            console.error('[GoEasy PTT] Audio decode error', err);
            setPttStatus('CONNECTED');
        }
    }, []);

    /** 初始化 GoEasy 连接并订阅频道，同时加入 Supabase Presence */
    const startPttSession = async () => {
        setIsPttOpen(true);
        setPttStatus('CONNECTING');

        /** 内部帧函数，一定在断开旧连接后才执行 */
        const doConnect = () => {
            try {
                const goEasy = GoEasy.getInstance({
                    host: GOEASY_HOST,
                    appkey: GOEASY_APPKEY,
                    modules: ['pubsub'],
                });
                goEasyRef.current = goEasy;

                goEasy.connect({
                    id: driverIdRef.current,
                    data: { role: 'driver' },
                    onSuccess: () => {
                        setPttStatus('CONNECTED');
                        goEasy.pubsub.subscribe({
                            channel: CHANNEL,
                            onMessage: async (message: any) => {
                                try {
                                    const payload = JSON.parse(message.content);
                                    if (payload.senderId === driverIdRef.current) return;
                                    if (payload.type === 'text') {
                                        setDriverChatMessages(prev => [...prev, {
                                            id: `${payload.senderId}-${payload.timestamp}`,
                                            senderId: payload.senderId,
                                            senderLabel: payload.senderLabel ?? '管理员',
                                            senderRole: payload.senderRole ?? 'admin',
                                            content: payload.content,
                                            timestamp: payload.timestamp,
                                            isMine: false,
                                        }]);
                                        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                                    } else if (payload.type === 'audio' || payload.audio) {
                                        await playAudio(payload.audio);
                                    }
                                } catch (err) {
                                    console.error('[GoEasy PTT] Failed to handle message', err);
                                }
                            },
                            onSuccess: () => console.log('[GoEasy PTT] Subscribed to Global'),
                            onFailed: (err: any) => console.error('[GoEasy PTT] Subscribe failed', err),
                        });
                        // 订阅司机私人频道
                        const privateChannel = `driver_${driverIdRef.current}`;
                        goEasy.pubsub.subscribe({
                            channel: privateChannel,
                            onMessage: async (message: any) => {
                                try {
                                    const payload = JSON.parse(message.content);
                                    if (payload.type === 'text') {
                                        setDriverChatMessages(prev => [...prev, {
                                            id: `${payload.senderId}-${payload.timestamp}`,
                                            senderId: payload.senderId,
                                            senderLabel: payload.senderLabel ?? '管理员',
                                            senderRole: payload.senderRole ?? 'admin',
                                            content: payload.content,
                                            timestamp: payload.timestamp,
                                            isMine: false,
                                        }]);
                                        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                                    } else if (payload.type === 'audio' || payload.audio) {
                                        await playAudio(payload.audio);
                                    }
                                } catch (err) {
                                    console.error('[GoEasy Private] handle message error', err);
                                }
                            },
                            onSuccess: () => console.log(`[GoEasy] Subscribed to private: ${privateChannel}`),
                            onFailed: (err: any) => console.error('[GoEasy] Private subscribe failed', err),
                        });
                    },
                    onFailed: (err: any) => {
                        console.error('[GoEasy PTT] Connect failed', err);
                        setPttStatus('IDLE');
                    },
                    onDisconnected: () => setPttStatus('IDLE')
                });
            } catch (e) {
                console.error('[GoEasy PTT] Init error', e);
                setPttStatus('IDLE');
            }
        };

        // NOTE: 初始化前先检查并断开旧连接，避免单例状态冲突
        try {
            const status = GoEasy.getConnectionStatus();
            if (status === 'disconnected') {
                doConnect();
            } else {
                GoEasy.disconnect({
                    onSuccess: () => doConnect(),
                    onFailed: () => doConnect(),
                });
            }
        } catch {
            doConnect();
        }

        // NOTE: 加入 Supabase Presence，让 admin-web Walkie-Talkie 页面的在线用户列表显示此司机
        try {
            const ch = supabase.channel('walkie-talkie-room', {
                config: { presence: { key: driverIdRef.current } },
            });
            ch.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await ch.track({
                        userId: driverIdRef.current,
                        email: '司机端',
                        role: 'driver',
                        joinedAt: new Date().toISOString(),
                    });
                }
            });
            presenceChannelRef.current = ch;
        } catch (e) {
            console.error('[Presence] Failed to join walkie-talkie-room', e);
        }
    };

    /** 按下 PTT — 开始录音 */
    const handlePttDown = async () => {
        if (pttStatus !== 'CONNECTED') return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.start(100);
            mediaRecorderRef.current = mr;
            setIsTransmitting(true);
            setPttStatus('TALKING');
        } catch {
            alert('请允许麦克风权限以使用对讲功能。');
        }
    };

    /** 松开 PTT — 停止录音，发布音频到 GoEasy */
    const handlePttUp = () => {
        if (!mediaRecorderRef.current || !isTransmitting) return;
        setIsTransmitting(false);
        setPttStatus('CONNECTED');
        const mr = mediaRecorderRef.current;
        // NOTE: onstop 必须在 stop() 之前赋值，否则有时序 bug 导致回调不触发
        mr.onstop = async () => {
            if (!goEasyRef.current) return;
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            if (blob.size < 100) return;
            try {
                const base64Audio = await blobToBase64(blob);
                const payload = JSON.stringify({
                    type: 'audio',
                    senderId: driverIdRef.current,
                    senderLabel: '司机端',
                    senderRole: 'driver',
                    audio: base64Audio,
                });
                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: payload,
                    onSuccess: () => console.log('[GoEasy PTT] Audio published'),
                    onFailed: (err: any) => console.error('[GoEasy PTT] Publish failed', err),
                });

                // 将语音记录存储到 Supabase messages 表，触发 SuperAdmin 的 Realtime 监听
                await supabase.from('messages').insert([{
                    sender_id: driverIdRef.current,
                    sender_label: driverName || '司机端',
                    sender_role: 'driver',
                    receiver_id: 'GLOBAL',
                    content: base64Audio,
                    type: 'audio'
                }]);
            } catch (err) {
                console.error('[GoEasy PTT] Encode/send error', err);
            }
            audioChunksRef.current = [];
        };
        mr.stop();
        mr.stream.getTracks().forEach(t => t.stop());
    };

    /** 关闭 PTT 面板，断开 GoEasy 并离开 Supabase Presence */
    const stopPttSession = () => {
        if (goEasyRef.current) {
            try {
                goEasyRef.current.pubsub.unsubscribe({ channel: CHANNEL, onSuccess: () => { }, onFailed: () => { } });
            } catch { }
        }
        mediaRecorderRef.current?.stop();
        // NOTE: 必须调用 disconnect 清理单例状态，否则下次打开 PTT 会报 Initialization failed
        try {
            GoEasy.disconnect({ onSuccess: () => { }, onFailed: () => { } });
        } catch { }
        // NOTE: 离开 Presence 频道，admin 在线列表中移除此司机
        if (presenceChannelRef.current) {
            supabase.removeChannel(presenceChannelRef.current);
            presenceChannelRef.current = null;
        }
        setIsPttOpen(false);
        setPttStatus('IDLE');
        goEasyRef.current = null;
    };

    /** 司机端发送文字消息到 GoEasy 频道 */
    const sendDriverTextMessage = () => {
        const text = driverChatInput.trim();
        if (!text || !goEasyRef.current || pttStatus === 'IDLE' || pttStatus === 'CONNECTING') return;
        const ts = Date.now();
        setDriverChatMessages(prev => [...prev, {
            id: `${driverIdRef.current}-${ts}`,
            senderId: driverIdRef.current,
            senderLabel: '司机端',
            senderRole: 'driver',
            content: text,
            timestamp: ts,
            isMine: true,
        }]);
        setDriverChatInput('');
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        goEasyRef.current.pubsub.publish({
            channel: CHANNEL,
            message: JSON.stringify({ type: 'text', senderId: driverIdRef.current, senderLabel: '司机端', senderRole: 'driver', content: text, timestamp: ts }),
            onSuccess: () => { },
            onFailed: (err: any) => console.error('[GoEasy] Text publish failed', err),
        });

        const insertMsg = async () => {
            try {
                await supabase.from('messages').insert([{
                    sender_id: driverIdRef.current,
                    sender_label: driverName || '司机端',
                    sender_role: 'driver',
                    receiver_id: 'GLOBAL',
                    content: text,
                    type: 'text'
                }]);
            } catch (err) {
                console.error('Failed to insert message', err);
            }
        };
        insertMsg();
    };

    const handleWhatsApp = (order: Order, type: 'general' | 'arrival' = 'general') => {
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        let message = `你好 ${order.customerName}，我是金龙餐饮的配送司机。我正在配送您的订单 ${order.id}，预计于 ${order.dueTime} 左右到达。`;
        if (type === 'arrival') {
            message = `【抵达预告】你好 ${order.customerName}，我是金龙餐饮司机。您的订单 ${order.id} 预计将在 30 分钟内抵达 (${order.address})，请准备签收。`;
            setNotifiedOrders(prev => new Set(prev).add(order.id));
        }
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleDeclareVehicle = async (vehicle: Vehicle) => {
        try {
            // Update db status to busy to simulate declaration/assignment
            await supabase.from('vehicles').update({ status: 'busy' }).eq('id', vehicle.id);
            setSelectedVehicle(vehicle);
            setDeclaredTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setIsVehicleDeclaring(false);
        } catch (error) {
            console.error("Failed to declare vehicle", error);
        }
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
                        {/* GoEasy PTT 入口按钮 */}
                        <button
                            onClick={() => { if (!isPttOpen) startPttSession(); }}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-90 ${isPttOpen ? 'bg-primary text-white animate-pulse' : 'bg-white text-slate-400 border border-slate-100'
                                }`}>
                            <span className="material-icons-round text-sm">cell_tower</span>
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
                                        <p className="text-sm font-black text-slate-800">{selectedVehicle?.model || '未选择车辆'}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedVehicle?.plate || '-'} • {selectedVehicle?.type || '-'}</p>
                                        {declaredTime && (
                                            <p className="text-[8px] text-primary font-black uppercase mt-1">已申报使用: {declaredTime}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md ${selectedVehicle?.status === 'repair' || selectedVehicle?.status === 'maintenance' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                                        {selectedVehicle?.status === 'repair' || selectedVehicle?.status === 'maintenance' ? '维保中' : '运行良好'}
                                    </span>
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
                            {vehicles.map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => handleDeclareVehicle(v)}
                                    disabled={v.status === 'maintenance' || v.status === 'repair'}
                                    className={`w-full p-6 rounded-[32px] border transition-all text-left flex items-center justify-between group active:scale-[0.98] ${selectedVehicle?.id === v.id ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5' : 'bg-slate-50 border-slate-100'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${selectedVehicle?.id === v.id ? 'bg-primary text-white' : 'bg-white text-slate-300'}`}>
                                            <span className="material-icons-round text-2xl">local_shipping</span>
                                        </div>
                                        <div>
                                            <h4 className={`text-sm font-black ${selectedVehicle?.id === v.id ? 'text-slate-900' : 'text-slate-700'}`}>{v.model}</h4>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{v.plate} • {v.type}</p>
                                        </div>
                                    </div>
                                    {v.status === 'maintenance' || v.status === 'repair' ? (
                                        <span className="bg-red-50 text-red-500 text-[8px] font-black uppercase px-2 py-1 rounded-md">维保中</span>
                                    ) : (
                                        <span className={`text-[10px] font-black uppercase ${selectedVehicle?.id === v.id ? 'text-primary' : 'text-slate-300'}`}>
                                            {selectedVehicle?.id === v.id ? '正在使用' : '选择此车'}
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

            {/* GoEasy PTT Overlay — 语音 + 即时文字聊天 */}
            {isPttOpen && (
                <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex flex-col animate-in fade-in duration-300">
                    {/* 顶部状态栏 */}
                    <div className="px-6 pt-12 pb-4 flex justify-between items-center border-b border-white/5 shrink-0">
                        <div className="flex items-center gap-3 text-white">
                            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                                <span className="material-icons-round">cell_tower</span>
                            </div>
                            <div>
                                <h2 className="font-black text-sm uppercase tracking-widest">GoEasy 对讲频道</h2>
                                <p className="text-[10px] font-bold uppercase tracking-tight"
                                    style={{ color: pttStatus === 'CONNECTED' || pttStatus === 'TALKING' || pttStatus === 'LISTENING' ? '#4ade80' : '#64748b' }}>
                                    {pttStatus === 'CONNECTING' ? '连接中...' : pttStatus === 'CONNECTED' ? 'LIVE · KIM_LONG_COMUNITY' : pttStatus === 'TALKING' ? '正在发射...' : pttStatus === 'LISTENING' ? '收到信号...' : '已断开'}
                                </p>
                            </div>
                        </div>
                        <button onClick={stopPttSession} className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>

                    {/* 聊天消息区域 */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {driverChatMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                                <span className="material-icons-round text-3xl">chat_bubble_outline</span>
                                <p className="text-xs font-bold">暂无消息</p>
                            </div>
                        ) : driverChatMessages.map((msg) => {
                            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const roleColor = msg.senderRole === 'driver' ? 'bg-primary' : msg.senderRole === 'super_admin' ? 'bg-purple-500' : 'bg-blue-500';
                            const roleIcon = msg.senderRole === 'driver' ? 'local_shipping' : 'admin_panel_settings';
                            return (
                                <div key={msg.id} className={`flex gap-2.5 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${roleColor}`}>
                                        <span className="material-icons-round text-white text-[12px]">{roleIcon}</span>
                                    </div>
                                    <div className={`max-w-[70%] flex flex-col gap-0.5 ${msg.isMine ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-1.5">
                                            {!msg.isMine && <span className="text-[9px] font-black text-slate-400">{msg.senderLabel}</span>}
                                            <span className="text-[9px] text-slate-600">{time}</span>
                                        </div>
                                        <div className={`px-3.5 py-2 rounded-2xl text-sm font-medium ${msg.isMine ? 'bg-primary text-white rounded-tr-sm' : 'bg-slate-700/80 text-slate-100 rounded-tl-sm'}`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatBottomRef} />
                    </div>

                    {/* PTT 按钮区（紧凑版）*/}
                    <div className="shrink-0 border-t border-white/5 py-4 flex flex-col items-center gap-3">
                        <p className={`text-xs font-black uppercase tracking-[0.2em] ${pttStatus === 'TALKING' ? 'text-primary' : pttStatus === 'LISTENING' ? 'text-green-400' : pttStatus === 'CONNECTED' ? 'text-white' : 'text-slate-500'
                            }`}>
                            {pttStatus === 'CONNECTING' ? '正在连接...' : pttStatus === 'TALKING' ? '正在发射...' : pttStatus === 'LISTENING' ? '收到信号' : pttStatus === 'CONNECTED' ? '频道就绪 · 长按说话' : '等待连接'}
                        </p>
                        <div className="flex items-center gap-6">
                            {/* 波形动画 */}
                            <div className="flex items-end gap-0.5 h-8 w-16">
                                {[3, 5, 7, 5, 3].map((h, i) => (
                                    <div key={i} className={`flex-1 rounded-full transition-all duration-200 ${pttStatus === 'TALKING' ? 'bg-primary' : pttStatus === 'LISTENING' ? 'bg-green-500' : 'bg-slate-700'}`}
                                        style={{ height: (pttStatus === 'TALKING' || pttStatus === 'LISTENING') ? `${h * 10 + Math.random() * 20}%` : `${h * 5}%` }}></div>
                                ))}
                            </div>
                            {/* PTT 圆形大按钮 */}
                            <button
                                onMouseDown={handlePttDown}
                                onMouseUp={handlePttUp}
                                onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }}
                                onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }}
                                disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'}
                                className={`w-20 h-20 rounded-full border-4 transition-all flex items-center justify-center shadow-2xl relative active:scale-95 ${isTransmitting ? 'bg-primary border-white/20 scale-110 shadow-primary/50' :
                                    pttStatus === 'CONNECTED' ? 'bg-slate-700 border-white/10' : 'bg-slate-800 border-white/5 opacity-40 cursor-not-allowed'
                                    }`}>
                                {isTransmitting && <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30"></div>}
                                <span className="material-icons-round text-3xl text-white">{isTransmitting ? 'mic' : 'mic_none'}</span>
                            </button>
                            {/* 右侧波形（镜像）*/}
                            <div className="flex items-end gap-0.5 h-8 w-16">
                                {[3, 5, 7, 5, 3].reverse().map((h, i) => (
                                    <div key={i} className={`flex-1 rounded-full transition-all duration-200 ${pttStatus === 'TALKING' ? 'bg-primary' : pttStatus === 'LISTENING' ? 'bg-green-500' : 'bg-slate-700'}`}
                                        style={{ height: (pttStatus === 'TALKING' || pttStatus === 'LISTENING') ? `${h * 10 + Math.random() * 20}%` : `${h * 5}%` }}></div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 文字输入栏 */}
                    <div className="shrink-0 px-4 pb-8 pt-3 border-t border-white/5 flex items-center gap-3">
                        <div className="flex-1 flex items-center bg-slate-800 rounded-2xl px-4 py-2.5 border border-white/10 gap-2">
                            <span className="material-icons-round text-slate-500 text-[16px]">chat</span>
                            <input
                                type="text"
                                value={driverChatInput}
                                onChange={(e) => setDriverChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendDriverTextMessage(); } }}
                                placeholder={pttStatus === 'CONNECTED' ? '输入文字消息，Enter 发送…' : '频道未连接'}
                                disabled={pttStatus !== 'CONNECTED'}
                                className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none font-medium"
                            />
                        </div>
                        <button
                            onClick={sendDriverTextMessage}
                            disabled={pttStatus !== 'CONNECTED' || !driverChatInput.trim()}
                            className="w-10 h-10 rounded-2xl bg-primary hover:bg-primary/90 disabled:bg-slate-700 text-white flex items-center justify-center transition-all shrink-0"
                        >
                            <span className="material-icons-round text-[18px]">send</span>
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