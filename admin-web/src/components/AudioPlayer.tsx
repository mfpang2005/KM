import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
    audioUrl: string; // Can be a URL or a base64 data URI
    initialDuration?: number; // Duration in seconds
}

/**
 * WhatsApp-style Audio Player using HTML5 Audio API
 * Styled with Tailwind CSS
 */
const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, initialDuration }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(initialDuration || 0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        let objectUrl = '';
        const audio = new Audio();
        audioRef.current = audio;

        const setAudioData = () => {
            if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
                setDuration(audio.duration);
            }
        };

        const setAudioTime = () => setCurrentTime(audio.currentTime);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener('loadedmetadata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        audio.addEventListener('ended', handleEnded);

        const initAudio = async () => {
            try {
                // Handle potentially missing data URI prefix if it's just raw base64
                let source = audioUrl;
                if (!audioUrl.startsWith('data:') && !audioUrl.startsWith('http')) {
                    // It's likely raw base64. Convert to Blob for better performance/compatibility
                    const binary = atob(audioUrl);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    const blob = new Blob([bytes], { type: 'audio/webm' });
                    objectUrl = URL.createObjectURL(blob);
                    source = objectUrl;
                } else if (audioUrl.startsWith('data:')) {
                    // If it's already a data URI, also convert to blob for consistency
                    const response = await fetch(audioUrl);
                    const blob = await response.blob();
                    objectUrl = URL.createObjectURL(blob);
                    source = objectUrl;
                }
                
                audio.src = source;
                audio.load();
            } catch (err) {
                console.error('Audio initialization failed', err);
            }
        };

        initAudio();

        return () => {
            audio.removeEventListener('loadedmetadata', setAudioData);
            audio.removeEventListener('timeupdate', setAudioTime);
            audio.removeEventListener('ended', handleEnded);
            audio.pause();
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [audioUrl]);

    useEffect(() => {
        if (initialDuration && (!duration || duration === Infinity)) {
            setDuration(initialDuration);
        }
    }, [initialDuration, duration]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => console.error('Playback failed', e));
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!audioRef.current) return;
        const time = parseFloat(e.target.value);
        audioRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const formatTime = (time: number) => {
        if (isNaN(time) || time === Infinity) return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className="flex items-center bg-[#202c33] text-white px-3 py-2 rounded-[18px] gap-2.5 min-w-[200px] shadow-sm">
            {/* 播放/暂停按钮 */}
            <button 
                onClick={togglePlay} 
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0"
            >
                <span className="material-icons-round text-[22px]">
                    {isPlaying ? 'pause' : 'play_arrow'}
                </span>
            </button>

            {/* 进度条逻辑 */}
            <div className="flex-1 flex flex-col gap-1.5">
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.01"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    style={{
                        accentColor: '#10b981' // emerald-500
                    }}
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
            
            {/* 右侧反馈图标 */}
            <div className="shrink-0">
                <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                   <span className="material-icons-round text-emerald-500 text-[14px]">mic</span>
                </div>
            </div>
        </div>
    );
};

export default AudioPlayer;
