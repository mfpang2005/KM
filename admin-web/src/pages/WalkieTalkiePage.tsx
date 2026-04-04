import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useGoEasy } from '../contexts/GoEasyContext';
import AudioPlayer from '../components/AudioPlayer';
import { NotificationBell } from '../components/NotificationBell';
import { api } from '../services/api';

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
    type: 'text' | 'audio' | 'voice' | 'recall'; // 增加 recall 类型
    receiverId: string;
    duration?: number;
    isRecalled?: boolean; // 增加已撤回标志位
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: string; bubble: string }> = {
    super_admin: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700', icon: 'admin_panel_settings', bubble: 'bg-purple-500' },
    admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700', icon: 'manage_accounts', bubble: 'bg-blue-500' },
    kitchen: { label: 'Kitchen', color: 'bg-orange-100 text-orange-700', icon: 'soup_kitchen', bubble: 'bg-orange-500' },
    driver: { label: 'Driver', color: 'bg-green-100 text-green-700', icon: 'local_shipping', bubble: 'bg-green-500' },
    guest: { label: 'Guest', color: 'bg-slate-100 text-slate-600', icon: 'person', bubble: 'bg-slate-400' },
};


export const WalkieTalkiePage: React.FC = () => {
    const { user } = useAuth();
    const { goEasy: contextGoEasy, status: goEasyStatus } = useGoEasy();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [visibleError, setVisibleError] = useState<string | null>(null);

    // NOTE: 使用 Ref 存储已处理的消息 ID，防止 GoEasy 和 Supabase 重复触发
    const messageIdsRef = useRef<Set<string>>(new Set());
    const [isRecording, setIsRecording] = useState(false);
    // NOTE: 追踪最新收到的音频消息 ID，用于触发 autoPlay
    const [latestIncomingId, setLatestIncomingId] = useState<string | null>(null);
    // NOTE: 浏览器自动播放限制 —— 用户需先与页面交互才能解锁
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const hasFetchedHistoryRef = useRef(false);
    const lastUserIdRef = useRef<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStartTimeRef = useRef<number | null>(null);
    const chatBottomRef = useRef<HTMLDivElement | null>(null);
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);

    const addMessage = useCallback((msg: ChatMessage) => {
        if (!msg || !msg.id) return;
        // 仅根据唯一 ID 去重，移除过严的内容指纹校验
        if (messageIdsRef.current.has(msg.id)) return;

        messageIdsRef.current.add(msg.id);
        setMessages(prev => {
            // 再次检查防止 React 异步更新导致的竞态重复
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg].slice(-100); // 限制展示最近100条气泡
        });
    }, []);

    // 新消息自动滚到底部
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /** 用户交互解锁音频权限 */
    const unlockAudio = useCallback(() => {
        if (audioUnlocked) return;
        const SILENT_WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const audio = new Audio(`data:audio/wav;base64,${SILENT_WAV}`);
        audio.volume = 0.01;
        audio.play()
            .then(() => {
                setAudioUnlocked(true);
                console.log('[Walkie] Audio context unlocked via interaction');
            })
            .catch((e) => {
                console.warn('[Walkie] Unlock failed:', e);
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

    // ── GoEasy PubSub Subscriptions ────────────────────────────────────
    useEffect(() => {
        if (!user || !contextGoEasy || goEasyStatus !== 'CONNECTED') return;

        const myId = user.id;
        console.log('[Walkie] Subscribing to channel:', CHANNEL);

        contextGoEasy.pubsub.subscribe({
            channel: CHANNEL,
            onMessage: async (message: { content: string }) => {
                try {
                    const payload = JSON.parse(message.content);
                    if (payload.senderId === myId) return;

                    // 处理撤回指令 (New)
                    if (payload.type === 'recall') {
                        const targetId = payload.id || payload.msgId;
                        if (!targetId) return;
                        console.log('[Walkie] Remote recall signal received:', targetId);
                        setMessages(prev => prev.map(m => m.id === targetId ? { ...m, isRecalled: true } : m));
                        return;
                    }

                    // 兼容语音消息的各种类型定义 (audio, voice, ptt)
                    const isVoicePayload = payload.type === 'audio' || payload.type === 'voice' || payload.audio || payload.audioUrl || payload.url;
                    const incomingId = payload.id || `${payload.senderId}-${payload.timestamp}`;
                    const common = {
                        id: incomingId,
                        senderId: payload.senderId,
                        senderLabel: payload.senderLabel || payload.senderId,
                        senderRole: payload.senderRole || 'driver',
                        timestamp: payload.timestamp || Date.now(),
                        isMine: false,
                        receiverId: 'GLOBAL',
                        duration: payload.duration
                    };

                    if (payload.type === 'text') {
                        addMessage({ ...common, content: payload.content, type: 'text' } as ChatMessage);
                    } else if (isVoicePayload) {
                        const audioContent = payload.content || payload.audio || payload.audioUrl || payload.url || payload.voiceUrl;
                        if (!audioContent) return;
                        
                        setLatestIncomingId(incomingId);
                        addMessage({ 
                            ...common, 
                            content: audioContent, 
                            type: 'audio' // 统一映射为 audio 进行渲染
                        } as ChatMessage);
                    }
                } catch (err) {
                    console.error('[Walkie] Failed to handle message', err);
                }
            },
            onSuccess: () => console.log('[Walkie] Subscribed to', CHANNEL),
            onFailed: (err: any) => console.error('[Walkie] Subscribe failed', err)
        });

        return () => {
            if (contextGoEasy && goEasyStatus === 'CONNECTED') {
                console.log('[Walkie] Unsubscribing from', CHANNEL);
                contextGoEasy.pubsub.unsubscribe({
                    channel: CHANNEL,
                    onSuccess: () => console.log('[Walkie] Unsubscribe success'),
                    onFailed: (err: any) => console.error('[Walkie] Unsubscribe failed', err)
                });
            }
        };
    }, [user?.id, contextGoEasy, goEasyStatus, addMessage]);

    // ── Supabase Messages Realtime Listener ────────────────────────
    useEffect(() => {
        const channel = supabase.channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                const msg = payload.new;
                if (!msg || msg.sender_id === user?.id) return;
                
                // 兼容语音消息类型 (只要是 audio, voice 或含有可见的音频特征)
                const isAudio = msg.type === 'audio' || msg.type === 'voice' || (msg.content && (msg.content.includes('.mp3') || msg.content.includes('.webm') || msg.content.includes('/audio/')));
                const isTargeted = !msg.receiver_id || msg.receiver_id === 'GLOBAL' || msg.receiver_id === user?.id;
                
                if (!isAudio && !isTargeted) return;

                console.log('[Walkie] Rendering bubble from Supabase Realtime:', msg.id);
                // 确保触发自动播放
                if (isAudio) setLatestIncomingId(msg.id);

                addMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    senderLabel: msg.sender_label || 'Unknown',
                    senderRole: msg.sender_role || 'driver',
                    content: msg.content || '',
                    timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                    isMine: false,
                    type: isAudio ? 'audio' : 'text',
                    receiverId: 'GLOBAL',
                    duration: msg.duration,
                    isRecalled: msg.is_recalled
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (msg && msg.is_recalled) {
                    console.log('[Walkie] Message recalled via DB Update:', msg.id);
                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRecalled: true } : m));
                }
            }).subscribe();

        return () => { 
            setTimeout(() => {
                supabase.removeChannel(channel); 
            }, 100);
        };
    }, [user, addMessage]);

    // ── Fetch Historical Messages ──────────────────────────────────
    useEffect(() => {
        if (!user) {
            setMessages([]);
            hasFetchedHistoryRef.current = false;
            lastUserIdRef.current = null;
            return;
        }

        // 只有当用户 ID 真正改变时才重新加载历史
        if (lastUserIdRef.current === user.id && hasFetchedHistoryRef.current) return;
        
        const fetchHistory = async () => {
            try {
                console.log('[Walkie] Fetching history for user:', user.id);
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .or(`receiver_id.eq.GLOBAL,receiver_id.is.null,receiver_id.eq.${user.id}`)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                if (data) {
                    const history = data
                        .filter(msg => msg && msg.content)
                        .reverse()
                        .map(msg => {
                            messageIdsRef.current.add(msg.id);
                            return {
                                id: msg.id,
                                senderId: msg.sender_id,
                                senderLabel: msg.sender_label || 'Unknown',
                                senderRole: msg.sender_role || 'driver',
                                content: msg.content,
                                timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
                                isMine: msg.sender_id === user.id,
                                type: (msg.type as any) || 'audio',
                                isRecalled: msg.is_recalled,
                                receiverId: msg.receiver_id || 'GLOBAL',
                                duration: msg.duration
                            };
                        });
                    
                    setMessages(prev => {
                        // 合并历史记录和当前的实时消息，以 ID 为准去重，并过滤无效项
                        const filteredPrev = prev.filter(Boolean);
                        const combined = [...history, ...filteredPrev];
                        const seen = new Set();
                        return combined.filter(m => {
                            if (!m || !m.id || seen.has(m.id)) return false;
                            seen.add(m.id);
                            return true;
                        }).slice(-100);
                    });
                    
                    hasFetchedHistoryRef.current = true;
                    lastUserIdRef.current = user.id;
                }
            } catch (err) {
                console.error('Failed to fetch history', err);
            }
        };
        fetchHistory();
    }, [user?.id]);

    // ── Supabase Presence ───────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const ch = supabase.channel('walkie-talkie-room', {
            config: { presence: { key: user.id } },
        });
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState<OnlineUser>();
            const allPresences = Object.values(state).flat();
            const uniqueUsers: OnlineUser[] = [];
            const seenIds = new Set<string>();
            allPresences.forEach(p => {
                if (p && p.userId && !seenIds.has(p.userId) && p.userId !== user.id) {
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
            if (!contextGoEasy || goEasyStatus !== 'CONNECTED') return;
            const mimeType = mr.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            if (blob.size < 100) return;
            try {
                // 将 Blob 通过 FormData 上传到后端存储
                const formData = new FormData();
                formData.append('file', blob, `voice_${user?.id || 'unknown'}_${Date.now()}.webm`);
                
                const { data: uploadResult } = await api.post('/audio/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                
                const audioUrl = uploadResult.url;
                if (!audioUrl) throw new Error('Upload failed: No URL returned');

                const ts = Date.now();
                const dur = recordStartTimeRef.current ? (ts - recordStartTimeRef.current) / 1000 : 0;
                const msgId = self.crypto.randomUUID();

                const payload = {
                    id: msgId,
                    type: 'audio',
                    senderId: user?.id ?? 'unknown',
                    senderLabel: user?.email ?? 'Super Admin',
                    senderRole: user?.role ?? 'super_admin',
                    content: audioUrl, // 存入公开访问 URL
                    timestamp: ts,
                    receiverId: 'GLOBAL',
                    duration: dur
                };

                addMessage({
                    id: msgId,
                    senderId: payload.senderId,
                    senderLabel: payload.senderLabel,
                    senderRole: payload.senderRole,
                    content: audioUrl,
                    timestamp: ts,
                    isMine: true,
                    type: 'audio',
                    receiverId: 'GLOBAL',
                    duration: dur
                });

                contextGoEasy.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify(payload),
                    onSuccess: () => console.log(`[Walkie] Audio URL broadcasted to GLOBAL`),
                    onFailed: (err: any) => console.error('[Walkie] Publish failed', err),
                });

                const insertAudio = async () => {
                    const { error } = await supabase.from('messages').insert([{
                        id: msgId,
                        sender_id: payload.senderId,
                        sender_label: payload.senderLabel,
                        sender_role: payload.senderRole,
                        receiver_id: 'GLOBAL',
                        content: audioUrl,
                        type: 'audio',
                        duration: dur
                    }]);
                    if (error) {
                        console.error('[Admin] Database Audio Insert Error:', error);
                        alert(`管理员端语音保存失败 (Error ${error.code}): ${error.message}`);
                    }
                };
                await insertAudio();

            } catch (err) { console.error('[GoEasy] Audio upload/publish failed', err); }
            audioChunksRef.current = [];
        };
    };

    // ── 发送文字消息 ──────────────────────────────────────────────────
    const sendTextMessage = async () => {
        const text = chatInput.trim();
        if (!text || !contextGoEasy || goEasyStatus !== 'CONNECTED') return;

        const myId = user?.id ?? 'unknown';
        const myLabel = user?.email ?? 'Super Admin';
        const myRole = user?.role ?? 'super_admin';
        const ts = Date.now();
        const msgId = self.crypto.randomUUID();

        addMessage({
            id: msgId,
            senderId: myId,
            senderLabel: myLabel,
            senderRole: myRole,
            content: text,
            timestamp: ts,
            isMine: true,
            type: 'text',
            receiverId: 'GLOBAL'
        });
        setChatInput('');

        contextGoEasy.pubsub.publish({
            channel: CHANNEL,
            message: JSON.stringify({
                id: msgId,
                type: 'text',
                senderId: myId,
                senderLabel: myLabel,
                senderRole: myRole,
                content: text,
                timestamp: ts,
                receiverId: 'GLOBAL'
            }),
            onFailed: (err: any) => console.error('[Walkie] Text publish failed', err),
        });

        const insertText = async () => {
            const { error } = await supabase.from('messages').insert([{
                id: msgId,
                sender_id: myId,
                sender_label: myLabel,
                sender_role: myRole,
                receiver_id: 'GLOBAL',
                content: text,
                type: 'text'
            }]);
            if (error) {
                console.error('[Admin] Database Text Insert Error:', error);
                alert(`管理员端文字保存失败 (Error ${error.code}): ${error.message}`);
            }
        };
        await insertText();
    };

    // ── 撤回消息逻辑 ──────────────────────────────────────────────────
    const handleRecall = async (msgId: string) => {
        // NOTE: 超级管理员有权撤回任何人的消息，其他角色只能撤回自己的
        const targetMsg = messages.find(m => m.id === msgId);
        const canRecall = user?.role === 'super_admin' || targetMsg?.isMine;

        if (!canRecall) {
            alert('您没有权限撤回这条消息');
            return;
        }

        if (!window.confirm('确定要撤回这条消息吗？撤回后所有人都将无法查看。')) return;

        try {
            await api.patch(`/audio/recall/${msgId}`);
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isRecalled: true } : m));
            if (contextGoEasy && goEasyStatus === 'CONNECTED') {
                contextGoEasy.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify({ type: 'recall', id: msgId }),
                    onSuccess: () => console.log('[Walkie] Recall broadcasted:', msgId),
                });
            }
        } catch (err) {
            console.error('Recall failed:', err);
            alert('撤回失败，请稍后重试');
        }
    };

    const myRole = user?.role ?? 'super_admin';
    const myBubble = ROLE_CONFIG[myRole]?.bubble ?? 'bg-slate-500';

    return (
        <div className="h-[calc(100vh-220px)] flex gap-6 relative mt-10 max-w-[1600px] mx-auto px-4">
            {visibleError && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 bg-red-100 text-red-800 px-4 py-2 rounded-b shadow font-mono text-sm max-w-xl text-center">
                    DEBUG: {visibleError}
                    <button onClick={() => setVisibleError(null)} className="ml-2 underline font-bold">X</button>
                </div>
            )}
            {/* ── 左侧：在线用户 + 状态 ── */}
            <aside className="w-64 shrink-0 flex flex-col gap-3">
                <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
                    <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                        <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                            <span className="material-icons-round text-[18px] text-emerald-500">group</span>在线成员
                        </h3>
                        <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            {onlineUsers.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                        {onlineUsers.length === 0 ? (
                            <div className="flex flex-col items-center py-12 text-slate-300">
                                <span className="material-icons-round text-4xl mb-2">person_off</span>
                                <p className="text-xs font-bold uppercase">No one online</p>
                            </div>
                        ) : onlineUsers.map((u) => {
                            if (!u) return null;
                            const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.guest;
                            return (
                                <div
                                    key={u.userId}
                                    className={`flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50`}
                                >
                                    <div className="relative shrink-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-100`}>
                                            <span className={`material-icons-round text-[18px] text-slate-400`}>{cfg.icon}</span>
                                        </div>
                                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-bold truncate text-slate-800`}>{u.email}</p>
                                        <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-0.5 ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>


                <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-4 py-3 flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${goEasyStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></span>
                    <div>
                        <p className="text-xs font-black text-slate-700">GoEasy 状态</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{goEasyStatus}</p>
                    </div>
                </div>
            </aside>

            {/* ── 右侧：聊天区域 ── */}
            <div className="flex-1 bg-white rounded-[24px] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                {/* 顶部标题栏 */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/20">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm bg-indigo-500`}>
                            <span className="material-icons-round text-[20px]">cell_tower</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-black text-slate-800 truncate">Global Dispatch Room</h2>
                            <p className="text-[10px] text-emerald-500 font-black flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                ON AIR · ALL STATIONS
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell />
                        <button
                            onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                            onMouseUp={(e) => { e.preventDefault(); stopRecording(); }}
                            onMouseLeave={stopRecording}
                            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                            disabled={goEasyStatus !== 'CONNECTED'}
                            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center text-white font-black text-[9px] transition-all duration-200 select-none cursor-pointer outline-none gap-0.5 shadow-lg active:scale-95 ${goEasyStatus !== 'CONNECTED' ? 'bg-slate-300 cursor-not-allowed' : isRecording ? 'bg-red-600 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}
                        >
                            <span className="material-icons-round text-2xl">{isRecording ? 'mic' : 'mic_none'}</span>
                            {isRecording ? 'PTT' : 'HOLD'}
                        </button>
                    </div>
                </div>

                {/* 聊天消息区 */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                            <span className="material-icons-round text-5xl">chat_bubble_outline</span>
                            <p className="text-xs font-bold uppercase tracking-widest">No private messages</p>
                        </div>
                    ) : messages.map((msg) => {
                        if (!msg) return null;
                        const cfg = ROLE_CONFIG[msg.senderRole] || ROLE_CONFIG.guest;
                        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return (
                            <div key={msg.id} className={`flex gap-3 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${cfg.bubble}`}>
                                    <span className="material-icons-round text-white text-[16px]">{cfg.icon}</span>
                                </div>
                                <div className={`max-w-[75%] ${msg.isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                                    <div className="flex items-center gap-2">
                                        {!msg.isMine && <span className="text-[11px] font-black text-slate-600">{msg.senderLabel}</span>}
                                        <span className="text-[9px] text-slate-300 font-bold">{time}</span>
                                    </div>
                                    <div className="group relative">
                                        {msg.isRecalled ? (
                                            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-400 rounded-2xl text-[11px] font-bold border border-slate-100 italic">
                                                <span className="material-icons-round text-sm">remove_circle_outline</span>
                                                消息已撤回
                                            </div>
                                        ) : (msg.type === 'audio' || msg.type === 'voice') ? (
                                            <AudioPlayer
                                                audioUrl={msg.content}
                                                initialDuration={msg.duration}
                                                autoPlay={audioUnlocked && !msg.isMine && msg.id === latestIncomingId}
                                            />
                                        ) : (
                                            <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium shadow-sm transition-all ${msg.isMine ? 'bg-slate-800 text-white rounded-tr-none hover:bg-slate-900 border border-slate-700' : 'bg-slate-50 text-slate-800 rounded-tl-none hover:bg-white border border-slate-100'}`}>
                                                {msg.content}
                                            </div>
                                        )}
                                        
                                        {/* 撤回按钮：仅限自己发送的消息且未被撤回时显示 */}
                                        {msg.isMine && !msg.isRecalled && (
                                            <button
                                                onClick={() => handleRecall(msg.id)}
                                                className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white hover:bg-red-50 text-slate-300 hover:text-red-500 p-1.5 rounded-full border border-slate-100 shadow-sm"
                                                title="撤回消息"
                                            >
                                                <span className="material-icons-round text-sm">undo</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={chatBottomRef} />
                </div>

                {/* 底部输入框区域 */}
                <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-center gap-3">
                    {/* 录音 PTT 按钮 (左侧) */}
                    <button
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                        onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                        disabled={goEasyStatus !== 'CONNECTED'}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-90 shrink-0 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                        title="Hold to Record"
                    >
                        <span className="material-icons-round">{isRecording ? 'mic' : 'mic_none'}</span>
                    </button>
                    
                    <div className={`flex-1 flex items-center rounded-2xl px-4 py-2.5 border transition-all duration-300 gap-2 ${isRecording ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRecording ? 'bg-red-500 animate-ping' : myBubble}`}></span>
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                            placeholder={isRecording ? 'Recording...' : 'Type a message to all stations...'}
                            disabled={goEasyStatus !== 'CONNECTED' || isRecording}
                            className={`flex-1 bg-transparent text-sm font-bold outline-none ${isRecording ? 'text-red-500 placeholder:text-red-300' : 'text-slate-700 placeholder:text-slate-300'}`}
                        />
                    </div>
                    <button
                        onClick={sendTextMessage}
                        disabled={goEasyStatus !== 'CONNECTED' || !chatInput.trim()}
                        className="w-11 h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white flex items-center justify-center transition-all shadow-md hover:shadow-lg active:scale-95 shrink-0"
                    >
                        <span className="material-icons-round">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
