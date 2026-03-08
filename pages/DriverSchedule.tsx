import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService, UserService, api } from '../src/services/api';
import { Order, OrderStatus, User } from '../types';
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
    const [userId, setUserId] = useState<string | null>(null);
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [driverImg, setDriverImg] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);

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

    const fetchUserProfile = async (uid: string) => {
        try {
            const profile = await UserService.getCurrentUser(uid);
            setDriverName(profile.name || '');
            setDriverPhone(profile.phone || '');
            setDriverImg(profile.avatar_url || 'https://via.placeholder.com/150');
            if (profile.vehicle_model) {
                setSelectedVehicle({
                    id: 'current', model: profile.vehicle_model,
                    plate: profile.vehicle_plate || '', type: profile.vehicle_type || '',
                    status: profile.vehicle_status as any
                });
                setDeclaredTime('已保存');
            }
        } catch (error) {
            console.error("Failed to fetch user profile", error);
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
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id);
                fetchUserProfile(session.user.id);
            }
        });

        fetchOrders();
        fetchVehicles();

        // Supabase Realtime Listener for Vehicles
        const vehicleChannel = supabase.channel('public:vehicles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, payload => {
                fetchVehicles();
            })
            .subscribe();

        // NOTE: 用 Supabase Realtime 监听订单变更，消除 5s 轮询延迟
        const orderChannel = supabase.channel('driver-orders-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    fetchOrders();
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] Order channel status: ${status}`);
            });

        const timer = setInterval(() => {
            setNow(new Date());
        }, 10000); // 仅更新时间点，数据由 Realtime 处理

        return () => {
            clearInterval(timer);
            supabase.removeChannel(vehicleChannel);
            supabase.removeChannel(orderChannel);
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

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && userId) {
            try {
                // upload to supabase
                const fileExt = file.name.split('.').pop();
                const fileName = `${userId}-${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('delivery-photos')
                    .upload(`avatars/${fileName}`, file);
                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('delivery-photos').getPublicUrl(`avatars/${fileName}`);
                if (data.publicUrl) {
                    setDriverImg(data.publicUrl);
                    await UserService.updateProfile(userId, { avatar_url: data.publicUrl });
                    alert('头像更新成功');
                }
            } catch (error) {
                console.error('Failed to upload avatar', error);
                alert('头像上传失败');
            }
        }
    };

    const saveProfile = async () => {
        if (!userId) return;
        setIsSavingProfile(true);
        try {
            await UserService.updateProfile(userId, { name: driverName, phone: driverPhone });
            alert('个人资料保存成功');
        } catch (err) {
            console.error('Failed to save profile', err);
            alert('保存失败');
        } finally {
            setIsSavingProfile(false);
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
            // NOTE: 调用 Backend 统一重构后的 assign API
            await api.post('/vehicles/assign', {
                driver_id: userId,
                vehicle_id: vehicle.id
            });

            setSelectedVehicle(vehicle);
            setDeclaredTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setIsVehicleDeclaring(false);

            // 刷新本地数据
            fetchUserProfile(userId!);
            fetchVehicles();
        } catch (error) {
            console.error("Failed to declare vehicle", error);
            alert('车辆指派失败，该车可能已被占用');
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0f172a] relative text-white">
            <header className="pt-12 pb-6 px-6 bg-[#1e293b]/50 backdrop-blur-xl sticky top-0 z-30 border-b border-white/5 flex items-center justify-between no-print">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-primary/40 p-0.5 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                        <img src={driverImg} className="w-full h-full object-cover rounded-xl" alt="Driver" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white tracking-tight">{driverName}, 你好!</h1>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">
                            {currentView === 'tasks' ? `ACTIVE MISSIONS: ${taskOrders.length}` : currentView === 'history' ? `COMPLETED: ${historyOrders.length}` : 'PROFILE SETTINGS'}
                        </p>
                    </div>
                </div>
                {currentView === 'tasks' && (
                    <div className="flex gap-2">
                        <button onClick={() => { if (!isPttOpen) startPttSession(); }} className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-90 ${isPttOpen ? 'bg-primary text-white animate-pulse' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
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
                                    <h2 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">正在配送 / Active Mission</h2>
                                    <span className="text-[10px] font-mono font-black text-rose-500 uppercase tracking-widest animate-pulse">{activeOrder.dueTime} DEADLINE</span>
                                </div>
                                <div className="relative rounded-[40px] overflow-hidden group active:scale-[0.98] transition-transform"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        backdropFilter: 'blur(30px)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                                    }}>

                                    {/* Mission Progress Bar Top */}
                                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/5">
                                        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000"
                                            style={{ width: activeOrder.status === OrderStatus.DELIVERING ? '66%' : '33%' }} />
                                    </div>

                                    <div className={`px-6 py-3 flex items-center justify-between transition-colors ${notifiedOrders.has(activeOrder.id) ? 'bg-[#10b981]/10 text-[#10b981]' : isNoticeTime ? 'bg-orange-500/10 text-orange-400 animate-pulse' : 'bg-white/5 text-slate-500'}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="material-icons-round text-[14px]">{notifiedOrders.has(activeOrder.id) ? 'check_circle' : 'sensors'}</span>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">
                                                {notifiedOrders.has(activeOrder.id) ? 'STATUS: NOTIFIED' : isNoticeTime ? 'WARNING: NEAR DELIVERY' : 'STATUS: TRACKING'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-7 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">{activeOrder.customerName}</h3>
                                                <p className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-[0.3em]">ID-{activeOrder.id.slice(0, 8)}</p>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-[8px] font-black text-indigo-400 uppercase mb-1">Items</span>
                                                <button onClick={() => setSelectedOrder(activeOrder)} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all hover:bg-white/10">
                                                    <span className="material-icons-round">inventory_2</span>
                                                </button>
                                            </div>
                                        </div>


                                        // ... (in component)
                                        <div className="flex items-start gap-4 p-5 bg-white/5 rounded-[24px] border border-white/5">
                                            <span className="material-icons-round text-indigo-400 mt-1">place</span>
                                            <div className="flex-1">
                                                <p className="text-[13px] font-bold text-slate-300 leading-relaxed">{activeOrder.address}</p>
                                                <div className="flex gap-2 mt-4">
                                                    <a
                                                        href={getGoogleMapsUrl(activeOrder.address)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-500/20 active:scale-95 transition-all"
                                                    >
                                                        <span className="material-icons-round text-xs">navigation</span>
                                                        Google Maps
                                                    </a>
                                                    <button onClick={() => { window.location.href = `tel:${activeOrder.customerPhone}`; }} className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/10 active:scale-95 transition-all">
                                                        <span className="material-icons-round text-xs">phone</span>
                                                        拨号
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); /* Photo Logic would go here */ alert('Camera module activated'); }}
                                                className="h-16 bg-white/5 text-white rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 border border-white/10 active:scale-95 transition-all group"
                                            >
                                                <span className="material-icons-round text-lg text-indigo-400 group-active:scale-125 transition-transform">camera_alt</span>
                                                Photo
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(activeOrder.id, OrderStatus.COMPLETED); }}
                                                className="h-16 bg-gradient-to-r from-[#10b981] to-[#059669] text-white rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(16,185,129,0.3)] active:scale-95 transition-all group"
                                            >
                                                <span className="material-icons-round text-lg group-active:translate-x-1 transition-transform">task_alt</span>
                                                Complete
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {/* Unified Start/Finish Action with Gradient */}
                                            {activeOrder.status === OrderStatus.READY ? (
                                                <button
                                                    onClick={() => handleUpdateStatus(activeOrder.id, OrderStatus.DELIVERING)}
                                                    className="w-full h-16 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-[0_15px_30px_rgba(99,102,241,0.3)] active:scale-95 transition-all flex items-center justify-center gap-4 border border-white/10"
                                                >
                                                    <span className="material-icons-round text-xl">local_shipping</span>
                                                    START DELIVERY
                                                </button>
                                            ) : (
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => handleWhatsApp(activeOrder, 'arrival')}
                                                        className={`flex-[0.4] h-16 rounded-[24px] flex flex-col items-center justify-center border-2 transition-all active:scale-95 ${notifiedOrders.has(activeOrder.id) ? 'bg-[#10b981]/10 border-[#10b981]/40 text-[#10b981]' : 'bg-white/5 border-white/10 text-slate-400'}`}
                                                    >
                                                        <span className="material-icons-round text-sm mb-1">near_me</span>
                                                        <span className="text-[8px] font-black uppercase tracking-[0.1em]">Notify</span>
                                                    </button>
                                                    <button
                                                        onClick={() => navigate('/driver/confirm', { state: { orderId: activeOrder.id } })}
                                                        className="flex-1 h-16 bg-white text-slate-900 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
                                                    >
                                                        <span className="material-icons-round text-xl">camera_alt</span>
                                                        COMPLETE
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                        {upcomingOrders.length > 0 && (
                            <section className="space-y-4">
                                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">后续排程 / Incoming</h2>
                                <div className="space-y-3">
                                    {upcomingOrders.map(order => (
                                        <div key={order.id} className="group p-6 rounded-[32px] border border-white/5 active:scale-[0.98] transition-all flex items-center gap-5"
                                            style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)' }}
                                            onClick={() => setSelectedOrder(order)}>
                                            <div className="w-14 h-14 bg-white/5 rounded-2xl flex flex-col items-center justify-center border border-white/5">
                                                <span className="text-[16px] font-mono font-black text-white leading-none">{order.dueTime.split(':')[0]}</span>
                                                <span className="text-[8px] font-black text-indigo-400 uppercase mt-1">PM</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-black text-white truncate">{order.customerName}</h4>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 truncate">{order.address}</p>
                                            </div>
                                            <span className="material-icons-round text-slate-700 group-hover:text-white transition-colors">chevron_right</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}

                {currentView === 'history' && (
                    <section className="space-y-5 animate-in fade-in duration-500">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">历史交付 / Record</h2>
                        </div>
                        <div className="space-y-3">
                            {historyOrders.map(order => (
                                <div key={order.id} className="group p-6 rounded-[32px] border border-white/5 active:scale-[0.98] transition-all flex items-center gap-5"
                                    style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)' }}
                                    onClick={() => setSelectedOrder(order)}>
                                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                        <span className="material-icons-round text-xl">done_all</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-sm font-black text-white truncate pr-2">{order.customerName}</h4>
                                            <span className="text-xs font-mono font-black text-indigo-400">RM {order.amount.toFixed(2)}</span>
                                        </div>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">MISSION COMPLETED • {order.id.slice(0, 8)}</p>
                                    </div>
                                    <span className="material-icons-round text-slate-700 group-hover:text-white transition-colors">chevron_right</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {currentView === 'profile' && (
                    <section className="space-y-8 animate-in fade-in duration-500 pb-16">
                        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/60 rounded-[48px] p-10 text-white relative overflow-hidden border border-white/5 shadow-2xl">
                            {/* Decorative Blur */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl" />

                            <div className="flex flex-col items-center mb-8 relative z-10">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full scale-110" />
                                    <img src={driverImg} className="w-28 h-28 rounded-[40px] object-cover border-2 border-white/10 shadow-2xl relative z-10" alt="Driver Profile" />
                                    <label className="absolute -bottom-2 -right-2 bg-white w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer shadow-xl text-slate-900 active:scale-90 transition-transform z-20 border border-white/10">
                                        <span className="material-icons-round text-lg">camera_alt</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                    </label>
                                </div>
                                <div className="mt-6 text-center">
                                    <h2 className="text-3xl font-black tracking-tight mb-1">{driverName}</h2>
                                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.4em]">RANK: CERTIFIED DRIVER</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div className="bg-white/5 rounded-3xl p-5 border border-white/5 backdrop-blur-md">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Rating</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-mono font-black">4.9</span>
                                        <span className="material-icons-round text-amber-500 text-[16px]">star</span>
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded-3xl p-5 border border-white/5 backdrop-blur-md">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Punctuality</p>
                                    <p className="text-2xl font-mono font-black text-[#10b981]">98%</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 rounded-[40px] p-8 border border-white/5 space-y-6 backdrop-blur-sm">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-2">Account Settings</h3>
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-indigo-400 uppercase ml-2 tracking-widest">Real Name</label>
                                    <input value={driverName} onChange={e => setDriverName(e.target.value)} className="w-full h-14 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white focus:bg-white/10 focus:border-indigo-500/30 transition-all outline-none" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-indigo-400 uppercase ml-2 tracking-widest">Contact Phone</label>
                                    <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className="w-full h-14 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white focus:bg-white/10 focus:border-indigo-500/30 transition-all outline-none" />
                                </div>
                                <button
                                    onClick={saveProfile}
                                    disabled={isSavingProfile}
                                    className="w-full h-16 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 mt-4"
                                >
                                    {isSavingProfile ? 'UPDATING...' : 'SAVE PROFILE'}
                                </button>
                            </div>
                        </div>

                        {/* Vehicle Selection Section */}
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-2">Vehicle Assets</h3>
                            <button
                                onClick={() => setIsVehicleDeclaring(true)}
                                className={`w-full bg-white/5 rounded-[40px] p-8 border transition-all flex items-center justify-between text-left group active:scale-[0.98] ${declaredTime ? 'border-primary/40 ring-4 ring-primary/10' : 'border-white/5'}`}
                            >
                                <div className="flex items-center gap-5">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-lg ${declaredTime ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500'}`}>
                                        <span className="material-icons-round text-2xl">local_shipping</span>
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-white leading-tight">{selectedVehicle?.model || 'No Vehicle'}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{selectedVehicle?.plate || '-'} • {selectedVehicle?.type || '-'}</p>
                                        {declaredTime && (
                                            <p className="text-[9px] text-emerald-400 font-black uppercase mt-2 tracking-widest flex items-center gap-1">
                                                <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                                                Active Since {declaredTime}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${selectedVehicle?.status === 'repair' || selectedVehicle?.status === 'maintenance' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                        {selectedVehicle?.status === 'repair' || selectedVehicle?.status === 'maintenance' ? 'OUT OF SVC' : 'READY'}
                                    </span>
                                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest group-hover:scale-110 transition-transform">Update</span>
                                </div>
                            </button>
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
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-2xl z-[110] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="bg-[#1e293b] w-full max-w-md mx-auto rounded-t-[48px] p-10 shadow-[0_-20px_80px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom duration-500 max-h-[90vh] flex flex-col">
                        <header className="flex justify-between items-start mb-10 flex-shrink-0">
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tight">Vehicle Assets</h2>
                                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-2">Deploy your transport for today's mission</p>
                            </div>
                            <button onClick={() => setIsVehicleDeclaring(false)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 border border-white/10 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-10">
                            {vehicles.map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => handleDeclareVehicle(v)}
                                    disabled={v.status === 'maintenance' || v.status === 'repair'}
                                    className={`w-full p-8 rounded-[36px] border transition-all text-left flex items-center justify-between group active:scale-[0.98] ${selectedVehicle?.id === v.id ? 'bg-indigo-600 border-indigo-500 shadow-2xl shadow-indigo-600/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${selectedVehicle?.id === v.id ? 'bg-white text-indigo-600' : 'bg-white/5 text-slate-500'}`}>
                                            <span className="material-icons-round text-2xl">local_shipping</span>
                                        </div>
                                        <div>
                                            <h4 className={`text-base font-black ${selectedVehicle?.id === v.id ? 'text-white' : 'text-slate-200'}`}>{v.model}</h4>
                                            <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${selectedVehicle?.id === v.id ? 'text-indigo-200' : 'text-slate-500'}`}>{v.plate} • {v.type}</p>
                                        </div>
                                    </div>
                                    {v.status === 'maintenance' || v.status === 'repair' ? (
                                        <span className="bg-rose-500/20 text-rose-500 text-[8px] font-black uppercase px-3 py-1.5 rounded-xl border border-rose-500/20 tracking-widest">In Repair</span>
                                    ) : (
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedVehicle?.id === v.id ? 'border-white bg-white text-indigo-600' : 'border-slate-700'}`}>
                                            {selectedVehicle?.id === v.id && <span className="material-icons-round text-[14px]">check</span>}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="bg-indigo-500/10 p-6 rounded-[32px] border border-indigo-500/20 mb-6 flex items-start gap-4">
                            <span className="material-icons-round text-indigo-400 text-lg">info</span>
                            <p className="text-[10px] text-indigo-300 font-bold leading-relaxed uppercase tracking-wider">
                                Mandatory: You must declare the active vehicle before starting any mission to ensure real-time tracking accuracy.
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
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-2xl z-[110] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="bg-[#1e293b] w-full max-w-md mx-auto rounded-t-[48px] p-10 shadow-[0_-20px_80px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom duration-500 max-h-[92vh] flex flex-col">
                        <header className="flex justify-between items-start mb-10 flex-shrink-0">
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tight">Mission Brief</h2>
                                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-2">NO: {selectedOrder.id.slice(0, 12)} • {selectedOrder.status.toUpperCase()}</p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 border border-white/10 shadow-sm">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">Destination Info</h4>
                                <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                                            <span className="material-icons-round text-lg">person</span>
                                        </div>
                                        <span className="text-base font-black text-white">{selectedOrder.customerName}</span>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-500 shrink-0 border border-white/10">
                                            <span className="material-icons-round text-lg">place</span>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-sm font-bold text-slate-400 leading-relaxed block">{selectedOrder.address}</span>
                                            <a
                                                href={getGoogleMapsUrl(selectedOrder.address)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 mt-3 text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/10 hover:bg-indigo-500/20 transition-all"
                                            >
                                                <span className="material-icons-round text-xs">open_in_new</span>
                                                Navigate
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">Payload / Items</h4>
                                <div className="bg-white/5 border border-white/5 rounded-[32px] divide-y divide-white/5 overflow-hidden">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="p-6 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-5">
                                                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 border border-white/5">
                                                    <span className="material-icons-round">restaurant</span>
                                                </div>
                                                <span className="text-sm font-black text-slate-200">{item.name}</span>
                                            </div>
                                            <div className="px-4 py-2 bg-indigo-600/20 rounded-xl border border-indigo-600/20">
                                                <span className="text-xs font-mono font-black text-indigo-400">x{item.quantity}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white p-8 rounded-[40px] text-slate-900 flex justify-between items-center shadow-[0_20px_50px_rgba(255,255,255,0.05)]">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Total Amount Receivable</p>
                                    <h4 className="text-4xl font-mono font-black tracking-tighter">RM {selectedOrder.amount.toFixed(2)}</h4>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className="bg-slate-100 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-slate-500 border border-slate-200">CASH ON DLV</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-10 flex gap-4">
                            <button onClick={() => setSelectedOrder(null)} className="flex-1 h-16 bg-white/5 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-white/10 active:scale-95 transition-all">Dismiss</button>
                            {selectedOrder.status !== OrderStatus.COMPLETED && (
                                <button onClick={() => { handleWhatsApp(selectedOrder); setSelectedOrder(null); }} className="px-8 h-16 bg-[#25D366] text-white rounded-2xl font-black text-xs uppercase shadow-xl shadow-[#25D366]/20 active:scale-95 transition-all">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-6 h-6" alt="WA" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <nav className="fixed bottom-0 left-0 right-0 bg-[#1e293b]/80 backdrop-blur-2xl border-t border-white/5 flex justify-around items-start pt-4 safe-bottom h-[96px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] rounded-t-[40px] no-print z-40">
                <button onClick={() => setCurrentView('tasks')} className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'tasks' ? 'text-white' : 'text-slate-500 hover:text-slate-400'}`}>
                    <div className={`p-2 rounded-2xl transition-all ${currentView === 'tasks' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30 ring-4 ring-indigo-600/10' : ''}`}>
                        <span className="material-icons-round text-xl">local_shipping</span>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${currentView === 'tasks' ? 'text-indigo-400' : 'text-slate-600'}`}>Missions</span>
                </button>
                <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'history' ? 'text-white' : 'text-slate-500 hover:text-slate-400'}`}>
                    <div className={`p-2 rounded-2xl transition-all ${currentView === 'history' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30 ring-4 ring-indigo-600/10' : ''}`}>
                        <span className="material-icons-round text-xl">history</span>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${currentView === 'history' ? 'text-indigo-400' : 'text-slate-600'}`}>Records</span>
                </button>
                <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'profile' ? 'text-white' : 'text-slate-500 hover:text-slate-400'}`}>
                    <div className={`p-2 rounded-2xl transition-all ${currentView === 'profile' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30 ring-4 ring-indigo-600/10' : ''}`}>
                        <span className="material-icons-round text-xl">person</span>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${currentView === 'profile' ? 'text-indigo-400' : 'text-slate-600'}`}>Profile</span>
                </button>
            </nav>
        </div>
    );
};
export default DriverSchedule;