import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * RealtimeStatus 组件
 * 监听 Supabase Realtime 连接状态并显示美观的指示器
 */
const RealtimeStatus: React.FC = () => {
    const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
    const [lastError, setLastError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let isMounted = true;
        const channelName = 'heartbeat-monitor';
        
        console.log(`[Realtime] Subscribing to ${channelName}... (Attempt ${retryCount + 1})`);
        
        const channel = supabase.channel(channelName);

        channel
            .on('system', { event: '*' }, (payload) => {
                if (isMounted) console.log('Realtime System Event:', payload);
            })
            .subscribe((status, err) => {
                if (!isMounted) return;
                
                console.log(`[Realtime] Channel Status: ${status}`, err || '');
                
                if (status === 'SUBSCRIBED') {
                    setStatus('online');
                    setLastError(null);
                } else if (status === 'CLOSED') {
                    setStatus('offline');
                } else if (status === 'CHANNEL_ERROR') {
                    setStatus('offline');
                    setLastError(err?.message || 'Channel Error');
                    // Retry after 5s
                    setTimeout(() => {
                        if (isMounted) setRetryCount(prev => prev + 1);
                    }, 5000);
                } else if (status === 'TIMED_OUT') {
                    setStatus('offline');
                    setLastError('Connection Timed Out');
                    // Retry after 5s
                    setTimeout(() => {
                        if (isMounted) setRetryCount(prev => prev + 1);
                    }, 5 * 1000);
                } else {
                    setStatus('connecting');
                }
            });

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [retryCount]);

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 shadow-sm transition-all group relative">
            <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500 animate-pulse' :
                status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Realtime: {status}
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
