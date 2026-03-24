import React, { useState, useRef, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import GoEasy from 'goeasy';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import AudioPlayer from '../components/AudioPlayer';

// NOTE: 错误边界组件，捕获渲染层崩溃并显示具体错误
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[WalkieBoundary] Caught error:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-10 bg-red-50 text-red-700 rounded-2xl border-2 border-red-200 m-6">
                    <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                        <span className="material-icons-round">error</span>
                        页面渲染崩溃 (Render Crash)
                    </h2>
                    <pre className="text-xs bg-white p-4 rounded-xl border border-red-100 overflow-auto max-h-96">
                        {this.state.error?.stack || this.state.error?.message}
                    </pre>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-6 px-6 py-2 bg-red-600 text-white rounded-full font-bold hover:bg-red-700"
                    >
                        刷新页面重试
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';
const CHANNEL = 'KIM_LONG_COMUNITY';

interface OnlineUser {
    userId: string;
    email: string;
    role: string;
    joinedAt: string;
}

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

const WalkieTalkieContent: React.FC = () => {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [goEasyStatus, setGoEasyStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [selectedReceiver, setSelectedReceiver] = useState<string | null>(null);

    const messageIdsRef = useRef<Set<string>>(new Set());
    const [isRecording, setIsRecording] = useState(false);
    const [latestIncomingId, setLatestIncomingId] = useState<string | null>(null);
    const [audioUnlocked, setAudioUnlocked] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const goEasyRef = useRef<any>(null); // 使用 any 避免类型定义导致的构建问题
    const fallbackIdRef = useRef<string>(`superadmin-${Math.random().toString(36).slice(2, 9)}`);
    const recordStartTimeRef = useRef<number | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);
    const currentGoEasyIdRef = useRef<string | null>(null);

    const addMessage = useCallback((msg: ChatMessage) => {
        if (!msg.id) return;
        if (messageIdsRef.current.has(msg.id)) return;

        const fingerprint = `${msg.senderId}:${msg.type}:${(msg.content||'').slice(0, 50)}:${Math.floor(msg.timestamp / 1000)}`;
        if (messageIdsRef.current.has(fingerprint)) return;

        messageIdsRef.current.add(msg.id);
        messageIdsRef.current.add(fingerprint);
        setMessages(prev => [...prev, msg]);
    }, []);

    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const unlockAudio = () => {
        const SILENT_WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const audio = new Audio(`data:audio/wav;base64,${SILENT_WAV}`);
        audio.volume = 0.01;
        audio.play()
            .then(() => {
                setAudioUnlocked(true);
                console.log('[Walkie] Audio unlocked successfully');
            })
            .catch((e) => {
                console.warn('[Walkie] Native unlock failed, but proceeding:', e);
                setAudioUnlocked(true);
            });
    };

    // ── GoEasy PubSub ──────────────────────────────────────────────
    useEffect(() => {
        if (!user || user.id === currentGoEasyIdRef.current) return;
        currentGoEasyIdRef.current = user.id;

        const myId = user.id;
        const myLabel = user.email || 'Super Admin';
        const myRole = user.role || 'super_admin';

        let goEasyInstance: any = null;

        const initGoEasy = () => {
            try {
                // 兼容不同版本的 GoEasy 导入方式
                const GoEasyLib = (GoEasy as any).default || GoEasy;
                if (typeof GoEasyLib.getInstance !== 'function') {
                    console.error('[GoEasy] getInstance missing on GoEasyLib:', GoEasyLib);
                    setGoEasyStatus('DISCONNECTED');
                    return;
                }

                goEasyInstance = GoEasyLib.getInstance({
                    host: GOEASY_HOST,
                    appkey: GOEASY_APPKEY,
                    modules: ['pubsub'],
                });

                goEasyRef.current = goEasyInstance;
                setGoEasyStatus('CONNECTING');

                goEasyInstance.connect({
                    id: myId,
                    data: { email: myLabel, role: myRole },
                    onSuccess: () => {
                        setGoEasyStatus('CONNECTED');
                        goEasyInstance.pubsub.subscribe({
                            channel: CHANNEL,
                            onMessage: (message: { content: string }) => {
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
                                            content: payload.content || '',
                                            timestamp: payload.timestamp || Date.now(),
                                            isMine: false,
                                            type: 'text',
                                            receiverId: payload.receiverId || myId
                                        });
                                    } else if (payload.type === 'audio' || payload.audio) {
                                        const audioContent = payload.content || payload.audio;
                                        if (audioContent) {
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
                                            setLatestIncomingId(incomingId);
                                        }
                                    }
                                } catch (e) { console.error('[GoEasy] Parse error:', e); }
                            },
                            onSuccess: () => console.log('[GoEasy] Subscribed'),
                            onFailed: (e: any) => console.error('[GoEasy] Subscribe failed:', e)
                        });
                    },
                    onFailed: (e: any) => {
                        console.error('[GoEasy] Connect failed:', e);
                        setGoEasyStatus('DISCONNECTED');
                    },
                    onDisconnected: () => setGoEasyStatus('DISCONNECTED')
                });
            } catch (e) {
                console.error('[GoEasy] Init exception:', e);
                setGoEasyStatus('DISCONNECTED');
            }
        };

        initGoEasy();

        return () => {
            if (goEasyInstance) {
                try {
                    goEasyInstance.pubsub.unsubscribe({ channel: CHANNEL });
                    if (typeof goEasyInstance.disconnect === 'function') goEasyInstance.disconnect();
                } catch (e) { console.warn('[GoEasy] Cleanup error:', e); }
            }
        };
    }, [user, addMessage]);

    // ── Supabase Messages ──────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const channel = supabase.channel('messages-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (msg.sender_id === user.id) return;
                addMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'guest',
                    content: msg.content || '',
                    timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                    isMine: false,
                    type: (msg.type as any) || 'text',
                    receiverId: msg.receiver_id || user.id,
                    duration: msg.duration
                });
            }).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user, addMessage]);

    // ── History ───────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !selectedReceiver) {
            setMessages([]);
            return;
        }
        const fetchHistory = async () => {
            try {
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50)
                    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedReceiver}),and(sender_id.eq.${selectedReceiver},receiver_id.eq.${user.id})`);

                if (error) throw error;
                if (data) {
                    messageIdsRef.current = new Set();
                    const history = data
                        .filter(m => m && m.content)
                        .reverse()
                        .map(m => {
                            messageIdsRef.current.add(m.id);
                            return {
                                id: m.id,
                                senderId: m.sender_id,
                                senderLabel: m.sender_label || 'Unknown',
                                senderRole: m.sender_role || 'guest',
                                content: m.content || '',
                                timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
                                isMine: m.sender_id === user.id,
                                type: (m.type as any) || 'text',
                                receiverId: m.receiver_id || '',
                                duration: m.duration
                            };
                        });
                    setMessages(history);
                }
            } catch (e) { console.error('[Walkie] History failed:', e); }
        };
        fetchHistory();
    }, [user, selectedReceiver]);

    // ── Presence ──────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const ch = supabase.channel('presence-room', { config: { presence: { key: user.id } } });
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState<OnlineUser>();
            const unique = new Map<string, OnlineUser>();
            Object.values(state).flat().forEach(p => {
                if (p && p.userId && p.userId !== user.id) unique.set(p.userId, p);
            });
            setOnlineUsers(Array.from(unique.values()));
        }).subscribe(async (s) => {
            if (s === 'SUBSCRIBED') {
                await ch.track({ userId: user.id, email: user.email, role: user.role, joinedAt: new Date().toISOString() });
            }
        });
        return () => { supabase.removeChannel(ch); };
    }, [user]);

    // ── Actions ───────────────────────────────────────────────────
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
        } catch (e) { 
            console.error('[Walkie] Mic error:', e);
            alert('无法启动麦克风，请检查权限。'); 
        }
    };

    const stopRecording = async () => {
        if (!mediaRecorderRef.current || !isRecording) return;
        setIsRecording(false);
        const mr = mediaRecorderRef.current;
        mr.stop();
        mr.stream.getTracks().forEach(t => t.stop());
        mr.onstop = async () => {
            if (!goEasyRef.current || goEasyStatus !== 'CONNECTED' || !selectedReceiver) return;
            const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
            if (blob.size < 500) return;
            try {
                const b64 = await blobToBase64(blob);
                const ts = Date.now();
                const dur = recordStartTimeRef.current ? (ts - recordStartTimeRef.current) / 1000 : 0;
                const msgId = `${user?.id || fallbackIdRef.current}-${ts}`;

                const chatMsg: ChatMessage = {
                    id: msgId,
                    senderId: user?.id || fallbackIdRef.current,
                    senderLabel: user?.email || 'Super Admin',
                    senderRole: user?.role || 'super_admin',
                    content: b64,
                    timestamp: ts,
                    isMine: true,
                    type: 'audio',
                    receiverId: selectedReceiver,
                    duration: dur
                };
                addMessage(chatMsg);

                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify(chatMsg),
                    onSuccess: () => console.log('[GoEasy] Audio sent'),
                    onFailed: (e: any) => console.error('[GoEasy] Audio push failed:', e)
                });

                await supabase.from('messages').insert([{
                    id: msgId,
                    sender_id: chatMsg.senderId,
                    sender_label: chatMsg.senderLabel,
                    sender_role: chatMsg.senderRole,
                    receiver_id: chatMsg.receiverId,
                    content: chatMsg.content,
                    type: 'audio',
                    duration: dur
                }]);
            } catch (e) { console.error('[Walkie] Record process failed:', e); }
        };
    };

    const sendTextMessage = async () => {
        const text = chatInput.trim();
        if (!text || !goEasyRef.current || goEasyStatus !== 'CONNECTED' || !selectedReceiver) return;

        const ts = Date.now();
        const msgId = `${user?.id || fallbackIdRef.current}-${ts}`;
        const chatMsg: ChatMessage = {
            id: msgId,
            senderId: user?.id || fallbackIdRef.current,
            senderLabel: user?.email || 'Super Admin',
            senderRole: user?.role || 'super_admin',
            content: text,
            timestamp: ts,
            isMine: true,
            type: 'text',
            receiverId: selectedReceiver
        };
        
        addMessage(chatMsg);
        setChatInput('');

        goEasyRef.current.pubsub.publish({
            channel: CHANNEL,
            message: JSON.stringify(chatMsg),
            onFailed: (e: any) => console.error('[GoEasy] Text push failed:', e)
        });

        await supabase.from('messages').insert([{
            id: msgId,
            sender_id: chatMsg.senderId,
            sender_label: chatMsg.senderLabel,
            sender_role: chatMsg.senderRole,
            receiver_id: chatMsg.receiverId,
            content: chatMsg.content,
            type: 'text'
        }]);
    };

    const selectedUser = onlineUsers.find(u => u.userId === selectedReceiver);

    return (
        <div className="h-[calc(100vh-140px)] flex gap-6">
            <aside className="w-64 shrink-0 flex flex-col gap-3">
                <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
                    <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between shrink-0">
                        <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                            <span className="material-icons-round text-[18px] text-emerald-500">group</span>在线成员
                        </h3>
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                            {onlineUsers.length} 在线
                        </span>
                    </div>
                    <div className="divide-y divide-slate-50 overflow-y-auto flex-1">
                        {onlineUsers.length === 0 ? (
                            <div className="flex flex-col items-center py-12 text-slate-300">
                                <span className="material-icons-round text-3xl mb-2">person_off</span>
                                <p className="text-[10px] font-bold">暂无在线用户</p>
                            </div>
                        ) : onlineUsers.map((u) => {
                            const cfg = ROLE_CONFIG[u.role] || { label: u.role, color: 'bg-slate-100 text-slate-600', icon: 'person' };
                            const isSelected = selectedReceiver === u.userId;
                            return (
                                <div
                                    key={u.userId}
                                    onClick={() => setSelectedReceiver(u.userId)}
                                    className={`flex items-center gap-2.5 px-4 py-3 cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-r-4 border-indigo-500' : 'hover:bg-slate-50'}`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                                        <span className={`material-icons-round text-[18px] ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`}>{cfg.icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[11px] font-bold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>{u.email}</p>
                                        <span className={`inline-block text-[8px] font-black px-1.5 py-0.5 rounded mt-0.5 ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {!audioUnlocked && (
                    <button onClick={unlockAudio} className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95">
                        <span className="material-icons-round text-[18px]">volume_up</span>激活语音播放
                    </button>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-4 py-3 flex items-center gap-2.5 shrink-0">
                    <span className={`w-2 h-2 rounded-full ${goEasyStatus === 'CONNECTED' ? 'bg-green-500' : goEasyStatus === 'CONNECTING' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-700">GoEasy 状态</p>
                        <p className="text-[9px] text-slate-400 font-bold truncate">{goEasyStatus}</p>
                    </div>
                </div>
            </aside>

            <main className="flex-1 bg-white rounded-[24px] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                <header className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
                    {selectedUser ? (
                        <>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${ROLE_CONFIG[selectedUser.role]?.bubble || 'bg-slate-400'}`}>
                                <span className="material-icons-round text-[18px]">{ROLE_CONFIG[selectedUser.role]?.icon || 'person'}</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-black text-slate-800">{selectedUser.email}</p>
                                <p className="text-[10px] text-emerald-500 font-bold">在线私聊</p>
                            </div>
                            <button
                                onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                                onMouseUp={(e) => { e.preventDefault(); stopRecording(); }}
                                onMouseLeave={stopRecording}
                                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                                onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                                disabled={goEasyStatus !== 'CONNECTED'}
                                className={`w-12 h-12 rounded-full flex flex-col items-center justify-center text-white font-black text-[8px] transition-all select-none ${goEasyStatus !== 'CONNECTED' ? 'bg-slate-300' : isRecording ? 'bg-red-600 scale-95 shadow-inner' : 'bg-red-500 hover:bg-red-600 shadow-md'}`}
                            >
                                <span className="material-icons-round text-base">{isRecording ? 'mic' : 'mic_none'}</span>
                                {isRecording ? 'TALK' : 'HOLD'}
                            </button>
                        </>
                    ) : (
                        <p className="text-sm font-bold text-slate-400 flex items-center gap-2">
                            <span className="material-icons-round text-[20px]">touch_app</span>
                            请选择成员
                        </p>
                    )}
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {!selectedReceiver ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-3 italic">
                            <span className="material-icons-round text-6xl">chat</span>
                            <p className="text-sm">选中的人会出现在这里</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-2">
                            <p className="text-xs font-bold uppercase tracking-widest">No Message History</p>
                        </div>
                    ) : messages.map((msg) => {
                        const cfg = ROLE_CONFIG[msg.senderRole] || ROLE_CONFIG.guest;
                        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return (
                            <div key={msg.id} className={`flex gap-2.5 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bubble}`}>
                                    <span className="material-icons-round text-white text-[14px]">{cfg.icon}</span>
                                </div>
                                <div className={`max-w-[75%] ${msg.isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                                    <div className="flex items-center gap-1.5 px-1">
                                        {!msg.isMine && <span className="text-[9px] font-black text-slate-400">{msg.senderLabel}</span>}
                                        <span className="text-[8px] text-slate-300">{time}</span>
                                    </div>
                                    <div className="rounded-2xl shadow-sm text-sm">
                                        {msg.type === 'audio' ? (
                                            <AudioPlayer 
                                                audioUrl={msg.content} 
                                                initialDuration={msg.duration} 
                                                autoPlay={audioUnlocked && !msg.isMine && msg.id === latestIncomingId} 
                                            />
                                        ) : (
                                            <div className={`px-4 py-2 rounded-2xl ${msg.isMine ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-700 rounded-tl-sm'}`}>
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

                {selectedReceiver && (
                    <footer className="px-4 py-3 border-t border-slate-100 flex items-center gap-2.5 shrink-0">
                        <div className={`flex-1 flex items-center rounded-2xl px-4 py-2 bg-slate-50 border border-slate-100 transition-all ${isRecording ? 'bg-red-50 border-red-100' : ''}`}>
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                                placeholder={goEasyStatus === 'CONNECTED' ? "输入消息..." : "正在尝试重连..."}
                                disabled={goEasyStatus !== 'CONNECTED' || isRecording}
                                className="flex-1 bg-transparent text-sm outline-none font-medium h-8"
                            />
                        </div>
                        <button
                            onClick={sendTextMessage}
                            disabled={goEasyStatus !== 'CONNECTED' || !chatInput.trim()}
                            className="w-10 h-10 rounded-2xl bg-slate-800 text-white flex items-center justify-center transition-all hover:bg-slate-700 disabled:bg-slate-200 active:scale-90"
                        >
                            <span className="material-icons-round text-[18px]">send</span>
                        </button>
                    </footer>
                )}
            </main>
        </div>
    );
};

export const WalkieTalkiePage: React.FC = () => (
    <ErrorBoundary>
        <WalkieTalkieContent />
    </ErrorBoundary>
);
