import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
    audioUrl: string;        // raw base64 or data URI or http URL
    initialDuration?: number; // pre-filled duration in seconds (from DB)
    autoPlay?: boolean;       // true = auto-play incoming voice messages
}

/**
 * WhatsApp-style audio player.
 *
 * NOTE: Uses a Blob Object URL internally so the browser can read metadata
 * and seek correctly — raw base64 strings don't support seeking in Chrome.
 */
const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, initialDuration, autoPlay }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(initialDuration ?? 0);
    const [currentTime, setCurrentTime] = useState(0);
    const [ready, setReady] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string>('');

    // --- Build a playable URL from whatever format is passed in ---
    useEffect(() => {
        let cancelled = false;

        const setup = async () => {
            if (!audioUrl) {
                console.error('[AudioPlayer] No audioUrl provided');
                return;
            }

            // Revoke any previous object URL to prevent memory leak
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = '';
            }

            const audio = new Audio();
            audioRef.current = audio;
            // NOTE: 确保音量正确，防止因外部因素导致静音
            audio.volume = 1.0;
            audio.muted = false;
            setReady(false);
            setIsPlaying(false);
            setCurrentTime(0);

            const onMeta = () => {
                if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
                    setDuration(audio.duration);
                }
                setReady(true);
                console.log('[AudioPlayer] Metadata loaded, duration:', audio.duration, 'autoPlay:', autoPlay);
                // Auto-play incoming messages right after metadata is ready
                if (autoPlay) {
                    audio.play()
                        .then(() => console.log('[AudioPlayer] Auto-play started'))
                        .catch((e) => {
                            // Browser blocked auto-play — user must click manually
                            console.warn('[AudioPlayer] Auto-play blocked by browser:', e.message);
                        });
                }
            };
            const onTime  = () => setCurrentTime(audio.currentTime);
            const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
            const onPlay  = () => setIsPlaying(true);
            const onPause = () => setIsPlaying(false);
            const onError = (e: Event) => {
                const err = (e.target as HTMLAudioElement).error;
                console.error('[AudioPlayer] Audio error:', err?.code, err?.message);
            };

            audio.addEventListener('loadedmetadata', onMeta);
            audio.addEventListener('timeupdate', onTime);
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('play', onPlay);
            audio.addEventListener('pause', onPause);
            audio.addEventListener('error', onError);

            try {
                let blobUrl: string;

                if (audioUrl.startsWith('http')) {
                    // Plain HTTP URL — use directly
                    blobUrl = audioUrl;
                } else {
                    // Convert base64 (with or without data-URI prefix) to Blob URL
                    const raw = audioUrl.startsWith('data:')
                        ? await fetch(audioUrl).then(r => r.blob())
                        : (() => {
                            const bin = atob(audioUrl);
                            const bytes = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                            return new Blob([bytes], { type: 'audio/webm' });
                        })();
                    if (cancelled) return;
                    blobUrl = URL.createObjectURL(raw);
                    objectUrlRef.current = blobUrl;
                }

                audio.src = blobUrl;
                audio.load();
            } catch (err) {
                console.error('[AudioPlayer] Setup error', err);
            }
        };

        setup();

        return () => {
            cancelled = true;
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.src = '';
            }
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = '';
            }
        };
    }, [audioUrl, autoPlay]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
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
        <div className="flex items-center bg-[#202c33] text-white px-3 py-2 rounded-[18px] gap-2.5 min-w-[200px] shadow-sm">
            {/* Play / Pause */}
            <button
                onClick={togglePlay}
                disabled={!ready}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0 disabled:opacity-40"
            >
                <span className="material-icons-round text-[22px]">
                    {isPlaying ? 'pause' : 'play_arrow'}
                </span>
            </button>

            {/* Progress */}
            <div className="flex-1 flex flex-col gap-1.5">
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
            <div className="shrink-0">
                <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                    <span className="material-icons-round text-emerald-500 text-[14px]">mic</span>
                </div>
            </div>
        </div>
    );
};

export default AudioPlayer;
