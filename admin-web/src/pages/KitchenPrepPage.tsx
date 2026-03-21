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
    name?: string;
    product_name?: string;
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

const INITIAL_RECIPES: Recipe[] = [];

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
    onCheck: (orderId: string, itemId: string, checked: boolean) => void;
    onConfirm: (orderId: string) => void;
    onLoad: (orderId: string) => void;
    loading: Set<string>;
    confirming: Set<string>;
}> = ({ order, onCheck, onConfirm, onLoad, loading, confirming }) => {
    // Auto-load items on mount
    useEffect(() => {
        if (!order.itemsLoaded) {
            onLoad(order.id);
        }
    }, [order.id, order.itemsLoaded, onLoad]);

    const totalItems = order.items.length;
    const doneItems = order.items.filter(i => i.is_prepared).length;
    const allPrepared = totalItems > 0 && order.items.every(i => i.is_prepared);
    const isConfirming = confirming.has(order.id);
    const isUrgent = order.dueTime ? (new Date(order.dueTime).getTime() - new Date().getTime() < 60 * 60 * 1000) : false;

    return (
        <div
            className={`bg-white rounded-[32px] border transition-all duration-500 flex flex-col h-[580px] relative
                ${order.removing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
                ${allPrepared ? 'border-green-400 ring-4 ring-green-400/10 shadow-xl shadow-green-500/10' : 'border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 hover:border-blue-100'}`}
        >
            {/* ── Header ── */}
            <div className={`p-5 flex flex-col gap-4 border-b rounded-t-[32px] ${allPrepared ? 'bg-green-50/50 border-green-100' : isUrgent ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50/30 border-slate-50'}`}>
                <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Order Ticket</span>
                            <span className="text-[10px] font-bold text-slate-300 leading-none">#</span>
                            <span className="text-xs font-black text-slate-900 tracking-tight leading-none">{order.id}</span>
                            <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider
                                ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                                {order.status}
                            </span>
                        </div>
                        <h3 className="text-base font-black text-slate-800 tracking-tight truncate pr-2">{order.customerName}</h3>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl flex flex-col items-center justify-center min-w-[70px] border shadow-sm shrink-0
                        ${isUrgent ? 'bg-amber-500 border-amber-400 text-white animate-pulse' : 'bg-white border-slate-100 text-blue-600'}`}>
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-80 leading-none mb-0.5">Time</span>
                        <span className="text-xs font-black tabular-nums leading-none">{formatTime(order.dueTime)}</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <span>Preparation Status</span>
                        <span className={allPrepared ? 'text-green-600' : 'text-slate-500'}>
                            {totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0}%
                        </span>
                    </div>
                    <ProgressBar done={doneItems} total={totalItems} />
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 p-5 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between mb-3 shrink-0">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Dish List ({order.items.length})
                    </span>
                    <button 
                        onClick={() => onLoad(order.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-90"
                    >
                        <span className="material-icons-round text-sm">refresh</span>
                    </button>
                </div>

                {!order.itemsLoaded && order.items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-[28px] p-6">
                        <div className="w-8 h-8 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                            Synchronizing Dishes...
                        </span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-3">
                        {order.items.length === 0 ? (
                             <div className="flex-1 py-10 flex flex-col items-center justify-center text-slate-300 bg-slate-50/30 rounded-[24px]">
                                <span className="material-icons-round text-4xl mb-2">inventory_2</span>
                                <span className="text-[10px] font-black uppercase tracking-widest mb-4">No dishes found</span>
                                <button 
                                    onClick={() => onLoad(order.id)}
                                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-black text-blue-600 shadow-sm hover:border-blue-200 active:scale-95"
                                >
                                    Try Refreshing
                                </button>
                            </div>
                        ) : (
                            order.items.map((item, idx) => (
                                <div
                                    key={item.id || idx}
                                    onClick={() => !loading.has(item.id) && onCheck(order.id, item.id, !item.is_prepared)}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all active:scale-[0.98]
                                        ${item.is_prepared
                                            ? 'bg-green-50 border-green-200 shadow-inner'
                                            : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm'
                                        }`}
                                >
                                    <div className="relative shrink-0">
                                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                                            ${loading.has(item.id) ? 'opacity-50' : ''}
                                            ${item.is_prepared
                                                ? 'bg-green-500 border-green-500 shadow-sm shadow-green-500/20'
                                                : 'bg-white border-slate-200'
                                            }`}>
                                            {item.is_prepared && <span className="material-icons-round text-white text-sm">check</span>}
                                            {loading.has(item.id) && <div className="w-3 h-3 border-[2.5px] border-white border-t-transparent rounded-full animate-spin" />}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-black tracking-tight leading-tight transition-all ${item.is_prepared ? 'text-green-700/40 line-through' : 'text-slate-800'}`}>
                                            {item.name || item.product_name || 'Unnamed Dish'}
                                        </p>
                                        {item.note && (
                                            <p className="text-[9px] font-bold text-amber-600 mt-1 italic leading-none">⚠ {item.note}</p>
                                        )}
                                    </div>

                                    <div className={`px-2.5 py-1 rounded-lg text-xs font-black shrink-0 transition-all
                                        ${item.is_prepared ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                        ×{item.quantity}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <div className="p-5 mt-auto border-t border-slate-50 bg-slate-50/50 rounded-b-[32px]">
                <button
                    disabled={!allPrepared || isConfirming}
                    onClick={() => allPrepared && onConfirm(order.id)}
                    className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300
                        ${allPrepared && !isConfirming
                            ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10 active:scale-95 hover:bg-slate-800'
                            : 'bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed'
                        }`}
                >
                    {isConfirming ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <span className="material-icons-round text-sm">
                                {allPrepared ? 'check_circle' : 'hourglass_empty'}
                            </span>
                            {allPrepared ? 'Complete Production' : `${totalItems - doneItems} Items Remain`}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const KitchenPrepPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'production' | 'history'>('production');
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
                        // Map global OrderItem to local OrderItem format
                        items: (order.items || []).map((it: any) => ({
                            ...it,
                            order_id: order.id,
                            is_prepared: it.is_prepared ?? false,
                            status: it.status ?? 'pending'
                        })) as OrderItem[],
                        equipments: order.equipments || {},
                        itemsLoaded: false, // Keep false until we do the supplemental fetch for is_prepared
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

    const fetchRecipes = useCallback(async () => {
        try {
            const data = await AdminOrderService.getRecipes();
            setRecipes(data);
        } catch (e) {
            console.error('Failed to fetch recipes', e);
        }
    }, []);

    // NOTE: Load order_items when a card is expanded
    const loadOrderItems = useCallback(async (orderId: string) => {
        if (fetchingItemsRef.current.has(orderId)) return;
        fetchingItemsRef.current.add(orderId);
        try {
            const data = await AdminOrderService.getOrderItems(orderId);
            const itemsList = Array.isArray(data) ? data : [];
            
            setKitchenOrders(prev =>
                prev.map(o => {
                    if (o.id !== orderId) return o;
                    // Treat itemsList (from order_items table) as the source of truth
                    // It contains the correct IDs for markItemPrepared and is_prepared status
                    const finalItems = itemsList.length > 0 ? itemsList : o.items;
                    return { ...o, items: finalItems as OrderItem[], itemsLoaded: true };
                })
            );
        } catch (e) {
            console.error('Failed to load order items', e);
        } finally {
            fetchingItemsRef.current.delete(orderId);
        }
    }, []);

    useEffect(() => {
        fetchOrders();
        fetchRecipes();

        let ordersTimeout: ReturnType<typeof setTimeout>;
        let recipesTimeout: ReturnType<typeof setTimeout>;

        // Realtime: listen to both orders AND order_items tables
        const ch = supabase.channel('kitchen-prep-v3')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                clearTimeout(ordersTimeout);
                ordersTimeout = setTimeout(() => fetchOrders(), 1500);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => {
                clearTimeout(recipesTimeout);
                recipesTimeout = setTimeout(() => fetchRecipes(), 1500);
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
            .subscribe((status, err) => {
                if (err) console.log(`[Realtime Kitchen] Status: ${status}, Error:`, err);
            });

        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 10_000);

        return () => {
            clearTimeout(ordersTimeout);
            clearTimeout(recipesTimeout);
            clearInterval(timer);
            supabase.removeChannel(ch);
        };
    }, [fetchOrders]);

    // ── Event Handlers ────────────────────────────────────────────────────────



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

    const handleDeleteRecipe = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this recipe?')) {
            try {
                await AdminOrderService.deleteRecipe(id);
                fetchRecipes();
            } catch (e) {
                console.error('Failed to delete recipe', e);
            }
        }
    };

    const handleAddOrUpdateRecipe = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const validIngredients = newRecipeIngredients.filter(ing => ing.name.trim() !== '');
        try {
            if (editingRecipeId) {
                await AdminOrderService.updateRecipe(editingRecipeId, {
                    name: newRecipeName,
                    ingredients: validIngredients
                });
            } else {
                await AdminOrderService.addRecipe({
                    name: newRecipeName,
                    ingredients: validIngredients
                });
            }
            fetchRecipes();
            setIsAddingRecipe(false);
            setEditingRecipeId(null);
            setNewRecipeName('');
            setNewRecipeIngredients([{ name: '', baseQty: 0, unit: '' }]);
        } catch (e) {
            console.error('Failed to save recipe', e);
            alert('保存失败，请重试');
        }
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

            // Batch add imported recipes to database
            Promise.all(filtered.map(r => AdminOrderService.addRecipe({
                name: r.name,
                ingredients: r.ingredients
            }))).then(() => {
                fetchRecipes();
                alert(`Imported ${filtered.length} new recipes!`);
            }).catch(e => {
                console.error('Failed to import recipes', e);
                alert('部分或全部菜谱导入失败');
            });
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

                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                                        {orders.map(order => (
                                            <OrderCard
                                                key={order.id}
                                                order={order}
                                                onCheck={handleItemCheck}
                                                onConfirm={handleKitchenComplete}
                                                onLoad={loadOrderItems}
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

            </main>

            {/* ── Separate Recipes Card ── */}
            <div className="px-6 pb-6">
                <div className="bg-white rounded-[12px] shadow-md border border-slate-100 overflow-hidden">
                    <header className="p-4 border-b border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-icons-round text-blue-900 font-bold">menu_book</span>
                            <h2 className="text-base font-bold text-blue-900 uppercase tracking-tight">RECIPES</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100">
                                <span className="material-icons-round text-xs">upload_file</span>
                                <span className="text-[9px] font-black uppercase">Import</span>
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                            </label>
                            <button onClick={handleExportExcel} className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 hover:bg-slate-100 transition-all active:scale-95 border border-slate-100">
                                <span className="material-icons-round text-xs">download</span>
                                <span className="text-[9px] font-black uppercase">Export</span>
                            </button>
                            <button onClick={handleOpenAddModal} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-500/10">
                                <span className="material-icons-round text-xs">add</span>
                                <span className="text-[9px] font-black uppercase">Add</span>
                            </button>
                        </div>
                    </header>
                    <div className="p-[16px]">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {recipes.map((recipe: Recipe) => (
                                <div key={recipe.id} className="group bg-slate-50 border border-slate-100/50 rounded-3xl p-5 hover:bg-white hover:shadow-2xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500 cursor-pointer flex flex-col gap-4">
                                    <div className="flex items-center gap-4" onClick={() => setSelectedRecipe(recipe)}>
                                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 border border-slate-100 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                                            <span className="material-icons-round text-[24px]">restaurant_menu</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-black text-slate-800 tracking-tight truncate group-hover:text-blue-600 transition-colors">{recipe.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="px-2 py-0.5 bg-slate-900/5 text-[9px] font-black text-slate-500 rounded-lg uppercase tracking-wider">{recipe.ingredients.length} Ingredients</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-auto pt-4 border-t border-slate-200/50">
                                        <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(recipe); }} className="py-2.5 bg-white border border-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                                            <span className="material-icons-round text-sm">edit_note</span> Edit
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }} className="py-2.5 bg-white border border-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-red-600 hover:border-red-100 hover:bg-red-50 transition-all flex items-center justify-center gap-2">
                                            <span className="material-icons-round text-sm">delete_sweep</span> Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>


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
                        <button onClick={() => setSelectedRecipe(null)} className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-[0.98]">
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
                            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-[28px] font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-[0.98]">
                                {editingRecipeId ? 'Update Master Recipe' : 'Create New Preparation'}
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
