import React, { useState, useRef, useEffect, useCallback } from 'react';
import GoEasy from 'goeasy';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import AudioPlayer from '../components/AudioPlayer';

const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';
const CHANNEL = 'KIM_LONG_COMUNITY';

interface OnlineUser {
    userId: string;
    email: string;
    role: string;
    joinedAt: string;
}

/** 聊天消息数据结构 */
interface ChatMessage {
    id: string;
    senderId: string;
    senderLabel: string;
    senderRole: string;
    content: string;
    timestamp: number;
    isMine: boolean;
    type: 'text' | 'audio';
    receiverId: string;
    duration?: number;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: string; bubble: string }> = {
    super_admin: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700', icon: 'admin_panel_settings', bubble: 'bg-purple-500' },
    admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700', icon: 'manage_accounts', bubble: 'bg-blue-500' },
    kitchen: { label: 'Kitchen', color: 'bg-orange-100 text-orange-700', icon: 'soup_kitchen', bubble: 'bg-orange-500' },
    driver: { label: 'Driver', color: 'bg-green-100 text-green-700', icon: 'local_shipping', bubble: 'bg-green-500' },
    guest: { label: 'Guest', color: 'bg-slate-100 text-slate-600', icon: 'person', bubble: 'bg-slate-400' },
};

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });


export const WalkieTalkiePage: React.FC = () => {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [goEasyStatus, setGoEasyStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const [chatInput, setChatInput] = useState('');
    // NOTE: 私聊模式：selectedReceiver 为选中用户的 userId，null 表示未选择
    const [selectedReceiver, setSelectedReceiver] = useState<string | null>(null);

    // NOTE: 使用 Ref 存储已处理的消息 ID，防止 GoEasy 和 Supabase 重复触发
    const messageIdsRef = useRef<Set<string>>(new Set());
    const [isRecording, setIsRecording] = useState(false);
    // NOTE: 追踪最新收到的音频消息 ID，用于触发 autoPlay
    const [latestIncomingId, setLatestIncomingId] = useState<string | null>(null);
    // NOTE: 浏览器自动播放限制 —— 用户需先与页面交互才能解锁
    const [audioUnlocked, setAudioUnlocked] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const goEasyRef = useRef<InstanceType<typeof GoEasy> | null>(null);
    const fallbackIdRef = useRef<string>(`superadmin-${Math.random().toString(36).slice(2, 9)}`);
    const recordStartTimeRef = useRef<number | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);
    const currentGoEasyIdRef = useRef<string | null>(null);
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);

    const addMessage = useCallback((msg: ChatMessage) => {
        // 1. 根据 ID 去重
        if (messageIdsRef.current.has(msg.id)) return;

        // 2. 根据内容指纹去重（针对同一发送者在极短时间内发送的相同内容）
        const fingerprint = `${msg.senderId}:${msg.type}:${msg.content.slice(0, 50)}:${Math.floor(msg.timestamp / 1000)}`;
        if (messageIdsRef.current.has(fingerprint)) return;

        messageIdsRef.current.add(msg.id);
        messageIdsRef.current.add(fingerprint);
        setMessages(prev => [...prev, msg]);
    }, []);

    // 新消息自动滚到底部
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /**
     * 用户点击 "解锁音频" 按钮后，播放一段静音音频以激活浏览器的自动播放权限。
     * NOTE: 浏览器安全策略要求必须有用户主动交互后才能调用 audio.play()
     */
    const unlockAudio = () => {
        // 创建一段 0.1 秒的静音 wav (base64 编码)
        const SILENT_WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const audio = new Audio(`data:audio/wav;base64,${SILENT_WAV}`);
        audio.volume = 0.01;
        audio.play()
            .then(() => {
                setAudioUnlocked(true);
                console.log('[Walkie] Audio context unlocked');
            })
            .catch((e) => {
                console.warn('[Walkie] Unlock failed:', e);
                // 仍然标记为已解锁，依赖用户稍后手动点击 AudioPlayer
                setAudioUnlocked(true);
            });
        silentAudioRef.current = audio;
    };

    // ── GoEasy PubSub Connection ────────────────────────────────────
    useEffect(() => {
        if (!user || user.id === currentGoEasyIdRef.current) return;

        console.log('[GoEasy] Initializing for user:', user.id);
        currentGoEasyIdRef.current = user.id;

        const myId = user.id;
        const myLabel = user.email || 'Super Admin';
        const myRole = user.role || 'super_admin';

        let goEasy: any = null;

        const doConnect = () => {
            try {
                if (typeof (GoEasy as any).getInstance !== 'function') {
                    throw new Error('GoEasy.getInstance is not a function. Check GoEasy version or import.');
                }
                goEasy = (GoEasy as any).getInstance({
                    host: GOEASY_HOST,
                    appkey: GOEASY_APPKEY,
                    modules: ['pubsub'],
                });
                goEasyRef.current = goEasy;
                setGoEasyStatus('CONNECTING');

                goEasy.connect({
                    id: myId,
                    data: { email: myLabel, role: myRole },
                    onSuccess: () => {
                        setGoEasyStatus('CONNECTED');
                        if (!goEasy) return;
                        // NOTE: 订阅公共频道以接收其他人发给我的消息
                        goEasy.pubsub.subscribe({
                            channel: CHANNEL,
                            onMessage: async (message: { content: string }) => {
                                try {
                                    const payload = JSON.parse(message.content);
                                    if (payload.senderId === myId) return;

                                    const incomingId = payload.id || `${payload.senderId}-${payload.timestamp}`;

                                    if (payload.type === 'text') {
                                        addMessage({
                                            id: incomingId,
                                            senderId: payload.senderId,
                                            senderLabel: payload.senderLabel || payload.senderId,
                                            senderRole: payload.senderRole || 'driver',
                                            content: payload.content,
                                            timestamp: payload.timestamp || Date.now(),
                                            isMine: false,
                                            type: 'text',
                                            receiverId: payload.receiverId || myId,
                                            duration: payload.duration
                                        });
                                    } else if (payload.type === 'audio' || payload.audio) {
                                        const audioContent = payload.content || payload.audio;
                                        if (!audioContent) return;

                                        addMessage({
                                            id: incomingId,
                                            senderId: payload.senderId,
                                            senderLabel: payload.senderLabel || payload.senderId,
                                            senderRole: payload.senderRole || 'driver',
                                            content: audioContent,
                                            timestamp: payload.timestamp || Date.now(),
                                            isMine: false,
                                            type: 'audio',
                                            receiverId: payload.receiverId || myId,
                                            duration: payload.duration
                                        });
                                        // NOTE: 通知最新收到的音频 ID，让 AudioPlayer 触发 autoPlay
                                        setLatestIncomingId(incomingId);
                                    }
                                } catch (err) {
                                    console.error('[GoEasy] Failed to handle message', err);
                                }
                            },
                            onSuccess: () => console.log('[GoEasy] Subscribed to', CHANNEL),
                            onFailed: (err: { code: string; content: string }) =>
                                console.error('[GoEasy] Subscribe failed', err),
                        });
                    },
                    onFailed: (err: { code: string; content: string }) => {
                        console.error('[GoEasy] Connect failed', err);
                        setGoEasyStatus('DISCONNECTED');
                    },
                    onDisconnected: () => setGoEasyStatus('DISCONNECTED'),
                });
            } catch (err) {
                console.error('[GoEasy] SDK init error', err);
                setGoEasyStatus('DISCONNECTED');
            }
        };

        doConnect();

        return () => {
            if (goEasy) {
                goEasy.pubsub.unsubscribe({ channel: CHANNEL });
                // NOTE: GoEasy 2.x disconnect is instance method
                if (typeof goEasy.disconnect === 'function') goEasy.disconnect();
            }
        };
    }, [user?.id, addMessage]);

    // ── Supabase Messages Realtime Listener ────────────────────────
    useEffect(() => {
        const channel = supabase.channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                const msg = payload.new;
                if (msg.sender_id === user?.id) return; // ignore own messages

                // NOTE: 使用通用的 addMessage 进行去重
                addMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'guest',
                    content: msg.content,
                    timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                    isMine: false,
                    type: msg.type || 'text',
                    receiverId: msg.receiver_id || user?.id || '',
                    duration: msg.duration
                });
            }).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user, addMessage]);

    // ── Fetch Historical Messages ──────────────────────────────────
    useEffect(() => {
        if (!user || !selectedReceiver) {
            setMessages([]);
            return;
        }
        const fetchHistory = async () => {
            try {
                // 查询与选中用户的私聊记录
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50)
                    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedReceiver}),and(sender_id.eq.${selectedReceiver},receiver_id.eq.${user.id})`);

                if (error) throw error;
                if (data) {
                    messageIdsRef.current = new Set(); // 切换对话时重置去重
                    const history = data
                        .filter(msg => msg && msg.content)
                        .reverse()
                        .map(msg => {
                            messageIdsRef.current.add(msg.id);
                            return {
                                id: msg.id,
                                senderId: msg.sender_id,
                                senderLabel: msg.sender_label || 'Unknown',
                                senderRole: msg.sender_role || 'guest',
                                content: msg.content,
                                timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                                isMine: msg.sender_id === user.id,
                                type: (msg.type as any) || 'text',
                                receiverId: msg.receiver_id || '',
                                duration: msg.duration
                            };
                        });
                    setMessages(history);
                }
            } catch (err) {
                console.error('Failed to fetch history', err);
            }
        };
        fetchHistory();
    }, [user, selectedReceiver]);

    // ── Supabase Presence ───────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const ch = supabase.channel('walkie-talkie-room', {
            config: { presence: { key: user.id } },
        });
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState<OnlineUser>();
            const allPresences = Object.values(state).flat();

            // Deduplicate by userId, exclude self
            const uniqueUsers: OnlineUser[] = [];
            const seenIds = new Set<string>();
            allPresences.forEach(p => {
                if (!seenIds.has(p.userId) && p.userId !== user.id) {
                    seenIds.add(p.userId);
                    uniqueUsers.push(p);
                }
            });

            setOnlineUsers(uniqueUsers);
        }).subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await ch.track({ userId: user.id, email: user.email, role: user.role, joinedAt: new Date().toISOString() } as OnlineUser);
            }
        });
        return () => { supabase.removeChannel(ch); };
    }, [user]);

    // ── 录音 ─────────────────────────────────────────────────────────
    const startRecording = async () => {
        if (!selectedReceiver) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.start(100);
            mediaRecorderRef.current = mr;
            recordStartTimeRef.current = Date.now();
            setIsRecording(true);
        } catch { alert('请允许麦克风权限以使用 Walkie-Talkie。'); }
    };

    const stopRecording = async () => {
        if (!mediaRecorderRef.current || !isRecording) return;
        setIsRecording(false);
        const mr = mediaRecorderRef.current;
        mr.stop();
        mr.stream.getTracks().forEach((t) => t.stop());
        mr.onstop = async () => {
            if (!goEasyRef.current || goEasyStatus !== 'CONNECTED' || !selectedReceiver) return;
            const mimeType = mr.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            if (blob.size < 100) return;
            try {
                const base64Audio = await blobToBase64(blob);
                // NOTE: 私聊模式，统一发送到公共频道，接收端靠 receiverId 过滤显示
                const targetChannel = CHANNEL;
                const ts = Date.now();
                const dur = recordStartTimeRef.current ? (ts - recordStartTimeRef.current) / 1000 : 0;
                const msgId = `${user?.id || fallbackIdRef.current}-${ts}`;

                addMessage({
                    id: msgId,
                    senderId: user?.id || fallbackIdRef.current,
                    senderLabel: user?.email || 'Super Admin',
                    senderRole: user?.role || 'super_admin',
                    content: base64Audio,
                    timestamp: ts,
                    isMine: true,
                    type: 'audio',
                    receiverId: selectedReceiver,
                    duration: dur
                });

                goEasyRef.current.pubsub.publish({
                    channel: targetChannel,
                    message: JSON.stringify({
                        id: msgId,
                        type: 'audio',
                        senderId: user?.id ?? fallbackIdRef.current,
                        senderLabel: user?.email ?? 'Super Admin',
                        senderRole: user?.role ?? 'super_admin',
                        content: base64Audio,
                        timestamp: ts,
                        receiverId: selectedReceiver,
                        duration: dur
                    }),
                    onSuccess: () => console.log(`[GoEasy] Audio published to ${targetChannel}`),
                    onFailed: (err: { code: string; content: string }) => console.error('[GoEasy] Publish failed', err),
                });

                const insertAudio = async () => {
                    const payloadData = {
                        id: msgId,
                        sender_id: user?.id ?? fallbackIdRef.current,
                        sender_label: user?.email ?? 'Super Admin',
                        sender_role: user?.role ?? 'super_admin',
                        receiver_id: selectedReceiver,
                        content: base64Audio,
                        type: 'audio'
                    };
                    console.log('[DB] Inserting audio message...', { id: msgId, receiver: selectedReceiver });
                    const { error } = await supabase.from('messages').insert([payloadData]);
                    if (error) {
                        console.error('[DB] Audio insert failed:', error);
                        alert(`消息保存失败: ${error.message}`);
                    } else {
                        console.log('[DB] Audio saved successfully');
                    }
                };
                insertAudio();

            } catch (err) { console.error('[GoEasy] Failed to encode audio', err); }
            audioChunksRef.current = [];
        };
    };

    // ── 发送文字消息 ──────────────────────────────────────────────────
    const sendTextMessage = () => {
        const text = chatInput.trim();
        if (!text || !goEasyRef.current || goEasyStatus !== 'CONNECTED' || !selectedReceiver) return;

        const myId = user?.id ?? fallbackIdRef.current;
        const myLabel = user?.email ?? 'Super Admin';
        const myRole = user?.role ?? 'super_admin';
        const ts = Date.now();
        const msgId = `${myId}-${ts}`;

        // 本地先渲染气泡（不等服务器回传）
        addMessage({
            id: msgId,
            senderId: myId,
            senderLabel: myLabel,
            senderRole: myRole,
            content: text,
            timestamp: ts,
            isMine: true,
            type: 'text',
            receiverId: selectedReceiver
        });
        setChatInput('');

        goEasyRef.current.pubsub.publish({
            channel: CHANNEL,
            message: JSON.stringify({
                id: msgId,
                type: 'text',
                senderId: myId,
                senderLabel: myLabel,
                senderRole: myRole,
                content: text,
                timestamp: ts,
                receiverId: selectedReceiver
            }),
            onSuccess: () => { },
            onFailed: (err: { code: string; content: string }) => console.error('[GoEasy] Text publish failed', err),
        });

        const insertText = async () => {
            const { error } = await supabase.from('messages').insert([{
                id: msgId,
                sender_id: myId,
                sender_label: myLabel,
                sender_role: myRole,
                receiver_id: selectedReceiver,
                content: text,
                type: 'text'
            }]);
            if (error) console.error('DB insert failed', error);
        };
        insertText();
    };

    const myRole = user?.role ?? 'super_admin';
    const myBubble = ROLE_CONFIG[myRole]?.bubble ?? 'bg-slate-500';
    const selectedUser = onlineUsers.find(u => u.userId === selectedReceiver);

    return (
        <div className="h-[calc(100vh-140px)] flex gap-6">
            {/* ── 左侧：在线用户 + 状态 */}
            <aside className="w-64 shrink-0 flex flex-col gap-3">
                <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden flex-1">
                    <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                        <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                            <span className="material-icons-round text-[18px] text-emerald-500">group</span>在线成员
                        </h3>
                        <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            {onlineUsers.length} 人在线
                        </span>
                    </div>
                    <div className="divide-y divide-slate-50 overflow-y-auto max-h-[calc(100%-60px)]">
                        {onlineUsers.length === 0 ? (
                            <div className="flex flex-col items-center py-12 text-slate-300">
                                <span className="material-icons-round text-4xl mb-2">person_off</span>
                                <p className="text-xs font-bold">暂无其他在线用户</p>
                            </div>
                        ) : onlineUsers.map((u) => {
                            const cfg = ROLE_CONFIG[u.role] || { label: u.role, color: 'bg-slate-100 text-slate-600', icon: 'person', bubble: 'bg-slate-400' };
                            const isSelected = selectedReceiver === u.userId;
                            return (
                                <div
                                    key={u.userId}
                                    onClick={() => setSelectedReceiver(u.userId)}
                                    className={`flex items-center gap-2.5 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border-r-4 border-indigo-500' : 'hover:bg-slate-50'}`}
                                >
                                    <div className="relative shrink-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                                            <span className={`material-icons-round text-[18px] ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`}>{cfg.icon}</span>
                                        </div>
                                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>{u.email}</p>
                                        <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-0.5 ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 音频解锁按钮 */}
                {!audioUnlocked && (
                    <button
                        onClick={unlockAudio}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
                    >
                        <span className="material-icons-round text-[18px]">volume_up</span>
                        点击解锁语音播放
                    </button>
                )}
                {audioUnlocked && (
                    <div className="w-full py-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-black flex items-center justify-center gap-2">
                        <span className="material-icons-round text-[16px]">check_circle</span>
                        语音已解锁
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-4 py-3 flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${goEasyStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : goEasyStatus === 'CONNECTING' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></span>
                    <div>
                        <p className="text-xs font-black text-slate-700">GoEasy 语音频道</p>
                        <p className="text-[10px] text-slate-400 font-bold">
                            {goEasyStatus === 'CONNECTED' ? 'Live · Ready to broadcast' : goEasyStatus === 'CONNECTING' ? 'Connecting...' : 'Disconnected · Check AppKey'}
                        </p>
                    </div>
                    <span className="ml-auto text-[9px] font-black text-slate-300 uppercase tracking-widest">GoEasy</span>
                </div>
            </aside>

            {/* ── 右侧：私聊区 */}
            <div className="flex-1 bg-white rounded-[24px] shadow-sm border border-slate-100 flex flex-col overflow-hidden">

                {/* 顶部标题栏 */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    {selectedUser ? (
                        <>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${ROLE_CONFIG[selectedUser.role]?.bubble ?? 'bg-slate-400'}`}>
                                <span className="material-icons-round text-[18px]">{ROLE_CONFIG[selectedUser.role]?.icon ?? 'person'}</span>
                            </div>
                            <div>
                                <p className="text-sm font-black text-slate-800">{selectedUser.email}</p>
                                <p className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                                    在线 · {ROLE_CONFIG[selectedUser.role]?.label ?? selectedUser.role}
                                </p>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm font-bold text-slate-400 flex items-center gap-2">
                            <span className="material-icons-round text-[20px]">touch_app</span>
                            请从左侧选择一位成员开始私聊
                        </p>
                    )}
                    {selectedUser && (
                        <div className="ml-auto flex items-center gap-2">
                            {/* PTT 按钮 */}
                            <button
                                onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                                onMouseUp={(e) => { e.preventDefault(); stopRecording(); }}
                                onMouseLeave={stopRecording}
                                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                                onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                                disabled={goEasyStatus !== 'CONNECTED'}
                                className={`w-12 h-12 rounded-full flex flex-col items-center justify-center text-white font-black text-[8px] transition-all duration-200 select-none cursor-pointer outline-none gap-0.5 ${goEasyStatus !== 'CONNECTED' ? 'bg-slate-300 cursor-not-allowed' : isRecording ? 'bg-red-600 scale-95 shadow-[inset_0_5px_15px_rgba(0,0,0,0.3)] animate-pulse' : 'bg-red-500 hover:bg-red-600 shadow-[0_6px_18px_rgba(239,68,68,0.4)]'}`}
                                title="按住通话"
                            >
                                <span className="material-icons-round text-base">{isRecording ? 'mic' : 'mic_none'}</span>
                                {isRecording ? 'PTT' : 'HOLD'}
                            </button>
                        </div>
                    )}
                </div>

                {/* 聊天消息区 */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                    {!selectedReceiver ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                            <span className="material-icons-round text-5xl">forum</span>
                            <p className="text-xs font-bold">选择一位在线成员开始私聊</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                            <span className="material-icons-round text-4xl">chat_bubble_outline</span>
                            <p className="text-xs font-bold">暂无消息记录</p>
                        </div>
                    ) : messages
                        .map((msg) => {
                            const cfg = ROLE_CONFIG[msg.senderRole] || ROLE_CONFIG.guest;
                            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                                <div key={msg.id} className={`flex gap-2.5 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {/* 头像 */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bubble}`}>
                                        <span className="material-icons-round text-white text-[14px]">{cfg.icon}</span>
                                    </div>
                                    <div className={`max-w-[65%] ${msg.isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                                        <div className="flex items-center gap-1.5">
                                            {!msg.isMine && <span className="text-[10px] font-black text-slate-500">{msg.senderLabel}</span>}
                                            <span className="text-[9px] text-slate-300">{time}</span>
                                        </div>
                                        <div>
                                            {msg.type === 'audio' ? (
                                                // NOTE: audioUnlocked 为 true 时才触发 autoPlay，否则用户需手动点击
                                                <AudioPlayer
                                                    audioUrl={msg.content}
                                                    initialDuration={msg.duration}
                                                    autoPlay={audioUnlocked && !msg.isMine && msg.id === latestIncomingId}
                                                />
                                            ) : (
                                                <div className={`px-3.5 py-2 rounded-2xl text-sm font-medium shadow-sm ${msg.isMine ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
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

                {/* 输入框 */}
                {selectedReceiver && (
                    <div className="px-3 py-2.5 border-t border-slate-100 flex items-center gap-2.5">
                        {/* 录音按钮 (PTT) */}
                        <button
                            onMouseDown={startRecording}
                            onMouseUp={stopRecording}
                            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                            disabled={goEasyStatus !== 'CONNECTED'}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 shadow-md active:scale-90 ${isRecording
                                ? 'bg-red-500 text-white animate-pulse'
                                : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'
                                }`}
                            title="按住录音"
                        >
                            <span className="material-icons-round text-[20px]">{isRecording ? 'mic' : 'mic_none'}</span>
                        </button>

                        <div className={`flex-1 flex items-center rounded-xl px-3.5 py-2 border transition-all duration-300 gap-2 ${isRecording ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRecording ? 'bg-red-500 animate-ping' : myBubble}`}></span>
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                                placeholder={
                                    isRecording
                                        ? '正在录音...'
                                        : goEasyStatus === 'CONNECTED' ? '输入消息，Enter 发送…' : '频道未连接'
                                }
                                disabled={goEasyStatus !== 'CONNECTED' || isRecording}
                                className={`flex-1 bg-transparent text-sm outline-none font-medium ${isRecording ? 'text-red-500 placeholder:text-red-300' : 'text-slate-700 placeholder:text-slate-300'}`}
                            />
                        </div>
                        <button
                            onClick={sendTextMessage}
                            disabled={goEasyStatus !== 'CONNECTED' || !chatInput.trim()}
                            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 text-white flex items-center justify-center transition-all duration-150 shrink-0"
                        >
                            <span className="material-icons-round text-[16px]">send</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
