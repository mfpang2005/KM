import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

/** 在线用户的 Presence 数据结构 */
interface OnlineUser {
    userId: string;
    email: string;
    role: string;
    joinedAt: string;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    super_admin: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700', icon: 'admin_panel_settings' },
    admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700', icon: 'manage_accounts' },
    kitchen: { label: 'Kitchen', color: 'bg-orange-100 text-orange-700', icon: 'soup_kitchen' },
    driver: { label: 'Driver', color: 'bg-green-100 text-green-700', icon: 'local_shipping' },
};

export const WalkieTalkiePage: React.FC = () => {
    const { user } = useAuth();
    const [isRecording, setIsRecording] = useState(false);
    const [wsStatus, setWsStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);

    // ── Supabase Presence：追踪在线用户 ───────────────────────────────────
    useEffect(() => {
        if (!user) return;

        const channel = supabase.channel('walkie-talkie-room', {
            config: { presence: { key: user.id } },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                // NOTE: 每次 presence 同步（加入/离开）都更新在线用户列表
                const state = channel.presenceState<OnlineUser>();
                const users: OnlineUser[] = Object.values(state).flat();
                setOnlineUsers(users);
            })
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                console.log('[Presence] Joined:', newPresences);
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                console.log('[Presence] Left:', leftPresences);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // 广播自己的在线状态
                    await channel.track({
                        userId: user.id,
                        email: user.email,
                        role: user.role,
                        joinedAt: new Date().toISOString(),
                    } as OnlineUser);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    // ── WebSocket：语音通道 ───────────────────────────────────────────────
    const connectWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        setWsStatus('CONNECTING');
        const ws = new WebSocket('ws://localhost:8000/ws/walkie-talkie');
        ws.onopen = () => setWsStatus('CONNECTED');
        ws.onclose = () => {
            setWsStatus('DISCONNECTED');
            setTimeout(connectWebSocket, 3000);
        };
        ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                const ab = await event.data.arrayBuffer();
                playAudio(ab);
            }
        };
        wsRef.current = ws;
    }, []);

    useEffect(() => {
        connectWebSocket();
        return () => {
            wsRef.current?.close();
            audioContextRef.current?.close();
        };
    }, [connectWebSocket]);

    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mr.ondataavailable = (e) => {
                if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(e.data);
                }
            };
            mr.start(250);
            mediaRecorderRef.current = mr;
            setIsRecording(true);
        } catch {
            alert('Please allow microphone access to use Walkie-Talkie.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            setIsRecording(false);
            audioChunksRef.current = [];
        }
    };

    return (
        <div className="h-[calc(100vh-140px)] flex gap-6">
            {/* ── 左侧：在线用户列表 ─────────────────────────────────── */}
            <aside className="w-72 shrink-0 flex flex-col gap-4">
                {/* 在线状态面板 */}
                <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden flex-1">
                    <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                        <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                            <span className="material-icons-round text-[18px] text-emerald-500">group</span>
                            在线成员
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
                        ) : (
                            onlineUsers.map((u) => {
                                const cfg = ROLE_CONFIG[u.role] || { label: u.role, color: 'bg-slate-100 text-slate-600', icon: 'person' };
                                return (
                                    <div key={u.userId} className="flex items-center gap-3 px-5 py-3.5">
                                        <div className="relative shrink-0">
                                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                                                <span className="material-icons-round text-[18px] text-slate-400">{cfg.icon}</span>
                                            </div>
                                            {/* 绿点：在线指示器 */}
                                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-800 truncate">{u.email}</p>
                                            <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-0.5 ${cfg.color}`}>
                                                {cfg.label}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* WebSocket 连接状态 */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-4 flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : wsStatus === 'CONNECTING' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></span>
                    <div>
                        <p className="text-xs font-black text-slate-700">语音频道</p>
                        <p className="text-[10px] text-slate-400 font-bold">
                            {wsStatus === 'CONNECTED' ? 'Live · Ready to broadcast' : wsStatus === 'CONNECTING' ? 'Connecting...' : 'Disconnected'}
                        </p>
                    </div>
                </div>
            </aside>

            {/* ── 右侧：讲话中心按钮 ──────────────────────────────────── */}
            <div className="flex-1 bg-white rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center justify-center relative overflow-hidden">
                {/* 动态波纹装饰 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`absolute w-64 h-64 rounded-full border border-red-300 transition-all duration-700 ${isRecording ? 'scale-150 opacity-0 animate-ping' : 'scale-100 opacity-10'}`}></div>
                    <div className={`absolute w-96 h-96 rounded-full border border-red-200 transition-all duration-700 delay-150 ${isRecording ? 'scale-150 opacity-0 animate-ping' : 'scale-100 opacity-5'}`}></div>
                </div>

                <div className="z-10 bg-slate-50 p-12 rounded-full mb-8 shadow-inner border border-slate-100">
                    <span className={`material-icons-round text-8xl transition-colors duration-300 ${isRecording ? 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]' : 'text-slate-300'}`}>
                        settings_voice
                    </span>
                </div>

                <h2 className="text-2xl font-black text-slate-800 mb-2">Global Broadcast</h2>
                <p className="text-slate-500 font-medium mb-12 text-center max-w-sm">
                    按住按钮，对所有在线的厨房和司机端即时广播紧急通知或即时指令。
                </p>

                <button
                    onMouseDown={e => { e.preventDefault(); startRecording(); }}
                    onMouseUp={e => { e.preventDefault(); stopRecording(); }}
                    onMouseLeave={stopRecording}
                    onTouchStart={e => { e.preventDefault(); startRecording(); }}
                    onTouchEnd={e => { e.preventDefault(); stopRecording(); }}
                    disabled={wsStatus !== 'CONNECTED'}
                    className={`relative w-36 h-36 rounded-full flex flex-col items-center justify-center text-white font-black text-sm transition-all duration-200 select-none cursor-pointer outline-none focus:outline-none gap-2 ${wsStatus !== 'CONNECTED'
                            ? 'bg-slate-300 cursor-not-allowed'
                            : isRecording
                                ? 'bg-red-600 scale-95 shadow-[inset_0_5px_15px_rgba(0,0,0,0.3)]'
                                : 'bg-red-500 hover:bg-red-600 shadow-[0_15px_30px_rgba(239,68,68,0.4)] hover:shadow-[0_20px_40px_rgba(239,68,68,0.5)] hover:-translate-y-1'
                        }`}
                >
                    <span className="material-icons-round text-2xl">
                        {isRecording ? 'mic' : 'mic_none'}
                    </span>
                    {isRecording ? 'TALKING...' : 'PRESS TO TALK'}
                </button>

                {wsStatus !== 'CONNECTED' && (
                    <p className="mt-6 text-xs font-bold text-slate-400 flex items-center gap-1.5">
                        <span className="material-icons-round text-[14px]">info</span>
                        语音频道离线，正在重连中...
                    </p>
                )}
            </div>
        </div>
    );
};
