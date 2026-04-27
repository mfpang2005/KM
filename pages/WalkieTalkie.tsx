import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { UserRole } from '../types';
import { getGoEasy, connectGoEasy, GE_CHANNELS } from '../src/lib/goeasy';
import GoEasy from 'goeasy';
import { api } from '../src/services/api';
import AudioPlayer from '../src/components/AudioPlayer';

const CHANNEL = GE_CHANNELS.COMMUNITY;

interface ChatMessage {
    id: string;
    senderId: string;
    senderLabel: string;
    senderRole: string;
    content: string;
    timestamp: number;
    isMine: boolean;
    type: 'text' | 'audio';
    duration?: number;
    isRecalled?: boolean;
}

const WalkieTalkie: React.FC = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState<{ id: string; email: string; name: string; role: UserRole } | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [pttStatus, setPttStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'TALKING' | 'LISTENING'>('IDLE');
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [latestIncomingId, setLatestIncomingId] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);

    const goEasyRef = useRef<any>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStartTimeRef = useRef<number | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const messageIdsRef = useRef<Set<string>>(new Set());

    // 1. Load User Session & Profile
    useEffect(() => {
        const initUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                // Try to get real name
                const { data: profile } = await supabase.from('users').select('name').eq('id', session.user.id).single();
                setUser({
                    id: session.user.id,
                    email: session.user.email || 'Unknown',
                    name: profile?.name || session.user.email?.split('@')[0] || 'Admin',
                    role: (session.user.user_metadata?.role as UserRole) || UserRole.ADMIN
                });
            }
        };
        initUser();
    }, []);

    // 2. Scroll to bottom
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = useCallback((msg: ChatMessage) => {
        if (messageIdsRef.current.has(msg.id)) return;
        messageIdsRef.current.add(msg.id);
        setMessages(prev => [...prev, msg].slice(-50));
    }, []);

    const playAudio = useCallback(async (content: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

        try {
            if (content.startsWith('http')) {
                const audio = new Audio(content);
                audio.onended = () => setPttStatus('CONNECTED');
                audio.play().catch(e => console.error('[Walkie] Play error', e));
                setPttStatus('LISTENING');
                return;
            }
        } catch (err) {
            setPttStatus('CONNECTED');
        }
    }, []);

    // 3. Sync Logic (Supabase Realtime + GoEasy Hybrid)
    const startPttSession = useCallback(async () => {
        if (!user) return;
        
        // 使用 Ref 或内部检查防止死循环
        if (goEasyRef.current && goEasyRef.current.getConnectionStatus() === 'connected') {
            setPttStatus('CONNECTED');
            return;
        }

        setInitError(null);
        setPttStatus('CONNECTING');

        try {
            const goEasy = await connectGoEasy({ id: user.id, role: user.role, name: user.name });
            goEasyRef.current = goEasy;
            
            setPttStatus('CONNECTED');
            (goEasy as any).pubsub.subscribe({
                channel: CHANNEL,
                onMessage: (message: any) => {
                    try {
                        const payload = JSON.parse(message.content);
                        if (payload.senderId === user.id) return;

                        if (payload.type === 'recall') {
                            const targetId = payload.id || payload.msgId;
                            setMessages(prev => prev.map(m => m.id === targetId ? { ...m, isRecalled: true } : m));
                            return;
                        }

                        if (payload.receiverId !== 'GLOBAL') return;
                        const msgId = payload.id || `${payload.senderId}-${payload.timestamp}`;
                        const audioContent = payload.content || payload.audio;

                        const msg: ChatMessage = {
                            id: msgId,
                            senderId: payload.senderId,
                            senderLabel: payload.senderLabel || 'Unknown',
                            senderRole: payload.senderRole || 'guest',
                            content: payload.type === 'text' ? payload.content : audioContent,
                            timestamp: payload.timestamp || Date.now(),
                            isMine: false,
                            type: payload.type as any,
                            duration: payload.duration
                        };
                        addMessage(msg);

                        if (payload.type === 'audio' && audioContent) {
                            setLatestIncomingId(msgId);
                            if (audioUnlocked) playAudio(audioContent);
                        }
                    } catch (err) {}
                }
            });
        } catch (err) {
            console.error('[Walkie] Session start failed:', err);
            setPttStatus('IDLE');
        }
    }, [user, addMessage, playAudio, audioUnlocked]);

    useEffect(() => {
        if (!user) return;
        
        startPttSession();

        // --- Supabase History & Realtime ---
        const fetchHistory = async () => {
            const { data } = await supabase.from('messages')
                .select('*').eq('receiver_id', 'GLOBAL').order('created_at', { ascending: false }).limit(50);
            if (data) {
                const history = data.reverse().map(m => {
                    messageIdsRef.current.add(m.id);
                    return {
                        id: m.id,
                        senderId: m.sender_id,
                        senderLabel: m.sender_label || 'Unknown',
                        senderRole: m.sender_role || 'guest',
                        type: (m.type as any) || 'text',
                        content: m.content,
                        timestamp: new Date(m.created_at).getTime(),
                        isMine: m.sender_id === user.id,
                        duration: m.duration,
                        isRecalled: m.is_recalled
                    };
                });
                setMessages(history);
            }
        };
        fetchHistory();

        const channel = supabase.channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (!msg || msg.sender_id === user.id) return;
                if (msg.receiver_id !== 'GLOBAL') return;
                addMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'guest',
                    content: msg.content,
                    timestamp: new Date(msg.created_at).getTime(),
                    isMine: false,
                    type: (msg.type as any) || 'text',
                    duration: msg.duration,
                    isRecalled: msg.is_recalled
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (msg && msg.is_recalled) {
                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRecalled: true } : m));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (goEasyRef.current) {
                goEasyRef.current.disconnect({ onSuccess: () => {}, onFailed: () => {} });
            }
        };
    }, [user, startPttSession, addMessage]);

    const unlockAudio = () => {
        if (audioUnlocked) return;
        const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        audio.play().then(() => setAudioUnlocked(true)).catch(() => setAudioUnlocked(true));
    };

    const handleRecall = async (msgId: string) => {
        if (!window.confirm('确定要撤回这条消息吗？')) return;
        try {
            console.log('[Walkie] Attempting recall:', msgId);
            await api.patch(`/audio/recall/${msgId}`);
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isRecalled: true } : m));
            if (goEasyRef.current) {
                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify({ type: 'recall', id: msgId })
                });
            }
        } catch (err: any) { 
            console.error('[Walkie] Recall failed:', err);
            const detail = err.response?.data?.detail || err.message;
            alert(`撤回失败: ${detail}`); 
        }
    };

    const handlePttDown = async () => {
        if (pttStatus !== 'CONNECTED') return;
        unlockAudio();
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
            ? 'audio/webm;codecs=opus' 
            : 'audio/webm';
            
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType });
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { 
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };
            mr.start(100); // 100ms chunks to keep it active
            mediaRecorderRef.current = mr;
            recordStartTimeRef.current = Date.now();
            setIsTransmitting(true);
            setPttStatus('TALKING');
        } catch (err) { 
            console.error('[Walkie] Record start failed:', err);
            alert('请开启麦克风权限'); 
        }
    };

    const handlePttUp = () => {
        if (!mediaRecorderRef.current || !isTransmitting) return;
        setIsTransmitting(false);
        setPttStatus('CONNECTED');
        const mr = mediaRecorderRef.current;
        mr.onstop = async () => {
            if (!goEasyRef.current || !user) return;
            try {
                const finalMime = mr.mimeType || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: finalMime });
                console.log('[Walkie] Recording finished. Size:', blob.size, 'Mime:', finalMime);
                
                if (blob.size < 200) {
                    console.warn('[Walkie] Recording too short, skipping.');
                    return;
                }

                const formData = new FormData();
                formData.append('file', blob, `voice_${user.role}_${user.id}_${Date.now()}.webm`);
                const { data: uploadResult } = await api.post('/audio/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                
                const audioUrl = uploadResult.url;
                const ts = Date.now();
                const dur = recordStartTimeRef.current ? (ts - recordStartTimeRef.current) / 1000 : 0;
                const msgId = crypto.randomUUID();

                const payload = {
                    id: msgId,
                    type: 'audio',
                    senderId: user.id,
                    senderLabel: user.name,
                    senderRole: user.role,
                    content: audioUrl,
                    timestamp: ts,
                    receiverId: 'GLOBAL',
                    duration: dur
                };

                addMessage({ ...payload, isMine: true } as ChatMessage);
                goEasyRef.current.pubsub.publish({ channel: CHANNEL, message: JSON.stringify(payload) });
                // 3. 通过后端保存到数据库 (绕过前端 RLS 限制)
                await api.post('/audio/message', payload);
                console.log('[Walkie] Message saved to DB via backend');
            } catch (err) { 
                console.error('Send failed', err); 
            }
            audioChunksRef.current = [];
        };
        mr.stop();
        mr.stream.getTracks().forEach(t => t.stop());
    };

    const sendTextMessage = () => {
        if (!chatInput.trim() || !goEasyRef.current || !user) return;
        const ts = Date.now();
        const msgId = crypto.randomUUID();
        const payload = {
            id: msgId, type: 'text', senderId: user.id, senderLabel: user.name, senderRole: user.role,
            content: chatInput, timestamp: ts, receiverId: 'GLOBAL'
        };

        addMessage({ ...payload, isMine: true } as ChatMessage);
        setChatInput('');
        goEasyRef.current.pubsub.publish({ channel: CHANNEL, message: JSON.stringify(payload) });
        const saveMsg = async () => {
            try {
                await api.post('/audio/message', payload);
                console.log('[Walkie] Text message saved to DB via backend');
            } catch (err) {
                console.error('[Walkie] Failed to save text message:', err);
            }
        };
        saveMsg();
    };

    // ── Supabase Presence (NEW: Track Online Status) ────────────────
    const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;
        const ch = supabase.channel('walkie-talkie-room', {
            config: { presence: { key: user.id } },
        });
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState();
            const allPresences = Object.values(state).flat();
            const uniqueUsers: any[] = [];
            const seenIds = new Set<string>();
            allPresences.forEach((p: any) => {
                if (p && p.userId && !seenIds.has(p.userId) && p.userId !== user.id) {
                    seenIds.add(p.userId);
                    uniqueUsers.push(p);
                }
            });
            setOnlineUsers(uniqueUsers);
        }).subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await ch.track({ 
                    userId: user.id, 
                    email: user.email, 
                    name: user.name,
                    role: user.role, 
                    joinedAt: new Date().toISOString() 
                });
            }
        });
        return () => { supabase.removeChannel(ch); };
    }, [user]);

    return (
        <div className="flex flex-col h-full bg-background-beige relative text-primary">
            {/* Header with Online Count */}
            <header className="pt-8 pb-4 px-6 bg-white/40 backdrop-blur-3xl sticky top-0 z-30 border-b border-primary/5 flex items-center justify-between shadow-lg shadow-primary/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/5 shadow-md">
                        <span className="material-icons-round text-xl">cell_tower</span>
                    </div>
                    <div className="flex flex-col">
                        <h2 className="font-black text-xs uppercase tracking-[0.2em]">WALKIE TALKIE</h2>
                        <p className="text-[9px] font-black uppercase tracking-widest mt-0.5 flex items-center gap-1.5" style={{ color: pttStatus === 'CONNECTED' || pttStatus === 'TALKING' || pttStatus === 'LISTENING' ? '#10b981' : '#94a3b8' }}>
                            <span className={`w-1 h-1 rounded-full ${pttStatus === 'CONNECTED' || pttStatus === 'TALKING' || pttStatus === 'LISTENING' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                            {pttStatus === 'CONNECTING' ? 'Init...' : pttStatus === 'CONNECTED' ? 'Live' : pttStatus === 'TALKING' ? 'Talk...' : pttStatus === 'LISTENING' ? 'Listen...' : 'Offline'}
                        </p>
                    </div>
                </div>

                {/* Online Users Badge for Mobile */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-black text-emerald-600">{onlineUsers.length + 1}</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4 no-scrollbar relative">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                    <span className="text-[120px] font-black uppercase rotate-[-20deg] select-none tracking-tighter text-primary">WALKIE</span>
                </div>

                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4">
                        <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center">
                            <span className="material-icons-round text-4xl opacity-20">forum</span>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Establish Communication</p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        // --- Date Separator Logic ---
                        const msgDate = new Date(msg.timestamp);
                        const prevMsg = index > 0 ? messages[index - 1] : null;
                        const prevDate = prevMsg ? new Date(prevMsg.timestamp) : null;
                        
                        const isNewDay = !prevDate || 
                            msgDate.getFullYear() !== prevDate.getFullYear() ||
                            msgDate.getMonth() !== prevDate.getMonth() ||
                            msgDate.getDate() !== prevDate.getDate();

                        const getDateLabel = (date: Date) => {
                            const now = new Date();
                            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            const yesterday = new Date(today);
                            yesterday.setDate(yesterday.getDate() - 1);
                            
                            const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                            
                            if (d.getTime() === today.getTime()) return '今天 TODAY';
                            if (d.getTime() === yesterday.getTime()) return '昨天 YESTERDAY';
                            return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
                        };
                        // ----------------------------

                        return (
                            <React.Fragment key={msg.id}>
                                {isNewDay && (
                                    <div className="flex justify-center my-6">
                                        <span className="px-4 py-1 bg-white/40 backdrop-blur-md text-[9px] font-black text-primary/30 rounded-full uppercase tracking-[0.2em] border border-primary/5 shadow-sm">
                                            {getDateLabel(msgDate)}
                                        </span>
                                    </div>
                                )}
                                <div className={`flex gap-3.5 animate-in slide-in-from-bottom-2 duration-300 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-lg border border-primary/5 ${msg.isMine ? 'bg-primary text-white' : 'bg-white text-primary'}`}>
                                        <span className="material-icons-round text-lg">{msg.senderRole === 'kitchen' ? 'soup_kitchen' : msg.senderRole === 'driver' ? 'local_shipping' : 'person'}</span>
                                    </div>
                                    <div className={`max-w-[75%] flex flex-col gap-1.5 ${msg.isMine ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-2 px-1">
                                            {!msg.isMine && <span className="text-[9px] font-black text-primary/40 uppercase tracking-widest">{msg.senderLabel}</span>}
                                            <span className="text-[8px] text-primary/20 font-mono font-bold">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="relative group">
                                            {msg.isRecalled ? (
                                                <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 text-primary/40 rounded-[22px] text-[10px] font-black border border-primary/5 italic backdrop-blur-xl">
                                                    <span className="material-icons-round text-xs">remove_circle_outline</span>
                                                    MESSAGE RECALLED
                                                </div>
                                            ) : msg.type === 'audio' ? (
                                                <AudioPlayer audioUrl={msg.content} initialDuration={msg.duration} autoPlay={!msg.isMine && msg.id === latestIncomingId} />
                                            ) : (
                                                <div className={`px-5 py-3 rounded-[24px] text-[14px] font-bold leading-relaxed shadow-xl backdrop-blur-2xl ${msg.isMine ? 'bg-primary text-white rounded-tr-none' : 'bg-white text-primary rounded-tl-none border border-primary/5'}`}>
                                                    {msg.content}
                                                </div>
                                            )}
                                            {msg.isMine && !msg.isRecalled && (
                                                <button onClick={() => handleRecall(msg.id)} className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all bg-white text-primary/40 hover:text-rose-500 p-2 rounded-xl border border-primary/5 shadow-xl scale-75 group-hover:scale-100">
                                                    <span className="material-icons-round text-lg">undo</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })
                )}
                <div ref={chatBottomRef} />
            </main>

            {/* PTT Area - Minimalist (Button only) */}
            <div className="shrink-0 border-t border-primary/5 py-4 flex flex-col items-center justify-center bg-white/20 backdrop-blur-xl relative">
                <div className="relative group">
                    {isTransmitting && (
                        <div className="absolute inset-0 rounded-full bg-primary/40 animate-ping scale-110 opacity-20"></div>
                    )}
                    <button 
                        onMouseDown={handlePttDown} onMouseUp={handlePttUp} 
                        onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }} 
                        onContextMenu={(e) => e.preventDefault()}
                        disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'} 
                        className={`w-14 h-14 rounded-full border transition-all flex items-center justify-center shadow-lg relative active:scale-95 z-10 ${isTransmitting ? 'bg-primary border-white/40 scale-105 shadow-primary/40' : 'bg-white border-primary/5 hover:bg-white/80'}`}
                    >
                        <span className={`material-icons-round text-2xl ${isTransmitting ? 'text-white animate-pulse' : 'text-primary'}`}>{isTransmitting ? 'mic' : 'mic_none'}</span>
                    </button>
                </div>
            </div>

            <div className="shrink-0 px-4 pb-6 pt-2 border-t border-primary/5 flex items-center gap-2 bg-white/40">
                <div className={`flex-1 flex items-center rounded-xl px-4 py-2 border transition-all duration-300 gap-2 ${isTransmitting ? 'bg-primary/5 border-primary/20' : 'bg-white border-primary/5'}`}>
                    <input 
                        type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} 
                        onKeyDown={(e) => { if (e.key === 'Enter') sendTextMessage(); }} 
                        placeholder={isTransmitting ? '发射中...' : "消息..."} 
                        disabled={isTransmitting}
                        className="flex-1 bg-transparent text-xs outline-none font-medium text-primary" 
                    />
                </div>
                <button onClick={sendTextMessage} disabled={isTransmitting || !chatInput.trim()} className="w-10 h-10 bg-primary disabled:bg-slate-300 rounded-xl text-white flex items-center justify-center transition-all active:scale-90 shadow-md shadow-primary/20">
                    <span className="material-icons-round text-lg">send</span>
                </button>
            </div>
        </div>
    );
};

export default WalkieTalkie;
