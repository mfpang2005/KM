import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * RealtimeStatus 组件
 * 监听 Supabase Realtime 连接状态并显示美观的指示器
 */
const RealtimeStatus: React.FC = () => {
    const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');

    useEffect(() => {
        // 创建一个监控频道用于检测心跳
        const channel = supabase.channel('heartbeat-monitor');

        channel
            .on('system', { event: '*' }, (payload) => {
                console.log('Realtime System Event:', payload);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setStatus('online');
                } else if (status === 'CLOSED') {
                    setStatus('offline');
                } else if (status === 'CHANNEL_ERROR') {
                    setStatus('offline');
                } else {
                    setStatus('connecting');
                }
            });

        // 模拟简单心跳检测（通过频道状态）
        const interval = setInterval(() => {
            // supabase-js 会自动管理连接，我们只需监听状态
        }, 10000);

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 shadow-sm transition-all">
            <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500 animate-pulse' :
                status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Realtime: {status}
            </span>
        </div>
    );
};

export default RealtimeStatus;
