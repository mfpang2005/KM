import React, { useState, useMemo, useEffect } from 'react';
import { AdminOrderService } from '../services/api';
import type { Order } from '../types';
import { OrderStatus } from '../types';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface PrepItem {
    id: string;
    orderId: string;
    name: string;
    quantity: number;
    category: '主食' | '小吃' | '饮料';
    note?: string;
    dueTime: string;
    dueDate: string;
    status: 'pending' | 'preparing' | 'ready';
    completedAt?: string;
}

interface Ingredient {
    name: string;
    baseQty: number; // 每 10 人份的基数
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

const KitchenPrepPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'production' | 'history' | 'recipes'>('production');
    const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);

    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [isAddingRecipe, setIsAddingRecipe] = useState(false);
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [newRecipeIngredients, setNewRecipeIngredients] = useState<Ingredient[]>([
        { name: '', baseQty: 0, unit: '' }
    ]);

    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const fetchOrders = async () => {
        try {
            const orders = await AdminOrderService.getAll();

            if (!Array.isArray(orders)) {
                console.error("Orders is not an array:", orders);
                setPrepItems([]);
                return;
            }

            // Transform Orders to PrepItems
            const items: PrepItem[] = orders.flatMap((order: Order) => {
                if (!order) return [];

                let internalStatus: 'pending' | 'preparing' | 'ready' = 'pending';
                if (order.status === OrderStatus.PREPARING) internalStatus = 'preparing';
                if (order.status === OrderStatus.READY || order.status === OrderStatus.DELIVERING || order.status === OrderStatus.COMPLETED) internalStatus = 'ready';

                const orderItems = order.items || [];
                return orderItems.map(item => ({
                    id: `${order.id}-${item.id}`,
                    orderId: order.id,
                    name: item.name || 'Unknown Item',
                    quantity: item.quantity || 0,
                    category: '主食',
                    note: item.note,
                    dueTime: order.dueTime || '',
                    dueDate: order.dueTime ? order.dueTime.split('T')[0] : 'No Date',
                    status: internalStatus,
                    completedAt: internalStatus === 'ready' ? new Date().toLocaleTimeString() : undefined
                }));
            });

            setPrepItems(items);
        } catch (error) {
            console.error("Failed to fetch kitchen orders", error);
            setPrepItems([]);
        }
    };

    const formatTime = (isoString: string) => {
        if (!isoString || !isoString.includes('T')) return 'ASAP';
        try {
            return isoString.split('T')[1].substring(0, 5);
        } catch {
            return 'ASAP';
        }
    };

    useEffect(() => {
        fetchOrders();

        // 实时监听监听订单，实现台端即时刷新
        const channel = supabase.channel('kitchen-prep-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    fetchOrders();
                }
            )
            .subscribe();

        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 10000);

        return () => {
            clearInterval(timer);
            supabase.removeChannel(channel);
        };
    }, []);

    const groupedProduction = useMemo(() => {
        if (!Array.isArray(prepItems)) return {};
        // Only show Pending and Preparing in Production tab
        const active = prepItems.filter((i: PrepItem) => i && (i.status === 'pending' || i.status === 'preparing'));
        const groups: Record<string, PrepItem[]> = {};
        active.forEach((item: PrepItem) => {
            const date = item.dueDate || 'Unknown';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        return groups;
    }, [prepItems]);

    const completedItems = useMemo(() => {
        if (!Array.isArray(prepItems)) return [];
        return prepItems.filter((i: PrepItem) => i && i.status === 'ready');
    }, [prepItems]);

    const startProduction = async (itemId: string) => {
        const item = prepItems.find((i: PrepItem) => i.id === itemId);
        if (!item) return;

        try {
            await AdminOrderService.updateStatus(item.orderId, OrderStatus.PREPARING);
            fetchOrders();
        } catch (e) {
            console.error("Failed to start order", e);
        }
    };

    const completeProduction = async (itemId: string) => {
        const item = prepItems.find((i: PrepItem) => i.id === itemId);
        if (!item) return;

        try {
            await AdminOrderService.updateStatus(item.orderId, OrderStatus.READY);
            fetchOrders();
        } catch (e) {
            console.error("Failed to complete order", e);
        }
    };

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
        if (window.confirm('Are you sure you want to delete this recipe? (确定要删除此食谱吗？)')) {
            setRecipes(recipes.filter(r => r.id !== id));
        }
    };

    const handleAddOrUpdateRecipe = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // Filter out empty ingredients
        const validIngredients = newRecipeIngredients.filter(ing => ing.name.trim() !== '');

        if (editingRecipeId) {
            setRecipes(recipes.map(r => r.id === editingRecipeId ? { ...r, name: newRecipeName, ingredients: validIngredients } : r));
        } else {
            const newRecipe: Recipe = {
                id: 'r' + Date.now(),
                name: newRecipeName,
                ingredients: validIngredients
            };
            setRecipes([...recipes, newRecipe]);
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
        XLSX.utils.book_append_sheet(wb, ws, "Recipes");
        XLSX.writeFile(wb, `KimLong_Recipes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result as string;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data: any[] = XLSX.utils.sheet_to_json(ws);

            const importedRecipesMap: Record<string, Ingredient[]> = {};
            data.forEach(row => {
                const name = row['Recipe Name (菜名)'] || row['菜名'];
                const ingName = row['Ingredient (配料)'] || row['配料'];
                const unit = row['Unit (单位)'] || row['单位'];
                const qty = parseFloat(row['Volume (分量/10pax)'] || row['分量']);

                if (name && ingName) {
                    if (!importedRecipesMap[name]) importedRecipesMap[name] = [];
                    importedRecipesMap[name].push({ name: ingName, unit: unit || '', baseQty: qty || 0 });
                }
            });

            const newRecipesList: Recipe[] = Object.entries(importedRecipesMap).map(([name, ingredients]) => ({
                id: 'r-import-' + Math.random().toString(36).substr(2, 9),
                name,
                ingredients
            }));

            const currentNames = new Set(recipes.map(r => r.name));
            const filteredImported = newRecipesList.filter(r => !currentNames.has(r.name));

            setRecipes([...recipes, ...filteredImported]);
            alert(`Imported ${filteredImported.length} new recipes! (成功导入 ${filteredImported.length} 个新食谱)`);
        };
        reader.readAsBinaryString(file);
    };

    const addIngredientRow = () => {
        setNewRecipeIngredients([...newRecipeIngredients, { name: '', baseQty: 0, unit: '' }]);
    };

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

            <main className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-slate-50">
                {activeTab === 'production' && (
                    <div className="space-y-10 animate-in fade-in duration-500">
                        {Object.keys(groupedProduction).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-slate-300">
                                <span className="material-icons-round text-7xl mb-4">check_circle_outline</span>
                                <p className="text-xs font-black uppercase tracking-widest">No active production tasks</p>
                            </div>
                        ) : (
                            Object.entries(groupedProduction as Record<string, PrepItem[]>).map(([date, items]) => (
                                <section key={date} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{date} Schedule</h2>
                                        <div className="h-px w-full bg-slate-200"></div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {items.map((item: PrepItem) => (
                                            <div
                                                key={item.id}
                                                className={`bg-white rounded-[32px] border transition-all p-6 group flex flex-col justify-between ${item.status === 'preparing'
                                                    ? 'border-blue-500 ring-4 ring-blue-500/5 shadow-xl shadow-blue-500/10'
                                                    : 'border-slate-100 hover:border-slate-200 hover:shadow-lg'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between mb-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all font-black text-xl ${item.status === 'preparing'
                                                            ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/30'
                                                            : 'bg-slate-50 text-slate-400 border-slate-100'
                                                            }`}>
                                                            {item.quantity}
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-black text-slate-800 tracking-tight leading-tight">{item.name}</h3>
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.orderId}</span>
                                                                <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                                <span className="text-[10px] font-black text-blue-600">{formatTime(item.dueTime)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setSelectedRecipe(recipes.find((r: Recipe) => r.name === item.name) || null)}
                                                        className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-90"
                                                    >
                                                        <span className="material-icons-round text-lg">menu_book</span>
                                                    </button>
                                                </div>

                                                {item.note && (
                                                    <div className="mb-6 p-3 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-2">
                                                        <span className="material-icons-round text-amber-500 text-sm mt-0.5">priority_high</span>
                                                        <p className="text-[10px] text-amber-700 font-bold uppercase italic leading-relaxed">
                                                            Note: {item.note}
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="flex gap-2">
                                                    {item.status === 'pending' ? (
                                                        <button
                                                            onClick={() => startProduction(item.id)}
                                                            className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                                        >
                                                            <span className="material-icons-round text-sm">play_arrow</span>
                                                            Start (开始)
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => completeProduction(item.id)}
                                                            className="flex-1 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                                                        >
                                                            <span className="material-icons-round text-sm">done_all</span>
                                                            Ready (完成)
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-4 animate-in fade-in duration-500 max-w-2xl mx-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Completed Production Records</h2>
                            <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full">Daily Total: {completedItems.length}</span>
                        </div>
                        <div className="space-y-3">
                            {completedItems.length === 0 ? (
                                <div className="text-center py-20 text-slate-300">
                                    <p className="text-xs font-black uppercase tracking-widest">No history yet for today</p>
                                </div>
                            ) : (
                                completedItems.map((item: PrepItem) => (
                                    <div key={item.id} className="bg-white p-5 rounded-[32px] border border-slate-100 flex items-center justify-between transition-all hover:shadow-md">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 border border-green-100 font-black">
                                                {item.quantity}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-slate-800">{item.name}</h4>
                                                <p className="text-[10px] text-slate-400 font-bold mt-1 tracking-tight">Ready at: {item.completedAt}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.orderId}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

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
                                <button
                                    onClick={handleExportExcel}
                                    className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-slate-200 transition-all active:scale-95 border border-slate-200"
                                >
                                    <span className="material-icons-round text-sm">download</span>
                                    <span className="text-[10px] font-black uppercase">Export Excel</span>
                                </button>
                                <button
                                    onClick={handleOpenAddModal}
                                    className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
                                >
                                    <span className="material-icons-round text-sm">add</span>
                                    <span className="text-[10px] font-black uppercase">Add Recipe</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {recipes.map((recipe: Recipe) => (
                                <div
                                    key={recipe.id}
                                    className="bg-white p-6 rounded-[32px] border border-slate-100 flex flex-col gap-4 transition-all hover:shadow-xl group relative cursor-pointer"
                                >
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
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleOpenEditModal(recipe); }}
                                            className="flex-1 py-2.5 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <span className="material-icons-round text-sm">edit</span> Edit
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }}
                                            className="flex-1 py-2.5 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <span className="material-icons-round text-sm">delete_outline</span> Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Recipe Details Modal */}
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
                                        <span className="text-2xl font-black text-slate-900">
                                            {/* Note: In a real app, this would multiply by selected quantity */}
                                            {ing.baseQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase">{ing.unit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => setSelectedRecipe(null)}
                            className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all active:scale-95"
                        >
                            Confirm Proportions
                        </button>
                    </div>
                </div>
            )}

            {/* Add Recipe Modal */}
            {isAddingRecipe && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-4xl rounded-[48px] p-10 shadow-2xl animate-in zoom-in duration-300">
                        <header className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                                    {editingRecipeId ? 'Edit Recipe (编辑食谱)' : 'New Recipe (新增食谱)'}
                                </h1>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update central database</p>
                            </div>
                            <button onClick={() => setIsAddingRecipe(false)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>

                        <form onSubmit={handleAddOrUpdateRecipe} className="space-y-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Recipe Name (菜名)</label>
                                <input
                                    value={newRecipeName}
                                    onChange={(e) => setNewRecipeName(e.target.value)}
                                    type="text"
                                    required
                                    placeholder="e.g. Traditional Curry Chicken"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-[28px] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-slate-800"
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">Ingredients (配料表)</label>
                                    <button
                                        type="button"
                                        onClick={addIngredientRow}
                                        className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-full hover:bg-blue-100 transition-all flex items-center gap-1"
                                    >
                                        <span className="material-icons-round text-sm">add</span> Add Row
                                    </button>
                                </div>

                                <div className="max-h-[300px] overflow-y-auto pr-2 no-scrollbar space-y-3">
                                    {newRecipeIngredients.map((ing, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-[24px] border border-slate-100/50">
                                            <div className="col-span-5">
                                                <input
                                                    placeholder="Ingredient (配料)"
                                                    value={ing.name}
                                                    onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:border-blue-500 text-[11px] font-bold"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    placeholder="Unit (单位)"
                                                    value={ing.unit}
                                                    onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                                                    className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:border-blue-500 text-[11px] font-bold uppercase"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="Vol (分量/10pax)"
                                                    value={ing.baseQty || ''}
                                                    onChange={(e) => updateIngredient(idx, 'baseQty', parseFloat(e.target.value) || 0)}
                                                    className="w-full px-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:border-blue-500 text-[11px] font-bold"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => removeIngredientRow(idx)}
                                                    className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 transition-all"
                                                >
                                                    <span className="material-icons-round text-lg">remove_circle_outline</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all active:scale-95"
                            >
                                {editingRecipeId ? 'Update Recipe' : 'Save Recipe & Ingredients'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 bg-white border-t border-slate-100 shadow-[0_-8px_24px_rgba(0,0,0,0.02)]">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production Load Index</span>
                        <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xl font-black text-slate-800">76%</span>
                            <div className="h-2 w-48 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                <div className="h-full bg-blue-500 w-[76%] shadow-[0_0_12px_rgba(59,130,246,0.3)] transition-all duration-1000"></div>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Items</span>
                        <p className="text-3xl font-black text-blue-600 leading-none mt-1.5">
                            {prepItems.filter((i: PrepItem) => i.status !== 'ready').reduce((acc: number, curr: PrepItem) => acc + curr.quantity, 0)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KitchenPrepPage;
