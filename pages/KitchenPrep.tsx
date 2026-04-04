import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { OrderService, api } from '../src/services/api';
import type { Order } from '../types';
import { OrderStatus } from '../types';
import { supabase } from '../src/lib/supabase';
import * as XLSX from 'xlsx';
import PullToRefresh from '../src/components/PullToRefresh';
import GoEasy from 'goeasy';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
    id: string;
    order_id: string;
    name: string;
    quantity: number;
    is_prepared: boolean;
    status: 'pending' | 'ready';
    note?: string;
}

interface KitchenOrder {
    id: string;
    customerName: string;
    dueTime: string;
    status: string;
    items: OrderItem[];
    /** locally loaded items */
    itemsLoaded: boolean;
    /** true = card expanded */
    expanded: boolean;
    /** true = currently being removed after confirm (animation) */
    removing: boolean;
}

interface Ingredient {
    name: string;
    baseQty: number;
    unit: string;
}

interface Recipe {
    id: string;
    name: string;
    ingredients: Ingredient[];
}

const INITIAL_RECIPES: Recipe[] = [
    {
        id: 'r1',
        name: '扬州炒饭',
        ingredients: [
            { name: '白米 (Rice)', baseQty: 0.3, unit: 'kg' },
            { name: '虾仁 (Shrimp)', baseQty: 0.1, unit: 'kg' },
            { name: '鸡蛋 (Eggs)', baseQty: 6, unit: '粒' },
            { name: '青葱 (Spring Onion)', baseQty: 0.02, unit: 'kg' },
        ]
    },
    {
        id: 'r2',
        name: '椰浆饭 (Nasi Lemak)',
        ingredients: [
            { name: '香米 (Fragrant Rice)', baseQty: 0.4, unit: 'kg' },
            { name: '椰奶 (Santan)', baseQty: 0.1, unit: 'L' },
            { name: '炸鸡腿 (Fried Chicken)', baseQty: 10, unit: '份' },
            { name: '参巴酱 (Sambal)', baseQty: 0.15, unit: 'kg' },
        ]
    }
];

// ─── Walkie-Talkie Constants ──────────────────────────────────────────────────
const GOEASY_APPKEY = import.meta.env.VITE_GOEASY_APPKEY || '';
const GOEASY_HOST = 'singapore.goeasy.io';
const CHANNEL = 'KIM_LONG_COMUNITY';

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (isoString: string) => {
    if (!isoString || !isoString.includes('T')) return 'ASAP';
    try { return isoString.split('T')[1].substring(0, 5); } catch { return 'ASAP'; }
};

const formatDate = (isoString: string) => {
    if (!isoString || !isoString.includes('T')) return 'No Date';
    return isoString.split('T')[0];
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** 进度条组件 */
const ProgressBar: React.FC<{ done: number; total: number }> = ({ done, total }) => {
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const allDone = done === total && total > 0;
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${allDone ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`text-[10px] font-black tabular-nums ${allDone ? 'text-green-600' : 'text-slate-500'}`}>
                {done}/{total}
            </span>
        </div>
    );
};

/** 单个订单卡片 */
const OrderCard: React.FC<{
    order: KitchenOrder;
    onToggle: (id: string) => void;
    onCheck: (orderId: string, itemId: string, checked: boolean) => void;
    onConfirm: (orderId: string) => void;
    loading: Set<string>;
    confirming: Set<string>;
}> = ({ order, onToggle, onCheck, onConfirm, loading, confirming }) => {
    const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
    const doneItems = order.items.filter(i => i.is_prepared).reduce((s, i) => s + i.quantity, 0);
    const allPrepared = order.items.length > 0 && order.items.every(i => i.is_prepared);
    const isConfirming = confirming.has(order.id);

    return (
        <div
            className={`bg-white rounded-[28px] border transition-all duration-500 overflow-hidden
                ${order.removing ? 'opacity-0 scale-95 max-h-0 my-0 py-0' : 'opacity-100 scale-100'}
                ${allPrepared ? 'border-green-400 ring-4 ring-green-400/10 shadow-xl shadow-green-500/10' : 'border-slate-100 hover:border-slate-200 hover:shadow-lg'}`}
        >
            {/* ── Card Header ── */}
            <button
                onClick={() => onToggle(order.id)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50/50 transition-colors"
            >
                {/* Status dot */}
                <div className={`w-3 h-3 rounded-full shrink-0 ${allPrepared ? 'bg-green-500' : order.expanded ? 'bg-blue-500 animate-pulse' : 'bg-amber-400'}`} />

                {/* Order info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-slate-800 tracking-tight truncate">{order.id}</span>
                        <span className="text-[9px] font-bold text-slate-400">•</span>
                        <span className="text-[10px] font-black text-blue-600">{formatTime(order.dueTime)}</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 truncate">{order.customerName}</p>
                    {/* Progress */}
                    <div className="mt-2">
                        <ProgressBar done={doneItems} total={totalItems} />
                    </div>
                </div>

                {/* Chevron */}
                <span className={`material-icons-round text-slate-300 text-lg transition-transform duration-300 shrink-0 ${order.expanded ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {/* ── Expanded – Item List ── */}
            {order.expanded && (
                <div className="px-5 pb-5 border-t border-slate-50 animate-in fade-in duration-200">
                    {!order.itemsLoaded ? (
                        <div className="py-8 flex items-center justify-center gap-2 text-slate-300">
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Loading items...</span>
                        </div>
                    ) : order.items.length === 0 ? (
                        <div className="py-8 text-center text-slate-300">
                            <span className="material-icons-round text-3xl block mb-1">info_outline</span>
                            <span className="text-[10px] font-black uppercase">No items found</span>
                        </div>
                    ) : (
                        <>
                            {/* Item checkboxes */}
                            <div className="mt-4 space-y-2">
                                {order.items.map(item => {
                                    const isLoading = loading.has(item.id);
                                    return (
                                        <label
                                            key={item.id}
                                            className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all select-none
                                                ${item.is_prepared
                                                    ? 'bg-green-50 border-green-200'
                                                    : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                                                }`}
                                        >
                                            {/* Custom checkbox */}
                                            <div className="relative shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={item.is_prepared}
                                                    disabled={isLoading}
                                                    onChange={e => onCheck(order.id, item.id, e.target.checked)}
                                                    className="sr-only"
                                                />
                                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                                                    ${isLoading ? 'opacity-50' : ''}
                                                    ${item.is_prepared
                                                        ? 'bg-green-500 border-green-500'
                                                        : 'bg-white border-slate-300'
                                                    }`}>
                                                    {item.is_prepared && (
                                                        <span className="material-icons-round text-white text-sm">check</span>
                                                    )}
                                                    {isLoading && (
                                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Item info */}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-black truncate ${item.is_prepared ? 'text-green-700 line-through decoration-green-400' : 'text-slate-800'}`}>
                                                    {item.name}
                                                </p>
                                                {item.note && (
                                                    <p className="text-[9px] font-bold text-amber-600 mt-0.5 truncate italic">⚠ {item.note}</p>
                                                )}
                                            </div>

                                            {/* Quantity badge */}
                                            <div className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0
                                                ${item.is_prepared ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                ×{item.quantity}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Confirm Button */}
                            <button
                                disabled={!allPrepared || isConfirming}
                                onClick={() => allPrepared && onConfirm(order.id)}
                                className={`mt-5 w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300
                                    ${allPrepared && !isConfirming
                                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl shadow-green-500/30 active:scale-95 cursor-pointer'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                {isConfirming ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        正在确认...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-icons-round text-sm">
                                            {allPrepared ? 'local_shipping' : 'lock'}
                                        </span>
                                        {allPrepared ? '确认完成 — 通知司机出发' : `还剩 ${order.items.filter(i => !i.is_prepared).length} 项未完成`}
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const KitchenPrepPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'production' | 'history' | 'recipes'>('production');
    const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>([]);
    const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
    const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
    const [confirmingOrders, setConfirmingOrders] = useState<Set<string>>(new Set());
    const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [isAddingRecipe, setIsAddingRecipe] = useState(false);
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [newRecipeIngredients, setNewRecipeIngredients] = useState<Ingredient[]>([{ name: '', baseQty: 0, unit: '' }]);
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // NOTE: Track orders being fetched to avoid duplicate item loads
    const fetchingItemsRef = useRef<Set<string>>(new Set());

    // ─── PTT / Walkie-Talkie States ───────────────────────────────────────────
    const [userId, setUserId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string>('kitchen');
    const [pttStatus, setPttStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'TALKING' | 'LISTENING'>('IDLE');
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const silentAudioRef = useRef<HTMLAudioElement | null>(null);
    const goEasyRef = useRef<InstanceType<typeof GoEasy> | null>(null);

    // ── Data Fetching ─────────────────────────────────────────────────────────

    const fetchOrders = useCallback(async () => {
        try {
            const orders = await OrderService.getAll();
            if (!Array.isArray(orders)) return;

            const activeStatuses: string[] = [OrderStatus.PENDING, OrderStatus.PREPARING];
            const completedStatuses: string[] = [OrderStatus.READY, OrderStatus.DELIVERING, OrderStatus.COMPLETED];

            setKitchenOrders(prev => {
                const activeOrders = orders.filter(o => activeStatuses.includes(o.status as OrderStatus));
                const newMap: KitchenOrder[] = activeOrders.map(order => {
                    const existing = prev.find(k => k.id === order.id);
                    if (existing) {
                        // Preserve local expansion/items state
                        return { ...existing, customerName: order.customerName, dueTime: order.dueTime || '', status: order.status };
                    }
                    return {
                        id: order.id,
                        customerName: order.customerName,
                        dueTime: order.dueTime || '',
                        status: order.status,
                        items: [],
                        itemsLoaded: false,
                        expanded: false,
                        removing: false,
                    };
                });
                return newMap;
            });

            setCompletedOrders(orders.filter(o => completedStatuses.includes(o.status)));
        } catch (e) {
            console.error('Failed to fetch kitchen orders', e);
        }
    }, []);

    // NOTE: Load order_items when a card is expanded
    const loadOrderItems = useCallback(async (orderId: string) => {
        if (fetchingItemsRef.current.has(orderId)) return;
        fetchingItemsRef.current.add(orderId);
        try {
            const items = await OrderService.getOrderItems(orderId);
            setKitchenOrders(prev =>
                prev.map(o =>
                    o.id === orderId
                        ? { ...o, items: items as OrderItem[], itemsLoaded: true }
                        : o
                )
            );
        } catch (e) {
            console.error('Failed to load order items', e);
        } finally {
            fetchingItemsRef.current.delete(orderId);
        }
    }, []);

    useEffect(() => {
        fetchOrders();

        // Realtime: listen to both orders AND order_items tables
        const ch = supabase.channel('kitchen-prep-v2')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchOrders();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload: any) => {
                // Update the specific item in state directly
                if (payload.new) {
                    const updatedItem = payload.new as OrderItem;
                    setKitchenOrders(prev =>
                        prev.map(o =>
                            o.id === updatedItem.order_id
                                ? { ...o, items: o.items.map(i => i.id === updatedItem.id ? updatedItem : i) }
                                : o
                        )
                    );
                }
            })
            .subscribe();

        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 10_000);

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id);
                setUserEmail(session.user.email || 'kitchen');
            }
        });

        return () => {
            clearInterval(timer);
            supabase.removeChannel(ch);
        };
    }, [fetchOrders]);

    useEffect(() => {
        // 后厨端自动开启后台监听
        startPttSession();
    }, [userId]);

    // ─── PTT Logic ────────────────────────────────────────────────────────────

    /** 用户交互解锁音频权限 */
    const unlockAudio = useCallback(() => {
        if (audioUnlocked) return;
        const SILENT_WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const audio = new Audio(`data:audio/wav;base64,${SILENT_WAV}`);
        audio.volume = 0.01;
        audio.play()
            .then(() => {
                setAudioUnlocked(true);
                console.log('[Kitchen PTT] Audio context unlocked');
            })
            .catch((e) => {
                console.warn('[Kitchen PTT] Unlock failed:', e);
                setAudioUnlocked(true);
            });
        silentAudioRef.current = audio;
    }, [audioUnlocked]);

    // --- NEW: 监听全局点击以隐形解锁音频 ---
    useEffect(() => {
        if (audioUnlocked) return;
        const handleFirstClick = () => {
            unlockAudio();
            window.removeEventListener('click', handleFirstClick);
            window.removeEventListener('touchstart', handleFirstClick);
        };
        window.addEventListener('click', handleFirstClick);
        window.addEventListener('touchstart', handleFirstClick);
        return () => {
            window.removeEventListener('click', handleFirstClick);
            window.removeEventListener('touchstart', handleFirstClick);
        };
    }, [audioUnlocked, unlockAudio]);

    const playAudio = useCallback(async (content: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        try {
            // --- NEW: Handle HTTP URL directly ---
            if (content.startsWith('http')) {
                const audio = new Audio(content);
                audio.onended = () => setPttStatus('CONNECTED');
                audio.play().catch(e => console.error('[Kitchen PTT] Play error', e));
                setPttStatus('LISTENING');
                return;
            }

            const base64 = content.startsWith('data:') ? content.split(',')[1] : content;
            const binary = atob(base64);
            const buf = new ArrayBuffer(binary.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
            const audioBuf = await audioContextRef.current.decodeAudioData(buf);
            const src = audioContextRef.current.createBufferSource();
            src.buffer = audioBuf;
            src.connect(audioContextRef.current.destination);
            src.onended = () => setPttStatus('CONNECTED');
            src.start(0);
            setPttStatus('LISTENING');
        } catch (err) {
            console.error('[Kitchen PTT] Audio decode error', err);
            setPttStatus('CONNECTED');
        }
    }, []);

    const startPttSession = async () => {
        setPttStatus('CONNECTING');

        const doConnect = () => {
            try {
                const goEasy = GoEasy.getInstance({ host: GOEASY_HOST, appkey: GOEASY_APPKEY, modules: ['pubsub'] });
                goEasyRef.current = goEasy;

                const myId = userId || `kitchen-${Math.random().toString(36).slice(2, 9)}`;
                goEasy.connect({
                    id: myId,
                    data: { role: 'kitchen' },
                    onSuccess: () => {
                        setPttStatus('CONNECTED');
                        goEasy.pubsub.subscribe({
                            channel: CHANNEL,
                            onMessage: async (message: any) => {
                                try {
                                    const payload = JSON.parse(message.content);
                                    if (payload.senderId === myId) return;

                                    // 处理撤回指令 (New)
                                    if (payload.type === 'recall') {
                                        // 停止当前正在播放的一切声音
                                        if (audioContextRef.current) {
                                            audioContextRef.current.close().then(() => {
                                                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                                            });
                                        }
                                        console.log('[Kitchen PTT] Remote recall signal: Stopping playback');
                                        return;
                                    }

                                    if (payload.receiverId !== 'GLOBAL') return;
                                    const audioContent = payload.content || payload.audio;
                                    if (payload.type === 'audio' && audioContent) {
                                        await playAudio(audioContent);
                                    }
                                } catch (err) {}
                            }
                        });
                    },
                    onFailed: () => setPttStatus('IDLE')
                });
            } catch (e) {
                setPttStatus('IDLE');
            }
        };

        try {
            const status = GoEasy.getConnectionStatus();
            if (status === 'disconnected') doConnect();
            else GoEasy.disconnect({ onSuccess: doConnect, onFailed: doConnect });
        } catch { doConnect(); }
    };

    const handlePttDown = async () => {
        if (pttStatus !== 'CONNECTED') return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            audioChunksRef.current = [];
            mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mr.start(100);
            mediaRecorderRef.current = mr;
            setIsTransmitting(true);
            setPttStatus('TALKING');
        } catch { alert('请允许麦克风权限以使用对讲功能。'); }
    };

    const handlePttUp = () => {
        if (!mediaRecorderRef.current || !isTransmitting) return;
        setIsTransmitting(false);
        setPttStatus('CONNECTED');
        const mr = mediaRecorderRef.current;
        mr.onstop = async () => {
            if (!goEasyRef.current) return;
            try {
                const mimeType = mr.mimeType || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                if (blob.size < 100) return;

                const formData = new FormData();
                formData.append('file', blob, `voice_kitchen_${userId || 'unknown'}_${Date.now()}.webm`);
                
                const { data: uploadResult } = await api.post('/audio/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                
                const audioUrl = uploadResult.url;
                if (!audioUrl) throw new Error('Upload failed: No URL returned');

                const myId = userId || 'unknown-kitchen';
                const myName = userEmail || '厨房端';
                const ts = Date.now();
                const msgId = `${myId}-${ts}`;

                goEasyRef.current.pubsub.publish({
                    channel: CHANNEL,
                    message: JSON.stringify({
                        id: msgId,
                        type: 'audio',
                        senderId: myId,
                        senderLabel: myName,
                        senderRole: 'kitchen',
                        content: audioUrl,
                        timestamp: ts,
                        receiverId: 'GLOBAL',
                        duration: 0
                    })
                });

                supabase.from('messages').insert([{
                    id: msgId,
                    sender_id: myId,
                    sender_label: myName,
                    sender_role: 'kitchen',
                    receiver_id: 'GLOBAL',
                    content: audioUrl,
                    type: 'audio',
                    duration: 0
                }]);
            } catch (err) {
                console.error('[Kitchen PTT] Upload or Publish failed', err);
            }
            audioChunksRef.current = [];
        };
        mr.stop();
        mr.stream.getTracks().forEach(t => t.stop());
    };

    // ── Event Handlers ────────────────────────────────────────────────────────

    const handleToggle = useCallback((orderId: string) => {
        setKitchenOrders(prev => prev.map(o => {
            if (o.id !== orderId) return o;
            const willExpand = !o.expanded;
            if (willExpand && !o.itemsLoaded) {
                loadOrderItems(orderId);
            }
            return { ...o, expanded: willExpand };
        }));
    }, [loadOrderItems]);

    const handleItemCheck = useCallback(async (orderId: string, itemId: string, checked: boolean) => {
        // Optimistic UI update
        setKitchenOrders(prev =>
            prev.map(o =>
                o.id === orderId
                    ? { ...o, items: o.items.map(i => i.id === itemId ? { ...i, is_prepared: checked } : i) }
                    : o
            )
        );
        setLoadingItems(prev => new Set(prev).add(itemId));

        try {
            await OrderService.markItemPrepared(itemId, checked);
        } catch (e) {
            console.error('Failed to mark item', e);
            // Rollback
            setKitchenOrders(prev =>
                prev.map(o =>
                    o.id === orderId
                        ? { ...o, items: o.items.map(i => i.id === itemId ? { ...i, is_prepared: !checked } : i) }
                        : o
                )
            );
        } finally {
            setLoadingItems(prev => {
                const s = new Set(prev);
                s.delete(itemId);
                return s;
            });
        }
    }, []);

    const handleKitchenComplete = useCallback(async (orderId: string) => {
        setConfirmingOrders(prev => new Set(prev).add(orderId));
        try {
            await OrderService.kitchenComplete(orderId);
            // Trigger removal animation
            setKitchenOrders(prev => prev.map(o => o.id === orderId ? { ...o, removing: true } : o));
            // Remove from list after animation completes
            setTimeout(() => {
                setKitchenOrders(prev => prev.filter(o => o.id !== orderId));
                fetchOrders();
            }, 600);
        } catch (e) {
            console.error('Kitchen complete failed', e);
        } finally {
            setConfirmingOrders(prev => {
                const s = new Set(prev);
                s.delete(orderId);
                return s;
            });
        }
    }, [fetchOrders]);

    // ── Grouped by date ───────────────────────────────────────────────────────

    const groupedOrders = useMemo(() => {
        const groups: Record<string, KitchenOrder[]> = {};
        kitchenOrders.forEach(o => {
            const date = formatDate(o.dueTime);
            if (!groups[date]) groups[date] = [];
            groups[date].push(o);
        });
        return groups;
    }, [kitchenOrders]);

    const activeCount = kitchenOrders.filter(o => !o.removing).length;
    const preparedCount = kitchenOrders.filter(o => o.items.every(i => i.is_prepared) && o.items.length > 0).length;

    // ── Recipe Handlers ───────────────────────────────────────────────────────

    const handleOpenAddModal = () => {
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewRecipeIngredients([{ name: '', baseQty: 0, unit: '' }]);
        setIsAddingRecipe(true);
    };

    const handleOpenEditModal = (recipe: Recipe) => {
        setEditingRecipeId(recipe.id);
        setNewRecipeName(recipe.name);
        setNewRecipeIngredients(recipe.ingredients.length > 0 ? [...recipe.ingredients] : [{ name: '', baseQty: 0, unit: '' }]);
        setIsAddingRecipe(true);
    };

    const handleDeleteRecipe = (id: string) => {
        if (window.confirm('Are you sure you want to delete this recipe?')) {
            setRecipes(recipes.filter(r => r.id !== id));
        }
    };

    const handleAddOrUpdateRecipe = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const validIngredients = newRecipeIngredients.filter(ing => ing.name.trim() !== '');
        if (editingRecipeId) {
            setRecipes(recipes.map(r => r.id === editingRecipeId ? { ...r, name: newRecipeName, ingredients: validIngredients } : r));
        } else {
            setRecipes([...recipes, { id: 'r' + Date.now(), name: newRecipeName, ingredients: validIngredients }]);
        }
        setIsAddingRecipe(false);
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewRecipeIngredients([{ name: '', baseQty: 0, unit: '' }]);
    };

    const handleExportExcel = () => {
        const exportData = recipes.flatMap(recipe =>
            recipe.ingredients.map(ing => ({
                'Recipe Name (菜名)': recipe.name,
                'Ingredient (配料)': ing.name,
                'Unit (单位)': ing.unit,
                'Volume (分量/10pax)': ing.baseQty
            }))
        );
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Recipes');
        XLSX.writeFile(wb, `KimLong_Recipes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result as string;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data: any[] = XLSX.utils.sheet_to_json(ws);
            const importedMap: Record<string, Ingredient[]> = {};
            data.forEach(row => {
                const name = row['Recipe Name (菜名)'] || row['菜名'];
                const ingName = row['Ingredient (配料)'] || row['配料'];
                const unit = row['Unit (单位)'] || row['单位'];
                const qty = parseFloat(row['Volume (分量/10pax)'] || row['分量']);
                if (name && ingName) {
                    if (!importedMap[name]) importedMap[name] = [];
                    importedMap[name].push({ name: ingName, unit: unit || '', baseQty: qty || 0 });
                }
            });
            const newRecipes = Object.entries(importedMap).map(([name, ingredients]) => ({
                id: 'r-import-' + Math.random().toString(36).substr(2, 9),
                name,
                ingredients
            }));
            const currentNames = new Set(recipes.map(r => r.name));
            const filtered = newRecipes.filter(r => !currentNames.has(r.name));
            setRecipes([...recipes, ...filtered]);
            alert(`Imported ${filtered.length} new recipes!`);
        };
        reader.readAsBinaryString(file);
    };

    const addIngredientRow = () => setNewRecipeIngredients([...newRecipeIngredients, { name: '', baseQty: 0, unit: '' }]);

    const removeIngredientRow = (index: number) => {
        if (newRecipeIngredients.length > 1) {
            const updated = [...newRecipeIngredients];
            updated.splice(index, 1);
            setNewRecipeIngredients(updated);
        }
    };

    const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
        const updated = [...newRecipeIngredients];
        updated[index] = { ...updated[index], [field]: value };
        setNewRecipeIngredients(updated);
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-slate-50 rounded-[32px] overflow-hidden border border-slate-200 shadow-xl">
            <header className="pt-8 pb-4 px-8 bg-white border-b border-slate-100 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                            <span className="material-icons-round text-blue-600">precision_manufacturing</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase">Kitchen Production Line</h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{currentTime} • Real-time Monitoring</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">

                        {/* Stats badges */}
                        <div className="hidden md:flex items-center gap-3">
                        <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-2xl text-center">
                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Active</p>
                            <p className="text-xl font-black text-amber-700 leading-none">{activeCount}</p>
                        </div>
                        <div className="px-4 py-2 bg-green-50 border border-green-100 rounded-2xl text-center">
                            <p className="text-[9px] font-black text-green-500 uppercase tracking-widest">Ready</p>
                            <p className="text-xl font-black text-green-700 leading-none">{preparedCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
                    {[
                        { id: 'production', label: 'In Production', icon: 'pending_actions' },
                        { id: 'history', label: 'Completed', icon: 'history' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${activeTab === tab.id
                                ? 'bg-white text-blue-600 shadow-md border border-slate-200'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <span className="material-icons-round text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            <main className="flex-1 overflow-hidden relative bg-slate-50">
                <PullToRefresh onRefresh={fetchOrders}>
                    <div className="p-6 space-y-8 min-h-full pb-32">

                        {/* ── Production Tab ── */}
                        {activeTab === 'production' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                {Object.keys(groupedOrders).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                                        <span className="material-icons-round text-7xl mb-4">check_circle_outline</span>
                                        <p className="text-xs font-black uppercase tracking-widest">所有订单已完成！</p>
                                    </div>
                                ) : (
                                    Object.entries(groupedOrders as Record<string, KitchenOrder[]>).map(([date, orders]) => (
                                        <section key={date} className="space-y-3">
                                            <div className="flex items-center gap-4">
                                                <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{date} Schedule</h2>
                                                <div className="h-px w-full bg-slate-200" />
                                                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap">{orders.length} 单</span>
                                            </div>

                                            <div className="space-y-3">
                                                {orders.map(order => (
                                                    <OrderCard
                                                        key={order.id}
                                                        order={order}
                                                        onToggle={handleToggle}
                                                        onCheck={handleItemCheck}
                                                        onConfirm={handleKitchenComplete}
                                                        loading={loadingItems}
                                                        confirming={confirmingOrders}
                                                    />
                                                ))}
                                            </div>
                                        </section>
                                    ))
                                )}
                            </div>
                        )}

                        {/* ── History Tab ── */}
                        {activeTab === 'history' && (
                            <div className="space-y-4 animate-in fade-in duration-500 max-w-2xl mx-auto">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Completed Orders</h2>
                                    <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full">Total: {completedOrders.length}</span>
                                </div>
                                {completedOrders.length === 0 ? (
                                    <div className="text-center py-20 text-slate-300">
                                        <p className="text-xs font-black uppercase tracking-widest">No completed orders yet</p>
                                    </div>
                                ) : (
                                    completedOrders.map(order => (
                                        <div key={order.id} className="bg-white p-5 rounded-[28px] border border-slate-100 flex items-center justify-between hover:shadow-md transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-green-50 rounded-2xl flex items-center justify-center border border-green-100">
                                                    <span className="material-icons-round text-green-600 text-sm">check_circle</span>
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-800">{order.id}</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{order.customerName} • {formatTime(order.dueTime || '')}</p>
                                                </div>
                                            </div>
                                            <span className="text-[9px] font-black text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 uppercase">{order.status}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                    </div>
                </PullToRefresh>
            </main>


            {/* ── Bottom Stats Bar ── */}
            <div className="px-8 py-6 bg-white border-t border-slate-100 shadow-[0_-8px_24px_rgba(0,0,0,0.02)]">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Queue Status</span>
                        <div className="flex items-center gap-3 mt-1.5">
                            <ProgressBar done={preparedCount} total={activeCount} />
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Orders</span>
                        <p className="text-3xl font-black text-blue-600 leading-none mt-1.5">{activeCount}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KitchenPrepPage;
