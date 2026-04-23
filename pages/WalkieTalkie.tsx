import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { UserRole } from '../types';
import GoEasy from 'goeasy';
import { api } from '../src/services/api';
import AudioPlayer from '../src/components/AudioPlayer';

const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';
const CHANNEL = 'KIM_LONG_COMUNITY';

interface ChatMessage {
    id: string;
    senderId: string;
    senderLabel: string;
    senderRole: string;
    content: string;
    timestamp: number;
    isMine: boolean;
    type: 'text' | 'audio' | 'recall';
    duration?: number;
    isRecalled?: boolean;
}

const WalkieTalkie: React.FC = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState<{ id: string; email: string; role: UserRole } | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [pttStatus, setPttStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'TALKING' | 'LISTENING'>('IDLE');
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [latestIncomingId, setLatestIncomingId] = useState<string | null>(null);

    const goEasyRef = useRef<InstanceType<typeof GoEasy> | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStartTimeRef = useRef<number | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Load user session
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUser({
                    id: session.user.id,
                    email: session.user.email || 'Unknown',
                    role: (session.user.user_metadata?.role as UserRole) || UserRole.ADMIN
                });
            }
        });
    }, []);

    // Scroll to bottom on new messages
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = useCallback((msg: ChatMessage) => {
        setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg].slice(-50);
        });
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
            // Base64 fallback (not used much now as we upload to server)
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
            setPttStatus('CONNECTED');
        }
    }, []);

    const startPttSession = useCallback(() => {
        if (!user) return;
        setPttStatus('CONNECTING');

        const goEasy = GoEasy.getInstance({ host: GOEASY_HOST, appkey: GOEASY_APPKEY, modules: ['pubsub'] });
        goEasyRef.current = goEasy;

        goEasy.connect({
            id: user.id,
            data: { role: user.role, email: user.email },
            onSuccess: () => {
                setPttStatus('CONNECTED');
                goEasy.pubsub.subscribe({
                    channel: CHANNEL,
                    onMessage: (message: any) => {
                        try {
                            const payload = JSON.parse(message.content);
                            if (payload.senderId === user.id) return;

                            if (payload.type === 'recall') {
                                setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, isRecalled: true } : m));
                                return;
                            }

                            const msg: ChatMessage = {
                                id: payload.id,
                                senderId: payload.senderId,
                                senderLabel: payload.senderLabel,
                                senderRole: payload.senderRole,
                                content: payload.content,
                                timestamp: payload.timestamp,
                                isMine: false,
                                type: payload.type,
                                duration: payload.duration
                            };
                            addMessage(msg);

                            if (payload.type === 'audio' && payload.content) {
                                setLatestIncomingId(payload.id);
                                if (audioUnlocked) playAudio(payload.content);
                            }
                        } catch (err) {}
                    }
                });
            },
            onFailed: () => setPttStatus('IDLE')
        });
    }, [user, addMessage, playAudio, audioUnlocked]);

    useEffect(() => {
        if (user) startPttSession();
        return () => {
            if (goEasyRef.current) {
                goEasyRef.current.disconnect({ onSuccess: () => {}, onFailed: () => {} });
            }
        };
    }, [user, startPttSession]);

    const unlockAudio = () => {
        if (audioUnlocked) return;
        const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        audio.play().then(() => setAudioUnlocked(true)).catch(() => setAudioUnlocked(true));
    };

    const handlePttDown = async () => {
        unlockAudio();
        
        // 如果当前处于离线状态，尝试重新连接
        if (pttStatus === 'IDLE') {
            startPttSession();
            return;
        }

        if (pttStatus !== 'CONNECTED') {
            console.warn('[Walkie] Cannot talk, status:', pttStatus);
            return;
        }

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
        } catch (err) {
            console.error('[Walkie] Mic error:', err);
            alert('无法访问麦克风，请确保已授予权限。');
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
                const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
                if (blob.size < 100) return;

                const formData = new FormData();
                formData.append('file', blob, `voice_${user.role}_${user.id}_${Date.now()}.webm`);
                
                const { data: uploadResult } = await api.post('/audio/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                
                const audioUrl = uploadResult.url;
                const ts = Date.now();
                const dur = recordStartTimeRef.current ? (ts - recordStartTimeRef.current) / 1000 : 0;
                const msgId = crypto.randomUUID();

                const payload = {
                    id: msgId,
                    type: 'audio',
                    senderId: user.id,
                    senderLabel: user.email,
                    senderRole: user.role,
                    content: audioUrl,
                    timestamp: ts,
                    receiverId: 'GLOBAL',
                    duration: dur
                };

                addMessage({ ...payload, isMine: true });
                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify(payload)
                });

                supabase.from('messages').insert([{
                    id: msgId,
                    sender_id: user.id,
                    sender_label: user.email,
                    sender_role: user.role,
                    receiver_id: 'GLOBAL',
                    content: audioUrl,
                    type: 'audio',
                    duration: dur
                }]);
            } catch (err) {
                console.error('[Walkie] Send failed', err);
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
            id: msgId,
            type: 'text',
            senderId: user.id,
            senderLabel: user.email,
            senderRole: user.role,
            content: chatInput,
            timestamp: ts,
            receiverId: 'GLOBAL'
        };

        addMessage({ ...payload, isMine: true } as ChatMessage);
        setChatInput('');

        goEasyRef.current.pubsub.publish({
            channel: CHANNEL,
            message: JSON.stringify(payload)
        });

        supabase.from('messages').insert([{
            id: msgId,
            sender_id: user.id,
            sender_label: user.email,
            sender_role: user.role,
            receiver_id: 'GLOBAL',
            content: chatInput,
            type: 'text'
        }]);
    };

    return (
        <div className="flex flex-col h-full bg-background-beige">
            {/* Header */}
            <header className="pt-12 pb-6 px-6 bg-white/40 backdrop-blur-3xl border-b border-primary/5 sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-primary">
                        <span className="material-icons-round">arrow_back_ios_new</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-primary tracking-tight italic uppercase">Walkie-Talkie</h1>
                        <p className="text-[10px] text-primary-light/60 font-black uppercase tracking-widest flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${pttStatus === 'IDLE' ? 'bg-slate-300' : 'bg-accent-gold animate-pulse'}`}></span>
                            {pttStatus === 'CONNECTING' ? 'Connecting...' : pttStatus === 'IDLE' ? 'Offline' : 'Online · Global Channel'}
                        </p>
                    </div>
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4 no-scrollbar">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-primary-light/20">
                        <span className="material-icons-round text-6xl mb-4">forum</span>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Establish Communication</p>
                    </div>
                ) : (
                    messages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-primary/5 ${msg.isMine ? 'bg-primary text-white' : 'bg-white text-primary'}`}>
                                <span className="material-icons-round text-sm">{msg.senderRole === 'kitchen' ? 'soup_kitchen' : msg.senderRole === 'driver' ? 'local_shipping' : 'person'}</span>
                            </div>
                            <div className={`max-w-[80%] flex flex-col gap-1 ${msg.isMine ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[9px] font-black text-primary-light/40 uppercase tracking-widest">{msg.isMine ? 'You' : msg.senderLabel}</span>
                                    <span className="text-[8px] text-primary-light/20 font-bold">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                {msg.isRecalled ? (
                                    <div className="px-4 py-2 bg-primary/5 text-primary-light/40 rounded-2xl text-[10px] font-bold italic border border-primary/5">
                                        Message Recalled
                                    </div>
                                ) : msg.type === 'audio' ? (
                                    <AudioPlayer audioUrl={msg.content} initialDuration={msg.duration} autoPlay={!msg.isMine && msg.id === latestIncomingId} />
                                ) : (
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm font-bold shadow-sm ${msg.isMine ? 'bg-primary text-white rounded-tr-none' : 'bg-white text-primary rounded-tl-none border border-primary/5'}`}>
                                        {msg.content}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                <div ref={chatBottomRef} />
            </main>

            {/* Input / PTT Area */}
            <div className="p-6 bg-white/40 backdrop-blur-3xl border-t border-primary/5 space-y-4">
                <div className="flex items-center gap-3">
                    <button
                        onMouseDown={handlePttDown}
                        onMouseUp={handlePttUp}
                        onTouchStart={(e) => { handlePttDown(); }} // 移除 preventDefault 避免在某些设备上失效
                        onTouchEnd={(e) => { handlePttUp(); }}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all shadow-2xl active:scale-95 shrink-0 border-4 ${
                            isTransmitting 
                                ? 'bg-primary text-white animate-pulse border-white/20 scale-110' 
                                : pttStatus === 'CONNECTED'
                                    ? 'bg-white text-primary border-primary/10'
                                    : 'bg-slate-100 text-slate-300 border-slate-200'
                        }`}
                    >
                        <span className="material-icons-round text-3xl mb-1">{isTransmitting ? 'mic' : pttStatus === 'IDLE' ? 'cloud_off' : 'mic_none'}</span>
                        <span className="text-[8px] font-black uppercase tracking-tighter">
                            {isTransmitting ? 'Talking' : pttStatus === 'CONNECTED' ? 'Push' : 'Reconnect'}
                        </span>
                    </button>
                    <div className="flex-1 flex items-center bg-white rounded-2xl px-4 py-3 border border-primary/5 shadow-sm">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendTextMessage(); }}
                            placeholder={isTransmitting ? 'Transmitting...' : 'Type message...'}
                            disabled={isTransmitting}
                            className="flex-1 bg-transparent text-sm font-bold outline-none text-primary"
                        />
                        <button onClick={sendTextMessage} disabled={!chatInput.trim() || isTransmitting} className="p-2 text-primary disabled:text-primary-light/20">
                            <span className="material-icons-round">send</span>
                        </button>
                    </div>
                </div>
                <p className="text-[9px] font-black text-center text-primary-light/40 uppercase tracking-[0.3em]">Hold microphone to talk</p>
            </div>
        </div>
    );
};

export default WalkieTalkie;
