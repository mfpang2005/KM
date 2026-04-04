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
        
        // 如果已经连接或是正在连接，且没有被手动断开，则不重复连接
        if (goEasyRef.current && (status === 'CONNECTED' || status === 'CONNECTING')) return;

        isManualDisconnectRef.current = false;
        
        try {
            if (!goEasyRef.current) {
                goEasyRef.current = (GoEasy as any).getInstance({
                    host: GOEASY_HOST,
                    appkey: GOEASY_APPKEY,
                    modules: ['pubsub'],
                });
            }

            const goEasy = goEasyRef.current;
            const currentStatus = goEasy.getConnectionStatus ? goEasy.getConnectionStatus() : 'disconnected';
            
            if (currentStatus === 'connected') {
                setStatus('CONNECTED');
                return;
            }

            setStatus('CONNECTING');
            goEasy.connect({
                id: user.id,
                data: { email: user.email, role: user.role },
                onSuccess: () => {
                    console.log('[GoEasyContext] Connected successfully.');
                    setStatus('CONNECTED');
                    if (reconnectTimerRef.current) {
                        clearTimeout(reconnectTimerRef.current);
                        reconnectTimerRef.current = null;
                    }
                },
                onFailed: (err: any) => {
                    console.error('[GoEasyContext] Connection failed:', err);
                    setStatus('DISCONNECTED');
                    scheduleReconnect();
                },
                onDisconnected: () => {
                    console.warn('[GoEasyContext] Disconnected.');
                    setStatus('DISCONNECTED');
                    if (!isManualDisconnectRef.current) {
                        scheduleReconnect();
                    }
                },
            });
        } catch (err) {
            console.error('[GoEasyContext] Init error:', err);
            setStatus('DISCONNECTED');
        }
    }, [user, status]);

    const disconnect = useCallback(() => {
        if (goEasyRef.current) {
            isManualDisconnectRef.current = true;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (typeof goEasyRef.current.disconnect === 'function') {
                goEasyRef.current.disconnect();
            }
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

    // 用户登录状态改变时自动连接/断开
    useEffect(() => {
        if (user) {
            connect();
        } else {
            disconnect();
        }
    }, [user, connect, disconnect]);

    // 清理逻辑
    useEffect(() => {
        return () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
        };
    }, []);

    return (
        <GoEasyContext.Provider value={{ goEasy: goEasyRef.current, status, connect, disconnect }}>
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
