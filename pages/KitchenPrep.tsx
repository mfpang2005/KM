import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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

import { OrderService } from '../src/services/api';
import { Order, OrderStatus } from '../types';

// ... (retain interfaces)

import { supabase } from '../src/lib/supabase';

const KitchenPrep: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'production' | 'history' | 'recipes'>('production');
    const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);

    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [isAddingRecipe, setIsAddingRecipe] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const fetchOrders = async () => {
        try {
            const orders = await OrderService.getAll();

            // Transform Orders to PrepItems
            const items: PrepItem[] = orders.flatMap(order => {
                let internalStatus: 'pending' | 'preparing' | 'ready' = 'pending';
                if (order.status === OrderStatus.PREPARING) internalStatus = 'preparing';
                if (order.status === OrderStatus.READY || order.status === OrderStatus.DELIVERING || order.status === OrderStatus.COMPLETED) internalStatus = 'ready';

                return order.items.map(item => ({
                    id: `${order.id}-${item.id}`,
                    orderId: order.id,
                    name: item.name,
                    quantity: item.quantity,
                    category: '主食',
                    note: item.note,
                    dueTime: order.dueTime,
                    dueDate: new Date().toLocaleDateString(),
                    status: internalStatus,
                    completedAt: internalStatus === 'ready' ? new Date().toLocaleTimeString() : undefined
                }));
            });

            setPrepItems(items);
        } catch (error) {
            console.error("Failed to fetch kitchen orders", error);
        }
    };

    useEffect(() => {
        fetchOrders();

        // NOTE: 用 Supabase Realtime 监听订单，实现厨房端即时刷新
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
        // Only show Pending and Preparing in Production tab
        const active = prepItems.filter(i => i.status === 'pending' || i.status === 'preparing');
        const groups: Record<string, PrepItem[]> = {};
        active.forEach(item => {
            if (!groups[item.dueDate]) groups[item.dueDate] = [];
            groups[item.dueDate].push(item);
        });
        return groups;
    }, [prepItems]);

    const completedItems = useMemo(() => {
        return prepItems.filter(i => i.status === 'ready');
    }, [prepItems]);

    const startProduction = async (itemId: string) => {
        // reverse lookup orderId
        const item = prepItems.find(i => i.id === itemId);
        if (!item) return;

        try {
            await OrderService.updateStatus(item.orderId, OrderStatus.PREPARING);
            fetchOrders(); // Refresh immediately
        } catch (e) {
            console.error("Failed to start order", e);
        }
    };

    const completeProduction = async (itemId: string) => {
        const item = prepItems.find(i => i.id === itemId);
        if (!item) return;

        try {
            await OrderService.updateStatus(item.orderId, OrderStatus.READY);
            fetchOrders();
        } catch (e) {
            console.error("Failed to complete order", e);
        }
    };

    const handleAddRecipe = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        const newRecipe: Recipe = {
            id: 'r' + Date.now(),
            name,
            ingredients: []
        };
        setRecipes([...recipes, newRecipe]);
        setIsAddingRecipe(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#0f172a] text-slate-200">
            <header className="pt-12 pb-4 px-6 bg-slate-900 border-b border-white/5 sticky top-0 z-30 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/30">
                            <span className="material-icons-round text-primary">precision_manufacturing</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-tight uppercase">后厨生产线</h1>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{currentTime} • 实时控制台</p>
                        </div>
                    </div>
                    <button onClick={() => navigate('/login')} className="p-2 text-slate-500 hover:text-white transition-colors">
                        <span className="material-icons-round">power_settings_new</span>
                    </button>
                </div>

                <div className="flex gap-1 bg-slate-800 p-1 rounded-2xl border border-white/5">
                    {[
                        { id: 'production', label: '生产中', icon: 'pending_actions' },
                        { id: 'history', label: '已完成', icon: 'history' },
                        { id: 'recipes', label: '食谱库', icon: 'menu_book' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <span className="material-icons-round text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32">
                {activeTab === 'production' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {Object.keys(groupedProduction).length === 0 ? (
                            <div className="text-center py-24 opacity-20">
                                <span className="material-icons-round text-8xl">check_circle_outline</span>
                                <p className="text-sm font-black mt-4 uppercase tracking-widest">当前无待生产任务</p>
                            </div>
                        ) : (
                            Object.entries(groupedProduction as Record<string, PrepItem[]>).map(([date, items]) => (
                                <section key={date} className="space-y-4">
                                    <div className="flex items-center gap-3 px-2">
                                        <div className="h-px flex-1 bg-white/5"></div>
                                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{date} 生产计划</h2>
                                        <div className="h-px flex-1 bg-white/5"></div>
                                    </div>

                                    <div className="space-y-3">
                                        {items.map(item => (
                                            <div
                                                key={item.id}
                                                className={`bg-slate-800/40 rounded-[32px] border border-white/5 overflow-hidden transition-all ${item.status === 'preparing' ? 'ring-2 ring-orange-500/30 bg-orange-500/5' : ''
                                                    }`}
                                            >
                                                <div className="p-5 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${item.status === 'preparing' ? 'bg-orange-500/20 border-orange-500/40 text-orange-500' : 'bg-slate-700/30 border-white/10 text-slate-500'
                                                            }`}>
                                                            <span className="text-2xl font-black">{item.quantity}</span>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-baseline gap-2">
                                                                <h3 className="text-base font-bold text-white tracking-tight">{item.name}</h3>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.orderId}</span>
                                                                <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                                                <span className="text-[10px] font-black text-primary">{item.dueTime}</span>
                                                            </div>
                                                            {item.note && (
                                                                <p className="text-[10px] text-yellow-500/80 font-bold mt-1 uppercase italic flex items-center gap-1">
                                                                    <span className="material-icons-round text-[12px]">priority_high</span> 备注: {item.note}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => setSelectedRecipe(recipes.find(r => r.name === item.name) || null)}
                                                        className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-slate-500 hover:text-primary transition-colors active:scale-90"
                                                    >
                                                        <span className="material-icons-round">receipt_long</span>
                                                    </button>
                                                </div>

                                                <div className="px-5 pb-5 pt-0">
                                                    {item.status === 'pending' ? (
                                                        <button
                                                            onClick={() => startProduction(item.id)}
                                                            className="w-full py-3.5 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                                        >
                                                            <span className="material-icons-round text-sm">play_arrow</span>
                                                            开始制作 (Start)
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => completeProduction(item.id)}
                                                            className="w-full py-3.5 bg-green-600 hover:bg-green-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center justify-center gap-2 animate-in fade-in zoom-in duration-300"
                                                        >
                                                            <span className="material-icons-round text-sm">done_all</span>
                                                            已完成 (Completed)
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
                    <div className="space-y-4 animate-in fade-in duration-500">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">已完成生产记录</h2>
                            <span className="text-[10px] font-black text-slate-500 bg-white/5 px-2 py-1 rounded">本日累计: {completedItems.length}</span>
                        </div>
                        {completedItems.map(item => (
                            <div key={item.id} className="bg-slate-800/30 p-5 rounded-[28px] border border-white/5 flex items-center justify-between opacity-80">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 border border-green-500/20">
                                        <span className="material-icons-round">task_alt</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-200">{item.quantity}x {item.name}</h4>
                                        <p className="text-[10px] text-slate-500 font-bold mt-1 tracking-tight">完成于: {item.completedAt}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{item.orderId}</span>
                                    <span className="text-[8px] font-black text-green-500/50 mt-1 uppercase border border-green-500/20 px-1.5 py-0.5 rounded">Checked</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'recipes' && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">标准菜谱库</h2>
                            <button
                                onClick={() => setIsAddingRecipe(true)}
                                className="bg-primary/10 text-primary px-3 py-2 rounded-xl flex items-center gap-2 active:scale-95 transition-transform"
                            >
                                <span className="material-icons-round text-sm">add</span>
                                <span className="text-[10px] font-black uppercase">新菜入库</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {recipes.map(recipe => (
                                <div
                                    key={recipe.id}
                                    onClick={() => setSelectedRecipe(recipe)}
                                    className="bg-slate-800 p-5 rounded-[32px] border border-white/5 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-all active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-primary border border-white/5 shadow-inner">
                                            <span className="material-icons-round">menu_book</span>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white">{recipe.name}</h3>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{recipe.ingredients.length} 种食材配方</p>
                                        </div>
                                    </div>
                                    <span className="material-icons-round text-slate-600">arrow_forward_ios</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {selectedRecipe && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[100] flex flex-col justify-end animate-in fade-in duration-300">
                    <div className="bg-slate-900 w-full max-w-md mx-auto rounded-t-[48px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-400 border-t border-white/5 max-h-[92vh] flex flex-col">
                        <header className="flex justify-between items-start mb-8 flex-shrink-0">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-icons-round text-primary text-sm">calculate</span>
                                    <h2 className="text-[10px] font-black text-primary uppercase tracking-widest">配料实时计算 (Portion Scale)</h2>
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tighter">{selectedRecipe.name}</h3>
                            </div>
                            <button onClick={() => setSelectedRecipe(null)} className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-8">
                            {selectedRecipe.ingredients.map((ing, idx) => (
                                <div key={idx} className="bg-white/5 p-5 rounded-[28px] border border-white/5 flex items-center justify-between">
                                    <span className="text-sm font-bold text-slate-300 uppercase tracking-tight">{ing.name}</span>
                                    <div className="text-right flex items-baseline gap-1.5">
                                        <span className="text-xl font-black text-primary">
                                            {((ing.baseQty / 10) * 20).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-600 uppercase">{ing.unit}</span>
                                    </div>
                                </div>
                            ))}
                            {selectedRecipe.ingredients.length === 0 && (
                                <div className="text-center py-10 opacity-30">
                                    <p className="text-xs font-bold uppercase">该菜谱暂未添加配料明细</p>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setSelectedRecipe(null)}
                            className="w-full py-5 bg-white text-slate-900 rounded-[28px] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex-shrink-0"
                        >
                            配料确认完成
                        </button>
                    </div>
                </div>
            )}

            {isAddingRecipe && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[100] flex flex-col justify-end animate-in fade-in duration-300">
                    <form onSubmit={handleAddRecipe} className="bg-slate-900 w-full max-w-md mx-auto rounded-t-[48px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-xl font-black text-white tracking-tight uppercase">入库新菜谱</h2>
                            <button type="button" onClick={() => setIsAddingRecipe(false)} className="text-slate-500">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <div className="space-y-5 mb-10">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">菜品名称 (Product Name)</label>
                                <input name="name" required className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold focus:border-primary/50 outline-none transition-all" placeholder="例如：黑椒牛柳炒面" />
                            </div>
                            <div className="p-5 bg-orange-500/10 border border-orange-500/20 rounded-[24px]">
                                <div className="flex gap-3">
                                    <span className="material-icons-round text-orange-500">info_outline</span>
                                    <p className="text-[10px] text-orange-500 font-bold leading-relaxed uppercase">
                                        新菜入库后请在管理后台完善详细的原材料配比，以确保库存系统能实时扣减。
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => setIsAddingRecipe(false)} className="flex-1 py-4 bg-white/5 text-slate-500 rounded-2xl font-bold uppercase text-xs">取消</button>
                            <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-primary/20">保存菜谱</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-900/80 backdrop-blur-xl border-t border-white/5 z-40 safe-bottom">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">生产线平均负载</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-lg font-black text-white">76%</span>
                            <div className="h-1.5 w-28 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-primary w-[76%] shadow-[0_0_12px_rgba(236,19,19,0.4)] transition-all duration-1000"></div>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">待处理件数</span>
                        <p className="text-2xl font-black text-primary leading-none mt-1">
                            {prepItems.filter(i => i.status !== 'ready').reduce((acc, curr) => acc + curr.quantity, 0)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KitchenPrep;