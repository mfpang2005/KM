import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService, UserService, api } from '../src/services/api';
import { Order, OrderStatus, User, Vehicle } from '../types';
import GoEasy from 'goeasy';
import { supabase } from '../src/lib/supabase';
import { getGoogleMapsUrl } from '../src/utils/maps';
import AudioPlayer from '../src/components/AudioPlayer';

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
    type?: 'text' | 'audio';
    duration?: number;
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
    // NOTE: 追踪最新收到的语音消息 ID，用于触发 AudioPlayer autoPlay
    const [latestIncomingId, setLatestIncomingId] = useState<string | null>(null);

    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);
    const goEasyRef = useRef<InstanceType<typeof GoEasy> | null>(null);
    const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);
    const messageIdsRef = useRef<Set<string>>(new Set());
    const recordStartTimeRef = useRef<number | null>(null);

    const addMessage = useCallback((msg: DriverChatMsg) => {
        // 1. 根据 ID 去重
        if (messageIdsRef.current.has(msg.id)) return;

        // 2. 根据内容指纹去重（针对同一发送者在极短时间内发送的相同内容）
        const fingerprint = `${msg.senderId}:${msg.type}:${msg.content.slice(0, 50)}:${Math.floor(msg.timestamp / 1000)}`;
        if (messageIdsRef.current.has(fingerprint)) return;

        messageIdsRef.current.add(msg.id);
        messageIdsRef.current.add(fingerprint);
        setDriverChatMessages(prev => [...prev, msg]);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    /** 用户交互解锁音频权限 */
    const unlockAudio = useCallback(() => {
        if (audioUnlocked) return;
        const SILENT_WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const audio = new Audio(`data:audio/wav;base64,${SILENT_WAV}`);
        audio.volume = 0.01;
        audio.play()
            .then(() => {
                setAudioUnlocked(true);
                console.log('[Driver PTT] Audio context unlocked');
            })
            .catch((e) => {
                console.warn('[Driver PTT] Unlock failed:', e);
                setAudioUnlocked(true);
            });
        silentAudioRef.current = audio;
    }, [audioUnlocked]);

    // --- NEW: 监听全局点击以隐形解锁音频 ---
    useEffect(() => {
        if (audioUnlocked) return;
        const handleFirstClick = () => {
            unlockAudio();
            window.removeEventListener('click', handleFirstClick);
            window.removeEventListener('touchstart', handleFirstClick);
        };
        window.addEventListener('click', handleFirstClick);
        window.addEventListener('touchstart', handleFirstClick);
        return () => {
            window.removeEventListener('click', handleFirstClick);
            window.removeEventListener('touchstart', handleFirstClick);
        };
    }, [audioUnlocked, unlockAudio]);

    const playAudio = useCallback(async (content: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        try {
            // --- NEW: Handle HTTP URL directly ---
            if (content.startsWith('http')) {
                const audio = new Audio(content);
                audio.onended = () => setPttStatus('CONNECTED');
                audio.play().catch(e => console.error('[GoEasy PTT] Play error', e));
                setPttStatus('LISTENING');
                return;
            }

            // Handle potential data URI prefix or raw base64
            const base64 = content.startsWith('data:') ? content.split(',')[1] : content;
            
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
                    plate_no: profile.vehicle_plate || '', type: profile.vehicle_type || '',
                    status: (profile.vehicle_status as any) || 'available'
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
                const mappedVehicles: Vehicle[] = data.map(v => ({
                    ...v,
                    plate_no: v.plate_no || v.plate
                }));
                setVehicles(mappedVehicles);
                // Try to find if user is assigned to any vehicle in the fetched fleet
                if (userId) {
                    const assigned = mappedVehicles.find(v => v.driver_id === userId);
                    if (assigned) {
                        setSelectedVehicle(assigned);
                        setDeclaredTime('已同步');
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch vehicles", error);
        }
    };

    // ── Supabase Presence & Orders Sync ──
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id);
                fetchUserProfile(session.user.id);
            }
        });

        fetchOrders();
        fetchVehicles();

        const vehicleChannel = supabase.channel('public:vehicles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => fetchVehicles())
            .subscribe();

        const orderChannel = supabase.channel('driver-orders-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
            .subscribe();

        // Broadcast presence so Admin can see the driver
        let presenceChannel: any = null;
        if (userId) {
            presenceChannel = supabase.channel('walkie-talkie-room', {
                config: { presence: { key: userId } },
            });
            presenceChannel.subscribe(async (status: string) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        userId: userId,
                        email: driverPhone || 'Driver', // Use phone or 'Driver'
                        role: 'driver',
                        joinedAt: new Date().toISOString()
                    });
                }
            });
        }

        const timer = setInterval(() => setNow(new Date()), 10000);

        return () => {
            clearInterval(timer);
            supabase.removeChannel(vehicleChannel);
            supabase.removeChannel(orderChannel);
            if (presenceChannel) supabase.removeChannel(presenceChannel);
        };
    }, [userId, driverPhone]);

    useEffect(() => {
        if (!isPttOpen || !userId) return;
        const fetchHistory = async () => {
            try {
                const { data, error } = await supabase.from('messages')
                    .select('*')
                    .eq('receiver_id', 'GLOBAL')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                if (data) {
                    const history = data.reverse().map(msg => {
                        messageIdsRef.current.add(msg.id);
                        return {
                            id: msg.id,
                            senderId: msg.sender_id,
                            senderLabel: msg.sender_label || 'Unknown',
                            senderRole: msg.sender_role || 'guest',
                            type: (msg.type as any) || 'text',
                            content: msg.content,
                            timestamp: new Date(msg.created_at).getTime(),
                            isMine: msg.sender_id === userId,
                            duration: msg.duration
                        };
                    });
                    setDriverChatMessages(history);
                }
            } catch (err) {
                console.error('Failed to fetch driver chat history', err);
            }
        };
        fetchHistory();

        // ── Supabase Realtime Listener ──
        const channel = supabase.channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                const msg = payload.new;
                if (msg.sender_id === userId) return; // ignore own messages

                addMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'guest',
                    content: msg.content,
                    timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                    isMine: false,
                    type: (msg.type as any) || 'text',
                    duration: msg.duration
                });

                if (msg.type === 'audio' && msg.content) {
                    await playAudio(msg.content);
                }
            }).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [isPttOpen, userId, addMessage, playAudio]);

    const taskOrders = useMemo(() => orders.filter(o =>
        o.status === OrderStatus.READY || o.status === OrderStatus.DELIVERING
    ), [orders]);

    const historyOrders = useMemo(() => orders.filter(o => o.status === OrderStatus.COMPLETED), [orders]);

    const activeOrder = taskOrders.find(o => o.status === OrderStatus.DELIVERING) || taskOrders[0];
    const upcomingOrders = taskOrders.filter(o => o.id !== activeOrder?.id);

    const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
        try {
            await OrderService.updateStatus(orderId, status);
            fetchOrders();
            
            // If starting delivery, trigger WhatsApp departure message
            if (status === OrderStatus.DELIVERING) {
                const order = orders.find(o => o.id === orderId);
                if (order) {
                    handleWhatsApp(order, 'arrival'); // 'arrival' type uses the departure template
                }
            }
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



    const startPttSession = async () => {
        setIsPttOpen(true);
        setPttStatus('CONNECTING');

        const doConnect = () => {
            try {
                const goEasy = GoEasy.getInstance({
                    host: GOEASY_HOST,
                    appkey: GOEASY_APPKEY,
                    modules: ['pubsub'],
                });
                goEasyRef.current = goEasy;

                const myId = userId || `driver-${Math.random().toString(36).slice(2, 9)}`;
                goEasy.connect({
                    id: myId,
                    data: { role: 'driver' },
                    onSuccess: () => {
                        setPttStatus('CONNECTED');

                        // NOTE: 统一的消息处理函数，全局和私人频道共用，避免重复逻辑
                        const handleIncoming = async (message: any) => {
                            try {
                                const payload = JSON.parse(message.content);
                                if (payload.senderId === myId) return;
                                
                                // 仅处理发送到 GLOBAL 全局广播频道的消息
                                if (payload.receiverId !== 'GLOBAL') return;

                                const msgId = payload.id || `${payload.senderId}-${payload.timestamp}`;
                                // NOTE: 兼容 content 和 audio 两种字段格式
                                const audioContent = payload.content || payload.audio;

                                if (payload.type === 'text') {
                                    addMessage({
                                        id: msgId,
                                        senderId: payload.senderId,
                                        senderLabel: payload.senderLabel ?? '管理员',
                                        senderRole: payload.senderRole ?? 'admin',
                                        content: payload.content,
                                        timestamp: payload.timestamp || Date.now(),
                                        isMine: false,
                                        type: 'text',
                                        duration: payload.duration
                                    });
                                } else if (payload.type === 'audio' && audioContent) {
                                    addMessage({
                                        id: msgId,
                                        senderId: payload.senderId,
                                        senderLabel: payload.senderLabel ?? '管理员',
                                        senderRole: payload.senderRole ?? 'admin',
                                        content: audioContent,
                                        timestamp: payload.timestamp || Date.now(),
                                        isMine: false,
                                        type: 'audio',
                                        duration: payload.duration
                                    });
                                    // NOTE: 通知最新收到的音频 ID，让 AudioPlayer 自动播放
                                    setLatestIncomingId(msgId);
                                }
                            } catch (err) {
                                console.error('[GoEasy PTT] Failed to handle message', err);
                            }
                        };

                        // 订阅全局广播频道
                        goEasy.pubsub.subscribe({
                            channel: CHANNEL,
                            onMessage: handleIncoming,
                            onSuccess: () => console.log('[GoEasy] Subscribed to GLOBAL dispatch'),
                            onFailed: (err: any) => console.error('[GoEasy] Subscribe GLOBAL failed', err),
                        });
                    },
                    onFailed: () => setPttStatus('IDLE'),
                    onDisconnected: () => setPttStatus('IDLE')
                });
            } catch (e) {
                console.error('[GoEasy] Init error', e);
                setPttStatus('IDLE');
            }
        };

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

        try {
            const myId = userId || `driver-${Math.random().toString(36).slice(2, 9)}`;
            const ch = supabase.channel('walkie-talkie-room', {
                config: { presence: { key: myId } },
            });
            ch.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await ch.track({
                        userId: myId,
                        email: driverName || '司机端',
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

    const handlePttDown = async () => {
        if (pttStatus !== 'CONNECTED') return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.start(100);
            mediaRecorderRef.current = mr;
            recordStartTimeRef.current = Date.now();
            setIsTransmitting(true);
            setPttStatus('TALKING');
        } catch {
            alert('请允许麦克风权限以使用对讲功能。');
        }
    };

    const handlePttUp = () => {
        if (!mediaRecorderRef.current || !isTransmitting) return;
        setIsTransmitting(false);
        setPttStatus('CONNECTED');
        const mr = mediaRecorderRef.current;
        mr.onstop = async () => {
            if (!goEasyRef.current) return;
            try {
                const mimeType = mr.mimeType || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                console.log(`[Driver PTT] Blob size: ${blob.size} bytes`);
                if (blob.size < 100) {
                    console.warn('[Driver PTT] Blob too small, ignoring.');
                    return;
                }

                // --- NEW: Upload to Backend Storage ---
                const formData = new FormData();
                formData.append('file', blob, `voice_driver_${userId || 'unknown'}_${Date.now()}.webm`);
                
                const { data: uploadResult } = await api.post('/audio/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                
                const audioUrl = uploadResult.url;
                if (!audioUrl) throw new Error('Upload failed: No URL returned');

                const myId = userId || 'unknown-driver';
                const myName = driverName || '司机端';
                const ts = Date.now();
                const dur = recordStartTimeRef.current ? (ts - recordStartTimeRef.current) / 1000 : 0;
                const msgId = `${myId}-${ts}`;

                console.log(`[Driver PTT] Sending audio URL ${msgId}, dur=${dur.toFixed(1)}s`);

                // NOTE: 本地立即显示气泡
                addMessage({
                    id: msgId,
                    senderId: myId,
                    senderLabel: myName,
                    senderRole: 'driver',
                    content: audioUrl, // Store URL
                    timestamp: ts,
                    isMine: true,
                    type: 'audio',
                    duration: dur
                });

                // NOTE: 广播到全局频道
                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify({
                        id: msgId,
                        type: 'audio',
                        senderId: myId,
                        senderLabel: myName,
                        senderRole: 'driver',
                        content: audioUrl,
                        timestamp: ts,
                        receiverId: 'GLOBAL',
                        duration: dur
                    }),
                    onSuccess: () => console.log('[Driver PTT] GoEasy URL broadcast success'),
                    onFailed: (e: any) => console.error('[Driver PTT] GoEasy URL broadcast failed', e)
                });

                // NOTE: 同步保存到 Supabase
                const { error } = await supabase.from('messages').insert([{
                    id: msgId,
                    sender_id: myId,
                    sender_label: myName,
                    sender_role: 'driver',
                    receiver_id: 'GLOBAL',
                    content: audioUrl,
                    type: 'audio',
                    duration: dur
                }]);

                if (error) {
                    console.error('[Driver PTT] DB Insert failed:', error);
                    // alert(`声音保存失败: ${error.message} (${error.code})。如果提示列不存在，请在 Supabase SQL 执行：ALTER TABLE messages ADD COLUMN duration FLOAT DEFAULT 0;`);
                } else {
                    console.log('[Driver PTT] DB Insert success');
                }
            } catch (err) {
                console.error('[Driver PTT] Catch Error:', err);
                alert(`发送失败: ${(err as Error).message}`);
            }
            audioChunksRef.current = [];
        };
        mr.stop();
        mr.stream.getTracks().forEach(t => t.stop());
    };

    const stopPttSession = () => {
        if (goEasyRef.current) {
            try {
                goEasyRef.current.pubsub.unsubscribe({ channel: CHANNEL, onSuccess: () => {}, onFailed: () => {} });
            } catch {}
        }
        mediaRecorderRef.current?.stop();
        try {
            GoEasy.disconnect({ onSuccess: () => {}, onFailed: () => {} });
        } catch {}
        if (presenceChannelRef.current) {
            supabase.removeChannel(presenceChannelRef.current);
            presenceChannelRef.current = null;
        }
        setIsPttOpen(false);
        setPttStatus('IDLE');
        goEasyRef.current = null;
    };

    const sendDriverTextMessage = () => {
        const text = driverChatInput.trim();
        if (!text || !goEasyRef.current || pttStatus === 'IDLE' || pttStatus === 'CONNECTING') return;

        const myId = userId || 'unknown-driver';
        const ts = Date.now();
        const msgId = `${myId}-${ts}`;
        const myName = driverName || '司机端';

        // 乐观 UI
        addMessage({
            id: msgId,
            senderId: myId,
            senderLabel: myName,
            senderRole: 'driver',
            content: text,
            timestamp: ts,
            isMine: true,
            type: 'text'
        });
        setDriverChatInput('');

        const payload = {
            id: msgId,
            type: 'text',
            senderId: myId,
            senderLabel: myName,
            senderRole: 'driver',
            content: text,
            timestamp: ts,
            receiverId: 'GLOBAL'
        };

        goEasyRef.current.pubsub.publish({
            channel: CHANNEL,
            message: JSON.stringify(payload),
        });

        const insertMsg = async () => {
            try {
                await supabase.from('messages').insert([{
                    id: msgId,
                    sender_id: myId,
                    sender_label: myName,
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
            message = `[金龙餐饮] 出发通知%0A----------------------%0A尊敬的 ${order.customerName}，您的订单 ${order.order_number || order.id.slice(0, 8)} 司机已整装出发！%0A%0A预计30-90分钟送达，请耐心等待和保持电话畅通。%0A配送地址: ${order.address}%0A%0A祝您用餐愉快！`;
            setNotifiedOrders(prev => new Set(prev).add(order.id));
        }
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleDeclareVehicle = async (vehicle: Vehicle) => {
        try {
            await api.post('/vehicles/assign', {
                driver_id: userId,
                vehicle_id: vehicle.id
            });
            setSelectedVehicle(vehicle);
            setDeclaredTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setIsVehicleDeclaring(false);
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
                    <div className="flex gap-2 items-center">
                        <button onClick={() => { if (!isPttOpen) startPttSession(); }} className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-90 ${isPttOpen ? 'bg-primary text-white animate-pulse' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                            <span className="material-icons-round text-sm">cell_tower</span>
                        </button>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-2" title="Fleet Central Link Active"></div>
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
                                <div className="relative rounded-[40px] overflow-hidden group active:scale-[0.98] transition-transform shadow-2xl border border-white/10 bg-white/5 backdrop-blur-3xl">
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
                                                <button onClick={() => navigate(`/orders/${encodeURIComponent(activeOrder.id)}`)} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all hover:bg-white/10">
                                                    <span className="material-icons-round">inventory_2</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4 p-5 bg-white/5 rounded-[24px] border border-white/5">
                                            <span className="material-icons-round text-indigo-400 mt-1">place</span>
                                            <div className="flex-1">
                                                <p className="text-[13px] font-bold text-slate-300 leading-relaxed">{activeOrder.address}</p>
                                                <div className="flex gap-2 mt-4">
                                                    <a href={getGoogleMapsUrl(activeOrder.address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-500/20 active:scale-95 transition-all"><span className="material-icons-round text-xs">navigation</span>Google Maps</a>
                                                    <button onClick={() => { window.location.href = `tel:${activeOrder.customerPhone}`; }} className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-white/10 active:scale-95 transition-all"><span className="material-icons-round text-xs">phone</span>拨号</button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            {activeOrder.status === OrderStatus.READY ? (
                                                <button onClick={() => handleUpdateStatus(activeOrder.id, OrderStatus.DELIVERING)} className="w-full h-16 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 border border-white/10">
                                                    <span className="material-icons-round text-xl">local_shipping</span>START DELIVERY
                                                </button>
                                            ) : (
                                                <div className="flex gap-3">
                                                    <button onClick={() => handleWhatsApp(activeOrder, 'arrival')} className={`flex-[0.4] h-16 rounded-[24px] flex flex-col items-center justify-center border-2 transition-all active:scale-95 ${notifiedOrders.has(activeOrder.id) ? 'bg-[#10b981]/10 border-[#10b981]/40 text-[#10b981]' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                                                        <span className="material-icons-round text-sm mb-1">near_me</span><span className="text-[8px] font-black uppercase tracking-[0.1em]">Notify</span>
                                                    </button>
                                                    <button onClick={() => navigate('/driver/confirm', { state: { orderId: activeOrder.id } })} className="flex-1 h-16 bg-white text-slate-900 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3">
                                                        <span className="material-icons-round text-xl">camera_alt</span>COMPLETE
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
                                        <div key={order.id} className="group p-6 rounded-[32px] border border-white/5 active:scale-[0.98] transition-all flex items-center gap-5 bg-white/[0.02] backdrop-blur-lg" onClick={() => setSelectedOrder(order)}>
                                            <div className="w-14 h-14 bg-white/5 rounded-2xl flex flex-col items-center justify-center border border-white/5">
                                                <span className="text-[16px] font-mono font-black text-white leading-none">{order.dueTime.split(':')[0]}</span><span className="text-[8px] font-black text-indigo-400 uppercase mt-1">PM</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-black text-white truncate">{order.customerName}</h4><p className="text-[10px] text-slate-500 font-bold uppercase mt-1 truncate">{order.address}</p>
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
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">历史交付 / Record</h2>
                        <div className="space-y-3">
                            {historyOrders.map(order => (
                                <div key={order.id} className="group p-6 rounded-[32px] border border-white/5 active:scale-[0.98] transition-all flex items-center gap-5 bg-white/[0.02] backdrop-blur-lg" onClick={() => setSelectedOrder(order)}>
                                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]"><span className="material-icons-round text-xl">done_all</span></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start"><h4 className="text-sm font-black text-white truncate pr-2">{order.customerName}</h4><span className="text-xs font-mono font-black text-indigo-400">RM {order.amount.toFixed(2)}</span></div>
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
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl" />
                            <div className="flex flex-col items-center mb-8 relative z-10">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full scale-110" />
                                    <img src={driverImg} className="w-28 h-28 rounded-[40px] object-cover border-2 border-white/10 shadow-2xl relative z-10" alt="Driver Profile" />
                                    <label className="absolute -bottom-2 -right-2 bg-white w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer shadow-xl text-slate-900 active:scale-90 transition-transform z-20 border border-white/10">
                                        <span className="material-icons-round text-lg">camera_alt</span><input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                    </label>
                                </div>
                                <div className="mt-6 text-center"><h2 className="text-3xl font-black tracking-tight mb-1">{driverName}</h2><p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.4em]">RANK: CERTIFIED DRIVER</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div className="bg-white/5 rounded-3xl p-5 border border-white/5 backdrop-blur-md"><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Rating</p><div className="flex items-center gap-2"><span className="text-2xl font-mono font-black">4.9</span><span className="material-icons-round text-amber-500 text-[16px]">star</span></div></div>
                                <div className="bg-white/5 rounded-3xl p-5 border border-white/5 backdrop-blur-md"><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Punctuality</p><p className="text-2xl font-mono font-black text-[#10b981]">98%</p></div>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-[40px] p-8 border border-white/5 space-y-6 backdrop-blur-sm">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-2">Account Settings</h3>
                            <div className="space-y-5">
                                <div className="space-y-2"><label className="text-[9px] font-black text-indigo-400 uppercase ml-2 tracking-widest">Real Name</label><input value={driverName} onChange={e => setDriverName(e.target.value)} className="w-full h-14 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white outline-none" /></div>
                                <div className="space-y-2"><label className="text-[9px] font-black text-indigo-400 uppercase ml-2 tracking-widest">Contact Phone</label><input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className="w-full h-14 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white outline-none" /></div>
                                <button onClick={saveProfile} disabled={isSavingProfile} className="w-full h-16 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 mt-4">{isSavingProfile ? 'UPDATING...' : 'SAVE PROFILE'}</button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-2">Vehicle Assets</h3>
                            <button onClick={() => setIsVehicleDeclaring(true)} className={`w-full bg-white/5 rounded-[40px] p-8 border transition-all flex items-center justify-between text-left group active:scale-[0.98] ${declaredTime ? 'border-primary/40 ring-4 ring-primary/10' : 'border-white/5'}`}>
                                <div className="flex items-center gap-5">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-lg ${declaredTime ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500'}`}><span className="material-icons-round text-2xl">local_shipping</span></div>
                                    <div>
                                        <p className="text-lg font-black text-white leading-tight">{selectedVehicle?.model || 'No Vehicle'}</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{selectedVehicle?.plate_no || '-'} • {selectedVehicle?.type || '-'}</p>
                                        {declaredTime && <p className="text-[9px] text-emerald-400 font-black uppercase mt-2 tracking-widest flex items-center gap-1"><span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />Active Since {declaredTime}</p>}
                                    </div>
                                </div>
                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest group-hover:scale-110 transition-transform">Update</span>
                            </button>
                        </div>
                        <button 
                            className="w-full px-6 py-4 flex items-center justify-between bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20 active:scale-95 transition-all" 
                            onClick={async () => {
                                await supabase.auth.signOut();
                                navigate('/login');
                            }}
                        >
                            <div className="flex items-center gap-3"><span className="material-icons-round">logout</span><span className="text-xs font-bold">退出登录 LOGOUT</span></div>
                            <span className="material-icons-round">chevron_right</span>
                        </button>
                    </section>
                )}
            </main>

            {isVehicleDeclaring && (
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-2xl z-[110] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="bg-[#1e293b] w-full max-w-md mx-auto rounded-t-[48px] p-10 shadow-[0_-20px_80px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom duration-500 max-h-[90vh] flex flex-col">
                        <header className="flex justify-between items-start mb-10 flex-shrink-0">
                            <div><h2 className="text-3xl font-black text-white tracking-tight">Vehicle Assets</h2><p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-2">Deploy your transport for today's mission</p></div>
                            <button onClick={() => setIsVehicleDeclaring(false)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 border border-white/10 transition-all"><span className="material-icons-round">close</span></button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-10">
                            {vehicles.map(v => (
                                <button key={v.id} onClick={() => handleDeclareVehicle(v)} disabled={v.status === 'maintenance' || v.status === 'repair' || selectedVehicle?.plate_no === v.plate_no} className={`w-full p-8 rounded-[36px] border transition-all text-left flex items-center justify-between group active:scale-[0.98] ${selectedVehicle?.plate_no === v.plate_no ? 'bg-indigo-600 border-indigo-500 shadow-2xl opacity-80' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                    <div className="flex items-center gap-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${selectedVehicle?.plate_no === v.plate_no ? 'bg-white text-indigo-600' : 'bg-white/5 text-slate-500'}`}><span className="material-icons-round text-2xl">local_shipping</span></div>
                                        <div><h4 className="text-base font-black">{v.model}</h4><p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-60">{v.plate_no} • {v.type}</p></div>
                                    </div>
                                    {v.status === 'maintenance' || v.status === 'repair' ? <span className="text-[8px] font-black uppercase px-3 py-1.5 bg-rose-500/20 text-rose-500 rounded-xl">In Repair</span> : (selectedVehicle?.plate_no === v.plate_no && <span className="material-icons-round text-white">check_circle</span>)}
                                </button>
                            ))}
                        </div>
                        <div className="bg-indigo-500/10 p-6 rounded-[32px] border border-indigo-500/20 mb-6 flex items-start gap-4">
                            <span className="material-icons-round text-indigo-400 text-lg">info</span><p className="text-[10px] text-indigo-300 font-bold leading-relaxed uppercase tracking-wider">Mandatory: You must declare the active vehicle before starting any mission to ensure real-time tracking accuracy.</p>
                        </div>
                    </div>
                </div>
            )}

            {isPttOpen && (
                <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex flex-col animate-in fade-in duration-300">
                    <div className="px-6 pt-12 pb-4 flex justify-between items-center border-b border-white/5 shrink-0">
                        <div className="flex items-center gap-3 text-white">
                            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary border border-primary/20"><span className="material-icons-round">cell_tower</span></div>
                            <div><h2 className="font-black text-sm uppercase tracking-widest">GoEasy 对讲频道</h2><p className="text-[10px] font-bold uppercase tracking-tight" style={{ color: pttStatus === 'CONNECTED' || pttStatus === 'TALKING' || pttStatus === 'LISTENING' ? '#4ade80' : '#64748b' }}>{pttStatus === 'CONNECTING' ? '连接中...' : pttStatus === 'CONNECTED' ? 'LIVE · KIM_LONG_COMUNITY' : pttStatus === 'TALKING' ? '正在发射...' : pttStatus === 'LISTENING' ? '收到信号...' : '已断开'}</p></div>
                        </div>
                        <button onClick={stopPttSession} className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform"><span className="material-icons-round">close</span></button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {driverChatMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2"><span className="material-icons-round text-3xl">chat_bubble_outline</span><p className="text-xs font-bold">暂无消息</p></div>
                        ) : driverChatMessages.map((msg) => {
                            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                                <div key={msg.id} className={`flex gap-2.5 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.senderRole === 'driver' ? 'bg-primary' : 'bg-purple-500'}`}><span className="material-icons-round text-white text-[12px]">person</span></div>
                                    <div className={`max-w-[70%] flex flex-col gap-0.5 ${msg.isMine ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-1.5">{!msg.isMine && <span className="text-[9px] font-black text-slate-400">{msg.senderLabel}</span>}<span className="text-[9px] text-slate-600">{time}</span></div>
                                        <div className={`rounded-2xl text-sm font-medium ${msg.isMine ? 'bg-transparent' : 'bg-transparent'}`}>
                                            {msg.type === 'audio'
                                                ? <AudioPlayer
                                                    audioUrl={msg.content}
                                                    initialDuration={msg.duration}
                                                    autoPlay={!msg.isMine && msg.id === latestIncomingId}
                                                  />
                                                : (
                                                <div className={`px-3.5 py-2 rounded-2xl text-sm font-medium ${msg.isMine ? 'bg-primary text-white rounded-tr-sm' : 'bg-slate-700/80 text-slate-100 rounded-tl-sm'}`}>
                                                    {msg.content}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatBottomRef} />
                    </div>
                    <div className="shrink-0 border-t border-white/5 py-8 flex flex-col items-center gap-4">
                        <button onMouseDown={handlePttDown} onMouseUp={handlePttUp} onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }} disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'} className={`w-24 h-24 rounded-full border-4 transition-all flex items-center justify-center shadow-2xl relative active:scale-95 ${isTransmitting ? 'bg-primary border-white/20 scale-110 shadow-primary/50' : 'bg-slate-700 border-white/10'}`}>
                            {isTransmitting && <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30"></div>}<span className="material-icons-round text-3xl text-white">{isTransmitting ? 'mic' : 'mic_none'}</span>
                        </button>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Hold to Transmit</p>
                    </div>
                    <div className="shrink-0 px-4 pb-8 pt-3 border-t border-white/5 flex items-center gap-3">
                        <button 
                            onMouseDown={handlePttDown} 
                            onMouseUp={handlePttUp} 
                            onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }}
                            disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 shrink-0 shadow-xl active:scale-90 ${isTransmitting 
                                ? 'bg-primary text-white animate-pulse ring-4 ring-primary/20' 
                                : 'bg-slate-800 text-slate-400 border border-white/10 hover:bg-slate-700'
                            }`}
                        >
                            <span className="material-icons-round text-xl">{isTransmitting ? 'mic' : 'mic_none'}</span>
                        </button>
                        <div className={`flex-1 flex items-center rounded-2xl px-6 py-3 border transition-all duration-300 gap-3 ${isTransmitting ? 'bg-primary/20 border-primary/40' : 'bg-slate-800 border-white/10'}`}>
                            <input 
                                type="text" 
                                value={driverChatInput} 
                                onChange={(e) => setDriverChatInput(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') sendDriverTextMessage(); }} 
                                placeholder={isTransmitting ? '正在发射 / TRANSMITTING...' : "输入文字消息..."} 
                                disabled={isTransmitting}
                                className={`flex-1 bg-transparent text-sm outline-none font-medium ${isTransmitting ? 'text-primary' : 'text-white'}`} 
                            />
                        </div>
                        <button onClick={sendDriverTextMessage} disabled={isTransmitting || !driverChatInput.trim()} className="w-12 h-12 bg-primary disabled:bg-slate-700 rounded-2xl text-white flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-primary/20">
                            <span className="material-icons-round">send</span>
                        </button>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-2xl z-[110] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="bg-[#1e293b] w-full max-w-md mx-auto rounded-t-[48px] p-10 shadow-[0_-20px_80px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom duration-500 max-h-[92vh] flex flex-col">
                        <header className="flex justify-between items-start mb-10 flex-shrink-0">
                            <div><h2 className="text-3xl font-black text-white tracking-tight">Mission Brief</h2><p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] mt-2">NO: {selectedOrder.id.slice(0, 12)} • {selectedOrder.status.toUpperCase()}</p></div>
                            <button onClick={() => setSelectedOrder(null)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400"><span className="material-icons-round">close</span></button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8">
                            <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 space-y-6">
                                <div className="flex items-center gap-4"><div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400"><span className="material-icons-round text-lg">person</span></div><span className="text-base font-black text-white">{selectedOrder.customerName}</span></div>
                                <div className="flex items-start gap-4"><div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-500 shrink-0"><span className="material-icons-round text-lg">place</span></div><span className="text-sm font-bold text-slate-400 leading-relaxed">{selectedOrder.address}</span></div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">Payload</h4>
                                <div className="bg-white/5 border border-white/5 rounded-[32px] divide-y divide-white/5 overflow-hidden">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="p-6 flex justify-between items-center"><span className="text-sm font-black text-slate-200">{item.name}</span><span className="text-xs font-mono font-black text-indigo-400">x{item.quantity}</span></div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white p-8 rounded-[40px] text-slate-900 flex justify-between items-center"><h4 className="text-4xl font-mono font-black tracking-tighter">RM {selectedOrder.amount.toFixed(2)}</h4></div>
                        </div>
                        <div className="pt-10 flex gap-4">
                            <button onClick={() => setSelectedOrder(null)} className="flex-1 h-16 bg-white/5 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-white/10 transition-all">Dismiss</button>
                        </div>
                    </div>
                </div>
            )}

            <nav className="fixed bottom-0 left-0 right-0 bg-[#1e293b]/80 backdrop-blur-2xl border-t border-white/5 flex justify-around items-start pt-4 safe-bottom h-[96px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] rounded-t-[40px] no-print z-40">
                <button onClick={() => setCurrentView('tasks')} className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'tasks' ? 'text-white' : 'text-slate-500'}`}><div className={`p-2 rounded-2xl ${currentView === 'tasks' ? 'bg-indigo-600' : ''}`}><span className="material-icons-round text-xl">local_shipping</span></div><span className="text-[8px] font-black uppercase tracking-widest">Missions</span></button>
                <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'history' ? 'text-white' : 'text-slate-500'}`}><div className={`p-2 rounded-2xl ${currentView === 'history' ? 'bg-indigo-600' : ''}`}><span className="material-icons-round text-xl">history</span></div><span className="text-[8px] font-black uppercase tracking-widest">Records</span></button>
                <button onClick={() => setCurrentView('profile')} className={`flex flex-col items-center gap-1.5 transition-all ${currentView === 'profile' ? 'text-white' : 'text-slate-500'}`}><div className={`p-2 rounded-2xl ${currentView === 'profile' ? 'bg-indigo-600' : ''}`}><span className="material-icons-round text-xl">person</span></div><span className="text-[8px] font-black uppercase tracking-widest">Profile</span></button>
            </nav>
        </div>
    );
};
export default DriverSchedule;