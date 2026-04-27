import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import GoEasy from 'goeasy';
import { useAuth } from '../hooks/useAuth';

type GoEasyStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

interface GoEasyContextType {
    goEasy: any;
    status: GoEasyStatus;
    connect: () => void;
    disconnect: () => void;
}

const GoEasyContext = createContext<GoEasyContextType | undefined>(undefined);

const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';

export const GoEasyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [status, setStatus] = useState<GoEasyStatus>('DISCONNECTED');
    const goEasyRef = useRef<any>(null);
    const reconnectTimerRef = useRef<any>(null);
    const isManualDisconnectRef = useRef(false);

    const connect = useCallback(() => {
        if (!user || !GOEASY_APPKEY) return;
        
        // 尝试从全局获取实例，防止 HMR 冲突
        if (!goEasyRef.current) {
            if ((window as any).__goeasy_admin_instance) {
                goEasyRef.current = (window as any).__goeasy_admin_instance;
            } else {
                try {
                    console.log(`[GoEasyContext] Initializing new instance. Host: ${GOEASY_HOST}`);
                    // 兼容不同环境下的 GoEasy 导入结构
                    const GoEasyLib = (GoEasy as any).default || GoEasy;
                    const instance = (GoEasyLib as any).getInstance({
                        host: GOEASY_HOST,
                        appkey: GOEASY_APPKEY,
                        modules: ['pubsub'],
                    });
                    goEasyRef.current = instance;
                    (window as any).__goeasy_admin_instance = instance;
                } catch (e) {
                    console.error('[GoEasyContext] Init failed:', e);
                    return;
                }
            }
        }

        const goEasy = goEasyRef.current;
        if (!goEasy) return;

        const currentStatus = goEasy.getConnectionStatus ? goEasy.getConnectionStatus() : 'disconnected';
        if (currentStatus === 'connected' || currentStatus === 'connecting') {
            if (currentStatus === 'connected') setStatus('CONNECTED');
            return;
        }

        isManualDisconnectRef.current = false;
        setStatus('CONNECTING');
        
        try {
            const connectOptions = {
                id: user.id,
                data: { email: user.email, role: user.role },
                onSuccess: () => {
                    console.log('[GoEasyContext] Connected successfully as', user.email);
                    setStatus('CONNECTED');
                },
                onFailed: (err: any) => {
                    console.error('[GoEasyContext] Connection failed:', err);
                    const errorMsg = err.content || String(err);
                    if (err.code === 408 && (errorMsg.includes('already connected') || errorMsg.includes('Already connected'))) {
                        setStatus('CONNECTED');
                        return;
                    }
                    setStatus('DISCONNECTED');
                    scheduleReconnect();
                },
                onDisconnected: () => {
                    setStatus('DISCONNECTED');
                    if (!isManualDisconnectRef.current) scheduleReconnect();
                }
            };

            console.log('[GoEasyContext] Calling connect with options for', user.email);
            goEasy.connect(connectOptions);
        } catch (err) {
            console.error('[GoEasyContext] Synchronous connect error:', err);
            setStatus('DISCONNECTED');
            scheduleReconnect();
        }
    }, [user]);

    const disconnect = useCallback(() => {
        if (goEasyRef.current) {
            isManualDisconnectRef.current = true;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            try {
                if (typeof goEasyRef.current.disconnect === 'function') {
                    goEasyRef.current.disconnect();
                }
            } catch (e) {}
            setStatus('DISCONNECTED');
        }
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (isManualDisconnectRef.current || reconnectTimerRef.current) return;
        
        console.log('[GoEasyContext] Scheduling reconnect in 5s...');
        reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
        }, 5000);
    }, [connect]);

    // 用户状态改变时，我们只在没有用户时断开连接。
    // 连接由各个页面按需发起，不再自动连接，以节省名额。
    useEffect(() => {
        if (!user) {
            disconnect();
        }
    }, [user, disconnect]);

    // 清理逻辑
    useEffect(() => {
        return () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
        };
    }, []);

    const contextValue = React.useMemo(() => ({
        goEasy: goEasyRef.current,
        status,
        connect,
        disconnect
    }), [status, connect, disconnect]);

    return (
        <GoEasyContext.Provider value={contextValue}>
            {children}
        </GoEasyContext.Provider>
    );
};

export const useGoEasy = () => {
    const context = useContext(GoEasyContext);
    if (!context) {
        throw new Error('useGoEasy must be used within a GoEasyProvider');
    }
    return context;
};
