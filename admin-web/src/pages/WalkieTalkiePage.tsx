import React, { useState, useRef, useEffect, useCallback } from 'react';
import GoEasy from 'goeasy';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

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

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buf;
};

export const WalkieTalkiePage: React.FC = () => {
    const { user } = useAuth();
    const [isRecording, setIsRecording] = useState(false);
    const [goEasyStatus, setGoEasyStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [selectedReceiver, setSelectedReceiver] = useState<string>('GLOBAL');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const goEasyRef = useRef<InstanceType<typeof GoEasy> | null>(null);
    const fallbackIdRef = useRef<string>(`guest-${Math.random().toString(36).slice(2, 9)}`);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);

    // 新消息自动滚到底部
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const playAudio = useCallback(async (arrayBuffer: ArrayBuffer) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        try {
            const buf = await audioContextRef.current.decodeAudioData(arrayBuffer);
            const src = audioContextRef.current.createBufferSource();
            src.buffer = buf;
            src.connect(audioContextRef.current.destination);
            src.start(0);
        } catch (err) {
            console.error('Audio decode error', err);
        }
    }, []);

    // ── GoEasy 初始化 ────────────────────────────────────────────────
    useEffect(() => {
        const myId = user?.id ?? fallbackIdRef.current;
        const myLabel = user?.email ?? 'Super Admin';
        const myRole = user?.role ?? 'super_admin';
        let goEasy: InstanceType<typeof GoEasy> | null = null;

        const doConnect = () => {
            try {
                goEasy = GoEasy.getInstance({
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
                        goEasy.pubsub.subscribe({
                            channel: CHANNEL,
                            onMessage: async (message: { content: string }) => {
                                try {
                                    const payload = JSON.parse(message.content);
                                    if (payload.senderId === myId) return;

                                    if (payload.type === 'text') {
                                        // NOTE: 收到文字消息，追加到聊天记录
                                        setMessages(prev => [...prev, {
                                            id: `${payload.senderId}-${payload.timestamp}`,
                                            senderId: payload.senderId,
                                            senderLabel: payload.senderLabel ?? payload.senderId,
                                            senderRole: payload.senderRole ?? 'guest',
                                            content: payload.content,
                                            timestamp: payload.timestamp,
                                            isMine: false,
                                        }]);
                                    } else if (payload.type === 'audio' || payload.audio) {
                                        // 兼容旧格式（无 type 字段的音频消息）
                                        const ab = base64ToArrayBuffer(payload.audio);
                                        await playAudio(ab);
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

        try {
            const status = GoEasy.getConnectionStatus();
            if (status === 'disconnected') { doConnect(); }
            else { GoEasy.disconnect({ onSuccess: doConnect, onFailed: doConnect }); }
        } catch { doConnect(); }

        return () => {
            try { goEasy?.pubsub.unsubscribe({ channel: CHANNEL, onSuccess: () => { }, onFailed: () => { } }); } catch { }
            try { GoEasy.disconnect({ onSuccess: () => { }, onFailed: () => { } }); } catch { }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Supabase Messages Realtime Listener ────────────────────────
    useEffect(() => {
        const channel = supabase.channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                const msg = payload.new;
                if (msg.sender_id === user?.id) return; // ignore own messages

                setMessages(prev => [...prev, {
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'guest',
                    content: msg.type === 'audio' ? '[Voice Message]' : msg.content,
                    timestamp: new Date(msg.created_at).getTime(),
                    isMine: false,
                }]);

                if (msg.type === 'audio' && msg.content) {
                    try {
                        const ab = base64ToArrayBuffer(msg.content);
                        await playAudio(ab);
                    } catch (e) {
                        console.error('Failed to play db audio', e);
                    }
                }
            }).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user, playAudio]);

    // ── Supabase Presence ───────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const ch = supabase.channel('walkie-talkie-room', {
            config: { presence: { key: user.id } },
        });
        ch.on('presence', { event: 'sync' }, () => {
            setOnlineUsers(Object.values(ch.presenceState<OnlineUser>()).flat());
        }).subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await ch.track({ userId: user.id, email: user.email, role: user.role, joinedAt: new Date().toISOString() } as OnlineUser);
            }
        });
        return () => { supabase.removeChannel(ch); };
    }, [user]);

    // ── 录音 ─────────────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.start(100);
            mediaRecorderRef.current = mr;
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
            if (!goEasyRef.current || goEasyStatus !== 'CONNECTED') return;
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            if (blob.size < 100) return;
            try {
                const base64Audio = await blobToBase64(blob);
                const targetChannel = selectedReceiver === 'GLOBAL' ? CHANNEL : `driver_${selectedReceiver}`;

                goEasyRef.current.pubsub.publish({
                    channel: targetChannel,
                    message: JSON.stringify({
                        type: 'audio',
                        senderId: user?.id ?? fallbackIdRef.current,
                        senderLabel: user?.email ?? 'Super Admin',
                        senderRole: user?.role ?? 'super_admin',
                        audio: base64Audio,
                    }),
                    onSuccess: () => console.log(`[GoEasy] Audio published to ${targetChannel}`),
                    onFailed: (err: { code: string; content: string }) => console.error('[GoEasy] Publish failed', err),
                });

                const insertAudio = async () => {
                    const { error } = await supabase.from('messages').insert([{
                        sender_id: user?.id ?? fallbackIdRef.current,
                        sender_label: user?.email ?? 'Super Admin',
                        sender_role: user?.role ?? 'super_admin',
                        receiver_id: selectedReceiver,
                        content: base64Audio,
                        type: 'audio'
                    }]);
                    if (error) console.error('DB insert failed', error);
                };
                insertAudio();

            } catch (err) { console.error('[GoEasy] Failed to encode audio', err); }
            audioChunksRef.current = [];
        };
    };

    // ── 发送文字消息 ──────────────────────────────────────────────────
    const sendTextMessage = () => {
        const text = chatInput.trim();
        if (!text || !goEasyRef.current || goEasyStatus !== 'CONNECTED') return;

        const myId = user?.id ?? fallbackIdRef.current;
        const myLabel = user?.email ?? 'Super Admin';
        const myRole = user?.role ?? 'super_admin';
        const ts = Date.now();

        // 本地先渲染气泡（不等服务器回传）
        setMessages(prev => [...prev, {
            id: `${myId}-${ts}`,
            senderId: myId,
            senderLabel: myLabel,
            senderRole: myRole,
            content: text,
            timestamp: ts,
            isMine: true,
        }]);
        setChatInput('');

        const targetChannel = selectedReceiver === 'GLOBAL' ? CHANNEL : `driver_${selectedReceiver}`;
        goEasyRef.current.pubsub.publish({
            channel: targetChannel,
            message: JSON.stringify({ type: 'text', senderId: myId, senderLabel: myLabel, senderRole: myRole, content: text, timestamp: ts }),
            onSuccess: () => { },
            onFailed: (err: { code: string; content: string }) => console.error('[GoEasy] Text publish failed', err),
        });

        const insertText = async () => {
            const { error } = await supabase.from('messages').insert([{
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

    return (
        <div className="h-[calc(100vh-140px)] flex gap-6">
            {/* ── 左侧：在线用户 + 状态 */}
            <aside className="w-72 shrink-0 flex flex-col gap-4">
                <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden flex-1">
                    <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                        <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                            <span className="material-icons-round text-[18px] text-emerald-500">group</span>在线成员
                        </h3>
                        <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            {onlineUsers.length} 人在线
                        </span>
                    </div>
                    <div className="divide-y divide-slate-50 overflow-y-auto max-h-[calc(100%-60px)]">
                        {/* Global Selector */}
                        <div
                            onClick={() => setSelectedReceiver('GLOBAL')}
                            className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${selectedReceiver === 'GLOBAL' ? 'bg-indigo-50 border-r-4 border-indigo-500' : 'hover:bg-slate-50'}`}
                        >
                            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
                                <span className="material-icons-round text-[18px]">public</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold truncate ${selectedReceiver === 'GLOBAL' ? 'text-indigo-800' : 'text-slate-800'}`}>Global Broadcast</p>
                                <span className="inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-0.5 bg-indigo-100 text-indigo-700">全体频道</span>
                            </div>
                        </div>

                        {onlineUsers.length === 0 ? (
                            <div className="flex flex-col items-center py-12 text-slate-300">
                                <span className="material-icons-round text-4xl mb-2">person_off</span>
                                <p className="text-xs font-bold">暂无其他在线用户</p>
                            </div>
                        ) : onlineUsers.map((u) => {
                            const cfg = ROLE_CONFIG[u.role] || { label: u.role, color: 'bg-slate-100 text-slate-600', icon: 'person' };
                            const isSelected = selectedReceiver === u.userId;
                            return (
                                <div
                                    key={u.userId}
                                    onClick={() => setSelectedReceiver(u.userId)}
                                    className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border-r-4 border-indigo-500' : 'hover:bg-slate-50'}`}
                                >
                                    <div className="relative shrink-0">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isSelected ? 'bg-indigo-100' : 'bg-slate-100'}`}>
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
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-4 flex items-center gap-3">
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

            {/* ── 右侧：PTT + 聊天 */}
            <div className="flex-1 bg-white rounded-[32px] shadow-sm border border-slate-100 flex flex-col overflow-hidden">

                {/* PTT 区域 */}
                <div className="relative flex flex-col items-center justify-center py-8 border-b border-slate-100">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-t-[32px]">
                        <div className={`absolute w-48 h-48 rounded-full border border-red-300 transition-all duration-700 ${isRecording ? 'scale-150 opacity-0 animate-ping' : 'opacity-10'}`}></div>
                    </div>
                    <div className="flex items-center gap-8 z-10">
                        <div>
                            <h2 className="text-xl font-black text-slate-800">
                                {selectedReceiver === 'GLOBAL' ? 'Global Broadcast' : 'Private Channel'}
                            </h2>
                            <p className="text-sm text-slate-400 font-medium mt-0.5">
                                {selectedReceiver === 'GLOBAL' ? '按住按钮即时全局语音广播' : '按住按钮仅发送给此用户'}
                            </p>
                        </div>
                        <button
                            onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                            onMouseUp={(e) => { e.preventDefault(); stopRecording(); }}
                            onMouseLeave={stopRecording}
                            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                            disabled={goEasyStatus !== 'CONNECTED'}
                            className={`w-24 h-24 rounded-full flex flex-col items-center justify-center text-white font-black text-[10px] transition-all duration-200 select-none cursor-pointer outline-none gap-1.5 ${goEasyStatus !== 'CONNECTED' ? 'bg-slate-300 cursor-not-allowed' : isRecording ? 'bg-red-600 scale-95 shadow-[inset_0_5px_15px_rgba(0,0,0,0.3)]' : 'bg-red-500 hover:bg-red-600 shadow-[0_10px_25px_rgba(239,68,68,0.4)] hover:-translate-y-0.5'}`}
                        >
                            <span className="material-icons-round text-xl">{isRecording ? 'mic' : 'mic_none'}</span>
                            {isRecording ? 'TALKING...' : 'HOLD TO TALK'}
                        </button>
                    </div>
                </div>

                {/* 聊天消息区 */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                            <span className="material-icons-round text-4xl">chat_bubble_outline</span>
                            <p className="text-xs font-bold">暂无消息，发送第一条文字吧</p>
                        </div>
                    ) : messages.map((msg) => {
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
                                    <div className={`px-3.5 py-2 rounded-2xl text-sm font-medium shadow-sm ${msg.isMine ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={chatBottomRef} />
                </div>

                {/* 输入框 */}
                <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3">
                    <div className="flex-1 flex items-center bg-slate-50 rounded-2xl px-4 py-2.5 border border-slate-200 gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${myBubble}`}></span>
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                            placeholder={goEasyStatus === 'CONNECTED' ? '输入消息，Enter 发送…' : '频道未连接'}
                            disabled={goEasyStatus !== 'CONNECTED'}
                            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-300 outline-none font-medium"
                        />
                    </div>
                    <button
                        onClick={sendTextMessage}
                        disabled={goEasyStatus !== 'CONNECTED' || !chatInput.trim()}
                        className="w-10 h-10 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 text-white flex items-center justify-center transition-all duration-150 shrink-0"
                    >
                        <span className="material-icons-round text-[18px]">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
