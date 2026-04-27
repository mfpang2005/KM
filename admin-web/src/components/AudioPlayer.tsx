import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
    audioUrl: string;        // raw base64 or data URI or http URL
    initialDuration?: number; // pre-filled duration in seconds (from DB)
    autoPlay?: boolean;       // true = auto-play incoming voice messages
}

/**
 * WhatsApp-style audio player.
 * Optimized: click anywhere on the bubble to play/pause.
 */
const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, initialDuration, autoPlay }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(initialDuration ?? 0);
    const [currentTime, setCurrentTime] = useState(0);
    const [ready, setReady] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string>('');

    // --- 1. Audio Object Lifecycle ---
    useEffect(() => {
        if (!audioUrl) return;

        // Reset states for new source
        setReady(false);
        setIsPlaying(false);
        setCurrentTime(0);

        const audio = new Audio();
        audioRef.current = audio;
        audio.volume = 1.0;
        audio.preload = 'auto'; // 强制预加载
        
        const onMeta = () => {
            console.log('[AudioPlayer] Metadata loaded, duration:', audio.duration);
            if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
                setDuration(audio.duration);
            }
            setReady(true);
        };
        const onTime  = () => setCurrentTime(audio.currentTime);
        const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
        const onPlay  = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onError = () => { 
            console.error('[AudioPlayer] Error loading audio source:', audioUrl, audio.error);
            setReady(false); 
            setIsPlaying(false); 
        };

        audio.addEventListener('loadedmetadata', onMeta);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('error', onError);
        audio.crossOrigin = 'anonymous'; // 启用 CORS
        audio.crossOrigin = 'anonymous'; // 尝试启用 CORS

        const setupSource = async () => {
            try {
                if (audioUrl.startsWith('http') || audioUrl.startsWith('/') || audioUrl.includes('://')) {
                    audio.src = audioUrl;
                } else if (audioUrl.startsWith('data:')) {
                    audio.src = audioUrl;
                } else {
                    // 仅当看起来像 Base64 时才尝试解码
                    try {
                        const cleanBase64 = audioUrl.replace(/\s/g, ''); // 移除空格和换行
                        const bin = atob(cleanBase64);
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                        const blob = new Blob([bytes], { type: 'audio/webm' });
                        const url = URL.createObjectURL(blob);
                        objectUrlRef.current = url;
                        audio.src = url;
                    } catch (e) {
                        console.error('[AudioPlayer] Data format unrecognized, trying as direct source:', e);
                        audio.src = audioUrl;
                    }
                }
                audio.load();
            } catch (err) {
                console.error('[AudioPlayer] Setup failed:', err);
            }
        };

        setupSource();

        return () => {
            audio.pause();
            audio.src = '';
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = '';
            }
        };
    }, [audioUrl]);

    // --- 2. Separate Auto-Play Trigger ---
    useEffect(() => {
        if (autoPlay && ready && audioRef.current && !isPlaying) {
            audioRef.current.play()
                .then(() => console.log('[AudioPlayer] Auto-played msg'))
                .catch(e => console.warn('[AudioPlayer] Auto-play block:', e.message));
        }
    }, [autoPlay, ready]);

    const togglePlay = (e?: React.MouseEvent) => {
        // Prevent toggling if user is actually dragging the seeker
        if (e && (e.target as HTMLElement).tagName === 'INPUT') return;
        
        const audio = audioRef.current;
        if (!audio || !ready) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(e => console.error('[AudioPlayer] Play failed', e));
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;
        const t = parseFloat(e.target.value);
        audio.currentTime = t;
        setCurrentTime(t);
    };

    const fmt = (t: number) => {
        if (!t || isNaN(t) || t === Infinity) return '0:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <div 
            onClick={togglePlay}
            className="flex items-center bg-[#202c33] text-white px-3 py-2 rounded-[18px] gap-2.5 min-w-[200px] shadow-sm cursor-pointer hover:bg-[#2a3942] transition-colors select-none group"
        >
            {/* Play / Pause Icon (Decorative) */}
            <div className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-opacity ${!ready ? 'opacity-40' : 'opacity-100'}`}>
                <span className="material-icons-round text-[22px]">
                    {isPlaying ? 'pause' : 'play_arrow'}
                </span>
            </div>

            {/* Progress */}
            <div className="flex-1 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.01"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#10b981' }}
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                    <span>{fmt(currentTime)}</span>
                    <span>{fmt(duration)}</span>
                </div>
            </div>

            {/* Mic icon */}
            <div className="shrink-0 group-hover:scale-110 transition-transform">
                <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                    <span className="material-icons-round text-emerald-500 text-[14px]">mic</span>
                </div>
            </div>
        </div>
    );
};

export default AudioPlayer;
