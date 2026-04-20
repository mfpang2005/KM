import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService, UserService, VehicleService, api } from '../src/services/api';
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
    type?: 'text' | 'audio' | 'recall'; // 增加 recall 类型
    duration?: number;
    isRecalled?: boolean; // 增加已撤回标志位
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
            const data = await VehicleService.getAll();
            if (data) {
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
                            duration: msg.duration,
                            isRecalled: msg.is_recalled
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
                if (!msg || msg.sender_id === userId) return; // ignore own messages or null
                
                // 仅同步全局消息或发送给本人的
                const isTargeted = !msg.receiver_id || msg.receiver_id === 'GLOBAL' || msg.receiver_id === userId;
                if (!isTargeted) return;

                addMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'guest',
                    content: msg.content,
                    timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                    isMine: false,
                    type: (msg.type as any) || 'text',
                    duration: msg.duration,
                    isRecalled: msg.is_recalled
                });

                if (msg.type === 'audio' && msg.content) {
                    await playAudio(msg.content);
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (msg && msg.is_recalled) {
                    console.log('[PTT] Syncing recall state from DB UPDATE:', msg.id);
                    setDriverChatMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRecalled: true } : m));
                }
            })
            .subscribe();

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
        } catch (e: any) {
            console.error("Failed to update status", e);
            alert(`更新订单状态失败: ${e.response?.data?.detail || e.message}`);
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
                                
                                // 处理撤回指令 (New)
                                if (payload.type === 'recall') {
                                    const targetId = payload.id || payload.msgId;
                                    if (!targetId) return;
                                    console.log('[GoEasy PTT] Remote recall signal received:', targetId);
                                    setDriverChatMessages(prev => prev.map(m => m.id === targetId ? { ...m, isRecalled: true } : m));
                                    return;
                                }

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

    // ── 撤回消息逻辑 ──────────────────────────────────────────────────
    const handleRecall = async (msgId: string) => {
        if (!window.confirm('确定要撤回这条消息吗？撤回后所有人都将无法查看。')) return;

        try {
            // 1. 调用后端接口更新 DB
            await api.patch(`/audio/recall/${msgId}`);

            // 2. 本地 UI 立即反馈
            setDriverChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, isRecalled: true } : m));

            // 3. 通过 GoEasy 广播撤回信令
            if (goEasyRef.current) {
                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify({ type: 'recall', id: msgId }),
                    onSuccess: () => console.log('[GoEasy] Recall broadcasted:', msgId),
                });
            }
        } catch (err) {
            console.error('Recall failed:', err);
            alert('撤回失败，请稍后重试');
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
                const msgId = self.crypto.randomUUID();

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
                    alert(`数据库存入失败 (Error ${error.code}): ${error.message}\n请联系管理员确认消息表结构（duration 字段可能丢失）。`);
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
        const msgId = self.crypto.randomUUID();
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

    const handleWhatsApp = (order: Order, type: 'general' | 'arrival' | 'departure' = 'general') => {
        if (!order || !order.customerPhone) return;
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        let message = `你好 ${order.customerName}，我是金龙餐饮的配送司机。我正在配送您的订单 ${order.id}，预计于 ${order.dueTime} 左右到达。`;
        
        if (type === 'arrival' || type === 'departure') {
            message = `[金龙餐饮] 出发通知%0A----------------------%0A尊敬的 ${order.customerName}，您的订单 ${order.order_number || order.id.slice(0, 8)} 司机已整装出发！%0A%0A预计 30-90 分钟送达，请保持电话畅通。%0A配送地址: ${order.address}%0A%0A祝您用餐愉快！`;
            setNotifiedOrders(prev => new Set(prev).add(order.id));
        }

        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const handleDeclareVehicle = async (vehicle: Vehicle) => {
        if (!userId) return;
        try {
            // Check if vehicle is already taken by someone else (Front-end safeguard)
            if (vehicle.driver_id && vehicle.driver_id !== userId) {
                alert(`该车辆已被司机 ${vehicle.driver_name || '其他同事'} 占用`);
                return;
            }

            await VehicleService.assignToDriver(userId, vehicle.id);
            setSelectedVehicle(vehicle);
            setDeclaredTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setIsVehicleDeclaring(false);
            fetchUserProfile(userId);
            fetchVehicles();
        } catch (error: any) {
            console.error("Failed to declare vehicle", error);
            alert(`车辆指派失败: ${error.response?.data?.detail || error.message}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0F172A] relative text-white selection:bg-sky-500/30 overflow-hidden">
            {/* 顶栏 (Premium Glass) */}
            <header className="pt-14 pb-8 px-8 bg-slate-900/60 backdrop-blur-3xl sticky top-0 z-[60] border-b border-white/5 flex items-center justify-between no-print shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-5">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-sky-500/20 blur-xl rounded-2xl group-hover:bg-sky-500/40 transition-all"></div>
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/10 p-0.5 relative z-10 bg-slate-800 shadow-2xl">
                            <img src={driverImg} className="w-full h-full object-cover rounded-xl" alt="Driver" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full z-20 shadow-lg"></div>
                    </div>
                    <div>
                        <h1 className="text-22px font-black text-white tracking-tight leading-none mb-1.5">{driverName}</h1>
                        <div className="flex items-center gap-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                             <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.25em]">
                                {currentView === 'tasks' ? `TASKS: ${taskOrders.length}` : currentView === 'history' ? `DONE: ${historyOrders.length}` : 'PROFILE'}
                             </p>
                        </div>
                    </div>
                </div>
                {currentView === 'tasks' && (
                    <div className="flex gap-3">
                        <button 
                            onClick={() => { if (!isPttOpen) startPttSession(); }} 
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-2xl active:scale-90 border overflow-hidden relative group ${isPttOpen ? 'bg-sky-600 border-sky-400 shadow-sky-600/30' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                        >
                            {isPttOpen && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
                            <span className={`material-icons-round text-xl relative z-10 ${isPttOpen ? 'text-white translate-y-[-1px]' : 'text-slate-500'}`}>cell_tower</span>
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto px-6 space-y-8 no-scrollbar pb-36 no-print relative z-10 pt-6">
                {/* 装饰性背景 */}
                <div className="fixed top-1/4 -right-20 w-64 h-64 bg-sky-600/10 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="fixed bottom-1/4 -left-20 w-80 h-80 bg-blue-600/5 rounded-full blur-[120px] pointer-events-none"></div>

                {currentView === 'tasks' && (
                    <>
                        {activeOrder && (
                            <section className="relative group">
                                <div className="flex items-center justify-between px-3 mb-4">
                                    <h2 className="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em]">正在运行的任务 / LIVE</h2>
                                    <div className="flex items-center gap-2 py-1 px-3 bg-rose-500/10 rounded-full border border-rose-500/20">
                                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                                         <span className="text-[9px] font-mono font-black text-rose-500 uppercase tracking-widest">{activeOrder.dueTime}</span>
                                    </div>
                                </div>
                                <div className="relative rounded-[48px] overflow-hidden group active:scale-[0.98] transition-all duration-300 shadow-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur-3xl p-1">
                                    {/* 炫光边框效果 */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/20 via-transparent to-emerald-500/20 opacity-40"></div>
                                    
                                    <div className="relative bg-slate-900/90 rounded-[46px] overflow-hidden">
                                        <div className="h-1.5 w-full bg-white/5">
                                            <div className="h-full bg-gradient-to-r from-sky-500 via-emerald-500 to-sky-500 bg-[length:200%_auto] animate-gradient-x transition-all duration-1000 shadow-[0_0_15px_rgba(56,189,248,0.5)]"
                                                style={{ width: activeOrder.status === OrderStatus.DELIVERING ? '66%' : '33%' }} />
                                        </div>
                                        <div className={`px-8 py-3 flex items-center justify-between transition-colors border-b border-white/5 ${notifiedOrders.has(activeOrder.id) ? 'bg-emerald-500/10 text-emerald-400' : isNoticeTime ? 'bg-orange-500/10 text-orange-400' : 'bg-transparent text-slate-500'}`}>
                                            <div className="flex items-center gap-2">
                                                <span className="material-icons-round text-[14px]">{notifiedOrders.has(activeOrder.id) ? 'check_circle' : 'sensors'}</span>
                                                <span className="text-[8px] font-black uppercase tracking-[0.3em]">
                                                    {notifiedOrders.has(activeOrder.id) ? 'STATUS: NOTIFIED' : isNoticeTime ? 'WARNING: NEAR DEADLINE' : 'STATUS: LIVE TRACKING'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-8 pt-6 space-y-7">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-3xl font-black text-white tracking-tighter leading-[0.9] mb-2">{activeOrder.customerName}</h3>
                                                    <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.4em]">订单号 • {activeOrder.order_number || activeOrder.id.slice(0, 8)}</p>
                                                </div>
                                                <button onClick={() => navigate(`/orders/${encodeURIComponent(activeOrder.id)}`)} className="w-14 h-14 bg-white/5 rounded-[22px] flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all hover:bg-sky-600 hover:border-sky-400 group/btn shadow-xl shadow-black/40">
                                                    <span className="material-icons-round group-hover/btn:scale-110 transition-transform">inventory_2</span>
                                                </button>
                                            </div>
                                            <div className="flex items-start gap-5 p-6 bg-white/[0.03] rounded-[32px] border border-white/5 group/addr hover:bg-white/[0.05] transition-colors">
                                                <div className="w-10 h-10 bg-sky-500/10 rounded-2xl flex items-center justify-center shrink-0 border border-sky-500/20">
                                                    <span className="material-icons-round text-sky-400">place</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[14px] font-black text-slate-200 leading-tight mb-4">{activeOrder.address}</p>
                                                    <div className="flex gap-3">
                                                        <a href={getGoogleMapsUrl(activeOrder.address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-500/10 text-sky-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-sky-500/20 active:scale-95 transition-all shadow-lg shadow-sky-900/10"><span className="material-icons-round text-xs">navigation</span>Google Map</a>
                                                        <button onClick={() => { window.location.href = `tel:${activeOrder.customerPhone}`; }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 active:scale-95 transition-all"><span className="material-icons-round text-xs">phone</span>拨打客户电话号码</button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-4">
                                                {activeOrder.status === OrderStatus.READY ? (
                                                    <button onClick={() => handleUpdateStatus(activeOrder.id, OrderStatus.DELIVERING)} className="w-full h-16 bg-gradient-to-r from-sky-600 via-blue-600 to-sky-600 bg-[length:200%_auto] animate-gradient-x text-white rounded-[24px] font-black text-xs uppercase tracking-[0.3em] shadow-[0_15px_40px_rgba(14,165,233,0.4)] active:scale-[0.97] transition-all flex items-center justify-center gap-4 border border-white/10">
                                                        <span className="material-icons-round text-xl">local_shipping</span>START DEPLOYMENT
                                                    </button>
                                                ) : (
                                                    <div className="flex gap-4">
                                                        <button onClick={() => handleWhatsApp(activeOrder, 'arrival')} className={`flex-[0.35] h-16 rounded-[28px] flex flex-col items-center justify-center border transition-all active:scale-95 ${notifiedOrders.has(activeOrder.id) ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 ring-4 ring-emerald-500/10' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'}`}>
                                                            <span className="material-icons-round text-[16px] mb-1">near_me</span><span className="text-[8px] font-black uppercase tracking-[0.15em]">通知出发</span>
                                                        </button>
                                                        <button onClick={() => navigate('/driver/confirm', { state: { orderId: activeOrder.id } })} className="flex-1 h-16 bg-white text-slate-950 rounded-[28px] font-black text-xs uppercase tracking-[0.3em] shadow-[0_15px_30px_rgba(255,255,255,0.15)] active:scale-[0.97] transition-all flex items-center justify-center gap-3">
                                                            <span className="material-icons-round text-xl">camera_alt</span>订单送达
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                        {upcomingOrders.length > 0 && (
                            <section className="space-y-6 pt-2">
                                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-3">后续排程 / INCOMING</h2>
                                <div className="space-y-4">
                                    {upcomingOrders.map(order => (
                                        <div key={order.id} className="group p-6 rounded-[36px] border border-white/5 active:scale-[0.98] transition-all flex items-center gap-6 bg-white/[0.03] backdrop-blur-3xl hover:bg-white/[0.06] hover:border-white/10" onClick={() => setSelectedOrder(order)}>
                                            <div className="w-16 h-16 bg-white/5 rounded-2xl flex flex-col items-center justify-center border border-white/5 shadow-inner">
                                                <span className="text-[18px] font-mono font-black text-white leading-none">{order.dueTime.split(':')[0]}</span>
                                                <span className="text-[8px] font-black text-sky-400 uppercase mt-1 tracking-tighter">{order.dueTime.split(' ')[1]}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-base font-black text-white truncate mb-1">{order.customerName}</h4>
                                                <div className="flex items-center gap-1.5 opacity-50">
                                                    <span className="material-icons-round text-[12px]">place</span>
                                                    <p className="text-[11px] text-slate-300 font-bold uppercase truncate">{order.address}</p>
                                                </div>
                                            </div>
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 group-hover:text-sky-400 group-hover:bg-sky-500/10 transition-all">
                                                <span className="material-icons-round">chevron_right</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
                {currentView === 'history' && (
                    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-3">历史交付 / RECORDS</h2>
                        <div className="space-y-4">
                            {historyOrders.map(order => (
                                <div key={order.id} className="group p-6 rounded-[36px] border border-white/5 active:scale-[0.98] transition-all flex items-center gap-6 bg-white/[0.02] backdrop-blur-3xl hover:bg-white/[0.05]" onClick={() => setSelectedOrder(order)}>
                                    <div className="w-16 h-16 bg-emerald-500/10 rounded-[22px] flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)] group-hover:bg-emerald-500/20 transition-colors">
                                        <span className="material-icons-round text-2xl">verified</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="text-base font-black text-white truncate pr-4">{order.customerName}</h4>
                                            <span className="text-xs font-mono font-black text-emerald-400 whitespace-nowrap">RM {order.amount.toFixed(2)}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic">MISSION ACCOMPLISHED</p>
                                    </div>
                                    <span className="material-icons-round text-slate-700 group-hover:text-white transition-colors">chevron_right</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                {currentView === 'profile' && (
                    <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                        <div className="bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 rounded-[56px] p-12 text-white relative overflow-hidden border border-white/5 shadow-2xl">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-600/10 rounded-full blur-[80px]" />
                            <div className="flex flex-col items-center mb-10 relative z-10">
                                <div className="relative group/avatar">
                                    <div className="absolute inset-0 bg-sky-500/20 blur-3xl rounded-full scale-125 group-hover/avatar:bg-sky-500/40 transition-all" />
                                    <img src={driverImg} className="w-32 h-32 rounded-[48px] object-cover border-2 border-white/10 shadow-3xl relative z-10 p-1 bg-slate-800" alt="Driver Profile" />
                                    <label className="absolute -bottom-2 -right-2 bg-white w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer shadow-2xl text-slate-900 active:scale-90 transition-all z-20 border-4 border-slate-900 hover:bg-sky-50">
                                        <span className="material-icons-round text-xl">photo_camera</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                    </label>
                                </div>
                                <div className="mt-8 text-center">
                                    <h2 className="text-3xl font-black tracking-tight mb-2 uppercase">{driverName}</h2>
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="h-[1px] w-4 bg-sky-500/50"></div>
                                        <span className="text-[10px] text-sky-400 font-black uppercase tracking-[0.5em]">CERTIFIED DRIVER</span>
                                        <div className="h-[1px] w-4 bg-sky-500/50"></div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-5 relative z-10">
                                <div className="bg-white/[0.03] rounded-[32px] p-6 border border-white/5 backdrop-blur-xl">
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Service Rating</p>
                                    <div className="flex items-end gap-2">
                                        <span className="text-3xl font-mono font-black italic">4.9</span>
                                        <span className="material-icons-round text-amber-400 text-lg mb-1 animate-pulse">star</span>
                                    </div>
                                </div>
                                <div className="bg-white/[0.03] rounded-[32px] p-6 border border-white/5 backdrop-blur-xl">
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Punctuality</p>
                                    <div className="flex items-end gap-1">
                                        <span className="text-3xl font-mono font-black text-emerald-400">98%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/[0.02] rounded-[48px] p-10 border border-white/5 space-y-8 backdrop-blur-xl">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] pl-2 text-center">Security & Identity</h3>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-sky-400 uppercase ml-4 tracking-[0.3em]">Official Display Name</label>
                                    <input value={driverName} onChange={e => setDriverName(e.target.value)} className="w-full h-16 px-8 bg-white/[0.03] border border-white/10 rounded-[24px] text-sm font-black text-white outline-none focus:bg-white/[0.08] focus:border-sky-500/50 transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-sky-400 uppercase ml-4 tracking-[0.3em]">Emergency Contact</label>
                                    <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className="w-full h-16 px-8 bg-white/[0.03] border border-white/10 rounded-[24px] text-sm font-black text-white outline-none focus:bg-white/[0.08] focus:border-sky-500/50 transition-all" />
                                </div>
                                <button onClick={saveProfile} disabled={isSavingProfile} className="w-full h-18 bg-white text-slate-950 rounded-[28px] font-black text-[11px] uppercase tracking-[0.4em] shadow-3xl active:scale-[0.97] transition-all disabled:opacity-50 mt-4 hover:bg-slate-100 flex items-center justify-center gap-3">
                                    {isSavingProfile ? <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div> : 'UPDATE PROFILE'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] pl-4">Vehicle Assets</h3>
                            <button onClick={() => setIsVehicleDeclaring(true)} className={`w-full bg-white/[0.02] rounded-[48px] p-10 border transition-all flex items-center justify-between text-left group active:scale-[0.98] ${declaredTime ? 'border-primary/40 bg-sky-500/5 ring-8 ring-sky-500/5' : 'border-white/5'}`}>
                                <div className="flex items-center gap-6">
                                    <div className={`w-18 h-18 rounded-3xl flex items-center justify-center transition-all shadow-2xl ${declaredTime ? 'bg-sky-600 text-white scale-110' : 'bg-white/5 text-slate-500'}`}>
                                        <span className="material-icons-round text-3xl">local_shipping</span>
                                    </div>
                                    <div>
                                        <p className="text-xl font-black text-white leading-tight tracking-tight uppercase">{selectedVehicle?.model || 'No Deploy'}</p>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.25em] mt-1.5">{selectedVehicle?.plate_no || 'Pending Selection'} • {selectedVehicle?.type || 'Standard'}</p>
                                        {declaredTime && (
                                            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                                                <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></span>
                                                <span className="text-[8px] font-black uppercase tracking-widest tracking-tighter">Mission Active: {declaredTime}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <span className="material-icons-round text-slate-700 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all">arrow_forward_ios</span>
                            </button>
                        </div>

                        <div className="pt-4 flex flex-col gap-6">
                             <a 
                                href="https://wa.me/60197288226" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="w-full h-18 bg-emerald-500/5 border border-emerald-500/10 rounded-[32px] flex items-center justify-center gap-4 text-emerald-400 active:scale-95 transition-all text-xs font-black uppercase tracking-widest"
                             >
                                <span className="material-icons-round">support_agent</span>
                                CONTACT DISPATCH CENTER
                             </a>

                             <button 
                                className="w-full h-18 bg-rose-500/10 text-rose-500 rounded-[32px] border border-rose-500/20 active:scale-95 transition-all flex items-center justify-between px-10" 
                                onClick={async () => {
                                    if(window.confirm('Confirm logout from Central Fleet?')) {
                                        await supabase.auth.signOut();
                                        navigate('/login');
                                    }
                                }}
                            >
                                <div className="flex items-center gap-3"><span className="material-icons-round">logout</span><span className="text-[10px] font-black uppercase tracking-[0.3em]">Secure Logout</span></div>
                                <span className="text-[8px] font-bold opacity-40">V4.2.0-STABLE</span>
                            </button>
                        </div>
                    </section>
                )}
            </main>

            {isVehicleDeclaring && (
                <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-3xl z-[150] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="absolute inset-0" onClick={() => setIsVehicleDeclaring(false)}></div>
                    <div className="bg-slate-900 w-full max-w-lg mx-auto rounded-t-[56px] p-12 shadow-[0_-20px_100px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom-[50%] duration-700 max-h-[85vh] flex flex-col relative z-10">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 shrink-0"></div>
                        <header className="flex justify-between items-start mb-10 flex-shrink-0">
                            <div>
                                <h2 className="text-4xl font-black text-white tracking-tighter">Deploy Vehicle</h2>
                                <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.4em] mt-3 underline decoration-sky-500/30 underline-offset-4">Fleet Asset Activation</p>
                            </div>
                        </header>
                        
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-12">
                            {vehicles.map(v => {
                                const isOccupied = v.driver_id && v.driver_id !== userId;
                                const isMaintenance = v.status === 'maintenance' || v.status === 'repair';
                                const isSelected = selectedVehicle?.plate_no === v.plate_no;
                                const isDisabled = isMaintenance || (isOccupied && !isSelected);

                                return (
                                    <button 
                                        key={v.id} 
                                        onClick={() => handleDeclareVehicle(v)} 
                                        disabled={isDisabled} 
                                        className={`w-full p-8 rounded-[40px] border transition-all text-left flex items-center justify-between group active:scale-[0.98] ${
                                            isSelected 
                                                ? 'bg-sky-600 border-sky-400 shadow-[0_20px_40px_rgba(56,189,248,0.3)] ring-4 ring-sky-600/20' 
                                                : isDisabled
                                                    ? 'bg-white/[0.01] border-white/5 opacity-40 grayscale cursor-not-allowed'
                                                    : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center gap-7">
                                            <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center transition-all ${isSelected ? 'bg-white text-sky-600 scale-110' : 'bg-white/5 text-slate-500'}`}>
                                                <span className="material-icons-round text-2xl">local_shipping</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <h4 className="text-lg font-black tracking-tight text-white">{v.model}</h4>
                                                    {isOccupied && !isSelected && (
                                                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase rounded-md border border-amber-500/20">Occupied</span>
                                                    )}
                                                </div>
                                                <p className={`text-[10px] font-black uppercase tracking-widest mt-1.5 ${isSelected ? 'text-sky-200' : 'text-slate-500'}`}>
                                                    {v.plate_no} • {v.type}
                                                    {isOccupied && !isSelected && ` • ${v.driver_name || 'Driver'}`}
                                                </p>
                                            </div>
                                        </div>
                                        {isMaintenance ? (
                                            <span className="text-[8px] font-black uppercase px-4 py-2 bg-rose-500/20 text-rose-500 rounded-full border border-rose-500/20">Under Repair</span>
                                        ) : isSelected ? (
                                            <span className="material-icons-round text-white text-2xl drop-shadow-lg">check_circle</span>
                                        ) : isOccupied ? (
                                            <span className="material-icons-round text-amber-500/40 text-xl">block</span>
                                        ) : (
                                            <span className="material-icons-round text-slate-700 opacity-0 group-hover:opacity-100 transition-all">add_circle_outline</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <div className="bg-sky-500/10 p-8 rounded-[36px] border border-sky-500/20 mb-4 flex items-start gap-5 backdrop-blur-xl">
                            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 flex items-center justify-center shrink-0 border border-sky-500/20">
                                <span className="material-icons-round text-sky-400 text-xl">security</span>
                            </div>
                            <p className="text-[11px] text-sky-300 font-bold leading-relaxed uppercase tracking-widest italic">Compliance: Your asset selection must match the physical vehicle used for real-time fleet analytics and safety protocols.</p>
                        </div>
                    </div>
                </div>
            )}

            {isPttOpen && (
                <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-3xl z-[200] flex flex-col animate-in fade-in duration-300">
                    <div className="px-8 pt-16 pb-6 flex justify-between items-center border-b border-white/5 shrink-0 bg-slate-900/40">
                        <div className="flex items-center gap-4 text-white">
                            <div className="w-12 h-12 bg-sky-500/20 rounded-2xl flex items-center justify-center text-sky-400 border border-sky-500/20 shadow-lg ring-4 ring-sky-500/5 anim-glow">
                                <span className="material-icons-round text-2xl">cell_tower</span>
                            </div>
                            <div>
                                <h2 className="font-black text-sm uppercase tracking-[0.3em]">Fleet Dispatch</h2>
                                <p className="text-[10px] font-black uppercase tracking-widest mt-1 flex items-center gap-1.5" style={{ color: pttStatus === 'CONNECTED' || pttStatus === 'TALKING' || pttStatus === 'LISTENING' ? '#4ade80' : '#64748b' }}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${pttStatus === 'CONNECTED' || pttStatus === 'TALKING' || pttStatus === 'LISTENING' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                                    {pttStatus === 'CONNECTING' ? 'Initializing...' : pttStatus === 'CONNECTED' ? 'Live Channel: Community' : pttStatus === 'TALKING' ? 'Transmitting Voice...' : pttStatus === 'LISTENING' ? 'Incoming Signal...' : 'System Offline'}
                                </p>
                            </div>
                        </div>
                        <button onClick={stopPttSession} className="w-14 h-14 bg-white/[0.03] border border-white/10 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-white/10 shadow-2xl">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar relative">
                        {/* 装饰水印 */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                             <span className="text-[120px] font-black uppercase rotate-[-20deg] select-none tracking-tighter">DISPATCH</span>
                        </div>

                        {driverChatMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4">
                                <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center">
                                    <span className="material-icons-round text-4xl opacity-20">forum</span>
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Establish Communication</p>
                            </div>
                        ) : driverChatMessages.map((msg) => {
                            if (!msg || !msg.id) return null;
                            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                                <div key={msg.id} className={`flex gap-3.5 animate-in slide-in-from-bottom-2 duration-300 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-lg border border-white/5 ${msg.senderRole === 'driver' ? 'bg-sky-600' : 'bg-blue-600'}`}>
                                        <span className="material-icons-round text-white text-lg">person</span>
                                    </div>
                                    <div className={`max-w-[75%] flex flex-col gap-1.5 ${msg.isMine ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-2 px-1">
                                            {!msg.isMine && <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest">{msg.senderLabel}</span>}
                                            <span className="text-[8px] text-slate-500 font-mono font-bold">{time}</span>
                                        </div>
                                        <div className="relative group">
                                            {msg.isRecalled ? (
                                                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/50 text-slate-500 rounded-[22px] text-[10px] font-black border border-white/5 italic backdrop-blur-xl">
                                                    <span className="material-icons-round text-xs">remove_circle_outline</span>
                                                    MESSAGE RECALLED
                                                </div>
                                            ) : msg.type === 'audio'
                                                ? <AudioPlayer
                                                    audioUrl={msg.content}
                                                    initialDuration={msg.duration}
                                                    autoPlay={!msg.isMine && msg.id === latestIncomingId}
                                                  />
                                                : (
                                                <div className={`px-5 py-3 rounded-[24px] text-[14px] font-bold leading-relaxed shadow-2xl backdrop-blur-2xl ${msg.isMine ? 'bg-sky-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none border border-white/5 shadow-sky-900/10'}`}>
                                                    {msg.content}
                                                </div>
                                            )}

                                            {msg.isMine && !msg.isRecalled && (
                                                <button
                                                    onClick={() => handleRecall(msg.id)}
                                                    className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all bg-slate-900/80 text-slate-500 hover:text-rose-500 p-2 rounded-xl border border-white/10 shadow-2xl scale-75 group-hover:scale-100"
                                                >
                                                    <span className="material-icons-round text-lg">undo</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatBottomRef} />
                    </div>
                    
                    <div className="shrink-0 border-t border-white/5 py-10 flex flex-col items-center gap-6 bg-slate-900/20 backdrop-blur-xl relative">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-sky-600 text-[8px] font-black uppercase tracking-[0.4em] rounded-full shadow-lg shadow-sky-600/20 border border-white/10">
                            Push to Talk Mode
                        </div>
                        
                        <div className="relative group">
                            {isTransmitting && (
                                <div className="absolute inset-0 rounded-full bg-sky-500/40 animate-ping scale-150 opacity-20"></div>
                            )}
                            <button 
                                onMouseDown={handlePttDown} 
                                onMouseUp={handlePttUp} 
                                onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} 
                                onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }} 
                                disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'} 
                                className={`w-28 h-28 rounded-full border-2 transition-all flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative active:scale-95 z-10 ${isTransmitting ? 'bg-sky-500 border-white/40 scale-110 shadow-sky-500/40' : 'bg-slate-800 border-white/10 hover:bg-slate-700'}`}
                            >
                                <span className={`material-icons-round text-4xl text-white ${isTransmitting ? 'animate-pulse' : ''}`}>{isTransmitting ? 'mic' : 'mic_none'}</span>
                            </button>
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-500 animate-pulse italic">Holding to Transmit Signal</p>
                    </div>

                    <div className="shrink-0 px-4 pb-8 pt-3 border-t border-white/5 flex items-center gap-3">
                        <button 
                            onMouseDown={handlePttDown} 
                            onMouseUp={handlePttUp} 
                            onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }}
                            disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 shrink-0 shadow-xl active:scale-90 ${isTransmitting 
                                ? 'bg-sky-600 text-white animate-pulse ring-4 ring-sky-600/20' 
                                : 'bg-slate-800 text-slate-400 border border-white/10 hover:bg-slate-700'
                            }`}
                        >
                            <span className="material-icons-round text-xl">{isTransmitting ? 'mic' : 'mic_none'}</span>
                        </button>
                        <div className={`flex-1 flex items-center rounded-2xl px-6 py-3 border transition-all duration-300 gap-3 ${isTransmitting ? 'bg-sky-600/20 border-sky-600/40' : 'bg-slate-800 border-white/10'}`}>
                            <input 
                                type="text" 
                                value={driverChatInput} 
                                onChange={(e) => setDriverChatInput(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') sendDriverTextMessage(); }} 
                                placeholder={isTransmitting ? '正在发射 / TRANSMITTING...' : "输入文字消息..."} 
                                disabled={isTransmitting}
                                className={`flex-1 bg-transparent text-sm outline-none font-medium ${isTransmitting ? 'text-sky-400' : 'text-white'}`} 
                            />
                        </div>
                        <button onClick={sendDriverTextMessage} disabled={isTransmitting || !driverChatInput.trim()} className="w-12 h-12 bg-sky-600 disabled:bg-slate-700 rounded-2xl text-white flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-sky-600/20">
                            <span className="material-icons-round">send</span>
                        </button>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-3xl z-[150] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="absolute inset-0" onClick={() => setSelectedOrder(null)}></div>
                    <div className="bg-slate-900 w-full max-w-lg mx-auto rounded-t-[56px] p-12 shadow-[0_-20px_100px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom-[50%] duration-700 max-h-[92vh] flex flex-col relative z-10">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 shrink-0"></div>
                        <header className="flex justify-between items-start mb-10 shrink-0">
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tighter">任务详情</h2>
                                <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.4em] mt-3 underline decoration-sky-500/30 underline-offset-4">订单编号: {selectedOrder.order_number || selectedOrder.id.slice(0, 12)}</p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="w-14 h-14 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 transition-all"><span className="material-icons-round">close</span></button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pb-10">
                            <div className="bg-white/[0.03] p-8 rounded-[40px] border border-white/5 space-y-6 backdrop-blur-xl">
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 bg-sky-500/10 rounded-2xl flex items-center justify-center text-sky-400 border border-sky-500/20">
                                        <span className="material-icons-round text-lg">person</span>
                                    </div>
                                    <span className="text-lg font-black text-white tracking-tight uppercase">{selectedOrder.customerName}</span>
                                </div>
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                        <span className="material-icons-round text-lg">phone</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-300 font-mono italic">{selectedOrder.customerPhone}</span>
                                </div>
                                <div className="flex items-start gap-5">
                                    <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                        <span className="material-icons-round text-lg">place</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-400 leading-tight tracking-tight">{selectedOrder.address}</span>
                                </div>
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                        <span className="material-icons-round text-lg">schedule</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-300 font-mono italic">
                                        {selectedOrder.dueTime ? (selectedOrder.dueTime.includes('T') ? new Date(selectedOrder.dueTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) : selectedOrder.dueTime) : (selectedOrder.eventTime || '未设置时间')}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] pl-4">配送清单</h4>
                                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-xl">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="p-6 flex justify-between items-center border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] transition-colors">
                                            <span className="text-[14px] font-black text-slate-100 uppercase tracking-tight">{item.name}</span>
                                            <span className="text-xs font-black font-mono text-sky-400 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">x{item.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-[32px] text-slate-950 flex justify-between items-center shadow-2xl transition-all">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-50">总计金额</span>
                               <h4 className="text-2xl font-mono font-black tracking-tighter italic">RM {selectedOrder.amount.toFixed(2)}</h4>
                            </div>
                        </div>
                        <div className="pt-4 flex gap-4 shrink-0">
                            <button onClick={() => { handleUpdateStatus(selectedOrder.id, selectedOrder.status === OrderStatus.READY ? OrderStatus.DELIVERING : OrderStatus.COMPLETED); setSelectedOrder(null); }} className="flex-1 h-16 bg-sky-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95">
                                {selectedOrder.status === OrderStatus.READY ? '确认接收工作' : '订单送达'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900/80 backdrop-blur-3xl border border-white/10 flex justify-around items-center h-[76px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-[38px] no-print z-[80] overflow-hidden">
                <button 
                    onClick={() => setCurrentView('tasks')} 
                    className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-all relative ${currentView === 'tasks' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {currentView === 'tasks' && <div className="absolute inset-0 bg-sky-600/10"></div>}
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'tasks' ? 'text-sky-400 scale-110' : ''}`}>
                        <span className="material-icons-round text-[22px]">local_shipping</span>
                    </div>
                </button>
                <div className="w-[1px] h-6 bg-white/5"></div>
                <button 
                    onClick={() => setCurrentView('history')} 
                    className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-all relative ${currentView === 'history' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {currentView === 'history' && <div className="absolute inset-0 bg-sky-600/10"></div>}
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'history' ? 'text-sky-400 scale-110' : ''}`}>
                        <span className="material-icons-round text-[22px]">history</span>
                    </div>
                </button>
                <div className="w-[1px] h-6 bg-white/5"></div>
                <button 
                    onClick={() => setCurrentView('profile')} 
                    className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-all relative ${currentView === 'profile' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {currentView === 'profile' && <div className="absolute inset-0 bg-sky-600/10"></div>}
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'profile' ? 'text-sky-400 scale-110' : ''}`}>
                        <span className="material-icons-round text-[22px]">person</span>
                    </div>
                </button>
            </nav>
        </div>
    );
};
export default DriverSchedule;