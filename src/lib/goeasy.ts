import GoEasy from 'goeasy';

const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';

let instance: any = null;

/**
 * 获取 GoEasy 单例实例
 */
export const getGoEasy = () => {
    // 使用 globalThis (window) 来持久化实例，防止 Vite 热更新导致重复初始化报错
    const global = globalThis as any;
    
    if (!global.__goeasy_instance) {
        if (!GOEASY_APPKEY) {
            console.error('[GoEasy] ERROR: VITE_GOEASY_APPKEY is empty!');
            return null;
        }
        try {
            console.log(`[GoEasy] Initializing with Host: ${GOEASY_HOST}, Key Length: ${GOEASY_APPKEY.length}`);
            global.__goeasy_instance = GoEasy.getInstance({
                host: GOEASY_HOST,
                appkey: GOEASY_APPKEY,
                modules: ['pubsub']
            });
            console.log('[GoEasy] Instance initialized (Global)');
        } catch (err) {
            console.error('[GoEasy] Initialization failed:', err);
            // 如果报错是 "Please disconnect", 尝试返回已存在的实例 (如果有的话)
            if (global.__goeasy_instance) return global.__goeasy_instance;
        }
    }
    return global.__goeasy_instance;
};

/**
 * 统一的连接函数，处理 408 报错
 */
export const connectGoEasy = (userData: { id: string; [key: string]: any }) => {
    const goEasy = getGoEasy();
    if (!goEasy) return Promise.reject('GoEasy not initialized');

    return new Promise((resolve, reject) => {
        const status = goEasy.getConnectionStatus();
        console.log('[GoEasy] Current status before connect:', status);
        
        if (status === 'connected') {
            console.log('[GoEasy] Already connected, resolving.');
            resolve(goEasy);
            return;
        }

        try {
            goEasy.connect({
                id: userData.id,
                data: userData,
                onSuccess: () => {
                    console.log('[GoEasy] Connection Success:', userData.id);
                    resolve(goEasy);
                },
                onFailed: (error: any) => {
                    const errorMsg = error.content || String(error);
                    if (error.code === 408 && (errorMsg.includes('already connected') || errorMsg.includes('Already connected'))) {
                        console.log('[GoEasy] Handled as success (already connected)');
                        resolve(goEasy);
                    } else {
                        console.error('[GoEasy] Connection Failed:', error);
                        reject(error);
                    }
                }
            });
        } catch (err) {
            console.error('[GoEasy] Synchronous connect error:', err);
            reject(err);
        }
    });
};

/**
 * 预定义频道列表
 */
export const GE_CHANNELS = {
    COMMUNITY: 'KIM_LONG_COMUNITY',
    ORDERS: 'KIM_LONG_ORDERS',
    SYSTEM: 'KIM_LONG_SYSTEM'
};

/**
 * 消息类型枚举
 */
export type GE_MSG_TYPE = 'text' | 'audio' | 'order_new' | 'order_update' | 'recall';
