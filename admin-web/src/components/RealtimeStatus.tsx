import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * RealtimeStatus 组件
 * 监听 Supabase Realtime 连接状态并显示美观的指示器
 */
const RealtimeStatus: React.FC<{ compact?: boolean }> = ({ compact }) => {
    const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
    const [lastError, setLastError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let isMounted = true;
        const channelName = `hb-${Math.random().toString(36).substring(7)}`;
        
        console.log(`[Realtime] Connecting to ${channelName}...`);
        const channel = supabase.channel(channelName);

        // 10秒监视器：给连接留出更多时间，防止在网络稍慢时误报
        const watchdog = setTimeout(() => {
            if (isMounted) {
                setStatus(current => {
                    if (current !== 'online') {
                        console.warn(`[Realtime] Watchdog timed out for ${channelName}`);
                        setLastError('Connection Timeout (10s)');
                        return 'offline';
                    }
                    return current;
                });
            }
        }, 10000);

        channel.subscribe((subStatus, err) => {
            if (!isMounted) return;
            console.log(`[Realtime] Channel ${channelName} status: ${subStatus}`, err || '');
            
            if (subStatus === 'SUBSCRIBED') {
                clearTimeout(watchdog);
                setStatus('online');
                setLastError(null);
            } else if (subStatus === 'CLOSED') {
                setStatus('offline');
            } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
                clearTimeout(watchdog);
                setStatus('offline');
                setLastError(err?.message || subStatus);
                // 5秒后尝试自动重连
                setTimeout(() => {
                    if (isMounted) {
                        console.log(`[Realtime] Retrying connection...`);
                        setRetryCount(prev => prev + 1);
                    }
                }, 5000);
            }
        });

        return () => {
            isMounted = false;
            clearTimeout(watchdog);
            console.log(`[Realtime] Cleaning up channel ${channelName}`);
            supabase.removeChannel(channel);
        };
    }, [retryCount]);

    return (
        <div className={`flex items-center gap-2 ${compact ? 'px-0 py-0 bg-transparent border-none shadow-none' : 'px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 shadow-sm'} transition-all group relative`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' :
                status === 'offline' ? 'bg-red-500' : 'bg-yellow-400'
                }`} />
            <span className={`font-black uppercase tracking-widest text-slate-500 ${compact ? 'text-[7px] text-slate-400' : 'text-[10px]'}`}>
                {compact ? status : `Realtime: ${status}`}
            </span>
            
            {status === 'offline' && (
                <button 
                    onClick={() => setRetryCount(prev => prev + 1)}
                    className="ml-1 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"
                    title={lastError || 'Click to reconnect'}
                >
                    <span className="material-icons-round text-xs">refresh</span>
                </button>
            )}

            {lastError && status === 'offline' && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-900 text-white text-[9px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {lastError}
                </div>
            )}
        </div>
    );
};

export default RealtimeStatus;
