import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AdminOrderService } from '../services/api';
import type { Order } from '../types';
import { OrderStatus } from '../types';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

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
    equipments: Record<string, number>;
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
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 tracking-tight truncate">{order.id}</span>
                            <span className="text-[9px] font-bold text-slate-400">•</span>
                            <span className="text-[10px] font-black text-blue-600">{formatTime(order.dueTime)}</span>
                        </div>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            {order.status}
                        </span>
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
                            {/* Equipment display */}
                            {order.equipments && Object.keys(order.equipments).length > 0 && Object.values(order.equipments).some((q: any) => q > 0) && (
                                <div className="mt-4 mb-2 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                    <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5 shadow-sm">
                                        <span className="material-icons-round text-[12px]">hardware</span> Assigned Equipments
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(order.equipments).filter(([_, qty]) => (qty as number) > 0).map(([name, qty]) => (
                                            <span key={name} className="px-2 py-1 bg-white border border-amber-200 text-amber-800 text-[10px] font-bold rounded-lg shadow-sm">
                                                {name} <span className="font-black">×{qty as number}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

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

    // ── Data Fetching ─────────────────────────────────────────────────────────

    const fetchOrders = useCallback(async () => {
        try {
            const orders = await AdminOrderService.getAll({ sort_by: 'dueTime', order: 'asc' });
            if (!Array.isArray(orders)) return;

            const activeStatuses: string[] = [OrderStatus.PENDING, OrderStatus.PREPARING];
            const completedStatuses: string[] = [OrderStatus.READY, OrderStatus.DELIVERING, OrderStatus.COMPLETED];

            setKitchenOrders(prev => {
                const activeOrders = orders.filter(o => activeStatuses.includes(o.status as OrderStatus));
                const newMap: KitchenOrder[] = activeOrders.map(order => {
                    const existing = prev.find(k => k.id === order.id);
                    if (existing) {
                        // Preserve local expansion/items state
                        return { ...existing, customerName: order.customerName, dueTime: order.dueTime || '', status: order.status, equipments: order.equipments || {} };
                    }
                    return {
                        id: order.id,
                        customerName: order.customerName,
                        dueTime: order.dueTime || '',
                        status: order.status,
                        items: [],
                        equipments: order.equipments || {},
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
            const items = await AdminOrderService.getOrderItems(orderId);
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

        return () => {
            clearInterval(timer);
            supabase.removeChannel(ch);
        };
    }, [fetchOrders]);

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
            await AdminOrderService.markItemPrepared(itemId, checked);
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
            await AdminOrderService.kitchenComplete(orderId);
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

                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
                    {[
                        { id: 'production', label: 'In Production', icon: 'pending_actions' },
                        { id: 'history', label: 'Completed', icon: 'history' },
                        { id: 'recipes', label: 'Recipes', icon: 'menu_book' }
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

            <main className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar bg-slate-50">

                {/* ── Production Tab ── */}
                {activeTab === 'production' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {Object.keys(groupedOrders).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                                <span className="material-icons-round text-7xl mb-4">check_circle_outline</span>
                                <p className="text-xs font-black uppercase tracking-widest">所有订单已完成！</p>
                            </div>
                        ) : (
                            Object.entries(groupedOrders).map(([date, orders]) => (
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

                {/* ── Recipes Tab ── */}
                {activeTab === 'recipes' && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="flex items-center justify-between">
                            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Standard Recipe Library</h2>
                            <div className="flex items-center gap-2">
                                <label className="bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-2xl flex items-center gap-2 cursor-pointer hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100">
                                    <span className="material-icons-round text-sm">upload_file</span>
                                    <span className="text-[10px] font-black uppercase">Import Excel</span>
                                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                                </label>
                                <button onClick={handleExportExcel} className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-slate-200 transition-all active:scale-95 border border-slate-200">
                                    <span className="material-icons-round text-sm">download</span>
                                    <span className="text-[10px] font-black uppercase">Export Excel</span>
                                </button>
                                <button onClick={handleOpenAddModal} className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/20">
                                    <span className="material-icons-round text-sm">add</span>
                                    <span className="text-[10px] font-black uppercase">Add Recipe</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {recipes.map((recipe: Recipe) => (
                                <div key={recipe.id} className="bg-white p-6 rounded-[32px] border border-slate-100 flex flex-col gap-4 transition-all hover:shadow-xl group relative cursor-pointer">
                                    <div className="flex items-center gap-4" onClick={() => setSelectedRecipe(recipe)}>
                                        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-blue-600 border border-slate-100 shadow-inner group-hover:bg-blue-50 transition-all">
                                            <span className="material-icons-round text-2xl">menu_book</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-black text-slate-800 tracking-tight truncate">{recipe.name}</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{recipe.ingredients.length} Ingredients</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all pt-2 border-t border-slate-50">
                                        <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(recipe); }} className="flex-1 py-2.5 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center gap-1.5">
                                            <span className="material-icons-round text-sm">edit</span> Edit
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }} className="flex-1 py-2.5 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-1.5">
                                            <span className="material-icons-round text-sm">delete_outline</span> Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* ── Recipe Details Modal ── */}
            {selectedRecipe && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl animate-in zoom-in duration-300 flex flex-col max-h-[85vh]">
                        <header className="flex justify-between items-start mb-8 flex-shrink-0">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-icons-round text-blue-600 text-sm">calculate</span>
                                    <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Calculated Portions</h2>
                                </div>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{selectedRecipe.name}</h3>
                            </div>
                            <button onClick={() => setSelectedRecipe(null)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all active:scale-90">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-10 pr-2">
                            {selectedRecipe.ingredients.map((ing: Ingredient, idx: number) => (
                                <div key={idx} className="bg-slate-50 p-6 rounded-[28px] border border-slate-100 flex items-center justify-between">
                                    <span className="text-sm font-black text-slate-600 uppercase tracking-tight">{ing.name}</span>
                                    <div className="text-right flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black text-slate-900">{ing.baseQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase">{ing.unit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setSelectedRecipe(null)} className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                            Confirm Proportions
                        </button>
                    </div>
                </div>
            )}

            {/* ── Add/Edit Recipe Modal ── */}
            {isAddingRecipe && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-4xl rounded-[48px] p-10 shadow-2xl animate-in zoom-in duration-300">
                        <header className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">{editingRecipeId ? 'Edit Recipe' : 'New Recipe'}</h1>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update central database</p>
                            </div>
                            <button onClick={() => setIsAddingRecipe(false)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>
                        <form onSubmit={handleAddOrUpdateRecipe} className="space-y-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Recipe Name</label>
                                <input value={newRecipeName} onChange={e => setNewRecipeName(e.target.value)} type="text" required placeholder="e.g. Traditional Curry Chicken" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-[28px] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-slate-800" />
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">Ingredients</label>
                                    <button type="button" onClick={addIngredientRow} className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-full hover:bg-blue-100 transition-all flex items-center gap-1">
                                        <span className="material-icons-round text-sm">add</span> Add Row
                                    </button>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto pr-2 no-scrollbar space-y-3">
                                    {newRecipeIngredients.map((ing, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-[24px] border border-slate-100/50">
                                            <div className="col-span-5"><input placeholder="Ingredient" value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:border-blue-500 text-[11px] font-bold" /></div>
                                            <div className="col-span-3"><input placeholder="Unit" value={ing.unit} onChange={e => updateIngredient(idx, 'unit', e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:border-blue-500 text-[11px] font-bold uppercase" /></div>
                                            <div className="col-span-3"><input type="number" step="0.01" placeholder="Vol/10pax" value={ing.baseQty || ''} onChange={e => updateIngredient(idx, 'baseQty', parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:border-blue-500 text-[11px] font-bold" /></div>
                                            <div className="col-span-1 flex justify-center"><button type="button" onClick={() => removeIngredientRow(idx)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 transition-all"><span className="material-icons-round text-lg">remove_circle_outline</span></button></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                                {editingRecipeId ? 'Update Recipe' : 'Save Recipe & Ingredients'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

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
