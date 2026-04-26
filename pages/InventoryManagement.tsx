import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService } from '../src/services/api';
import type { InventoryItem, InventoryLog } from '../types';
import PullToRefresh from '../src/components/PullToRefresh';

const InventoryManagement: React.FC = () => {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [logs, setLogs] = useState<InventoryLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'items' | 'logs'>('items');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    
    // Modals
    const [showItemModal, setShowItemModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [adjustType, setAdjustType] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
    
    // Form States
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        category: '',
        unit: 'kg',
        unit_price: 0,
        stock_quantity: 0,
        min_threshold: 0,
        max_threshold: 0
    });
    
    const [adjustData, setAdjustData] = useState({
        quantity: 0,
        remark: ''
    });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [itemsRes, logsRes] = await Promise.all([
                InventoryService.getAll(),
                InventoryService.getLogs()
            ]);
            setItems(itemsRes || []);
            setLogs(logsRes || []);
        } catch (err) {
            console.error('Failed to fetch inventory data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const categories = useMemo(() => {
        const cats = new Set(items.map(i => i.category).filter(Boolean));
        return ['ALL', ...Array.from(cats).sort()];
    }, [items]);

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              item.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const stats = useMemo(() => {
        const totalValue = items.reduce((acc, item) => acc + (item.stock_quantity * item.unit_price), 0);
        const lowStock = items.filter(item => item.stock_quantity <= item.min_threshold).length;
        const overStock = items.filter(item => item.max_threshold > 0 && item.stock_quantity > item.max_threshold).length;
        return { totalValue, lowStock, overStock };
    }, [items]);

    const handleSaveItem = async () => {
        if (!formData.name || !formData.code) {
            alert('请填写必要信息');
            return;
        }
        try {
            if (selectedItem) {
                await InventoryService.update(selectedItem.id, formData);
            } else {
                await InventoryService.create(formData);
            }
            setShowItemModal(false);
            setSelectedItem(null);
            fetchData();
        } catch (err) {
            alert('保存失败');
        }
    };

    const handleAdjustStock = async () => {
        if (!selectedItem || adjustData.quantity <= 0) {
            alert('请输入有效数量');
            return;
        }
        try {
            await InventoryService.adjustStock({
                item_id: selectedItem.id,
                type: adjustType,
                quantity: adjustData.quantity,
                remark: adjustData.remark
            });
            setShowAdjustModal(false);
            setSelectedItem(null);
            fetchData();
        } catch (err) {
            alert('调整失败');
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (!window.confirm('确定要删除此物项吗？相关日志也将被删除。')) return;
        try {
            await InventoryService.delete(id);
            fetchData();
        } catch (err) {
            alert('删除失败');
        }
    };

    const openEditModal = (item: InventoryItem) => {
        setSelectedItem(item);
        setFormData({
            code: item.code,
            name: item.name,
            category: item.category || '',
            unit: item.unit || 'kg',
            unit_price: item.unit_price,
            stock_quantity: item.stock_quantity,
            min_threshold: item.min_threshold,
            max_threshold: item.max_threshold
        });
        setShowItemModal(true);
    };

    const openAdjustModal = (item: InventoryItem, type: 'IN' | 'OUT' | 'ADJUST') => {
        setSelectedItem(item);
        setAdjustType(type);
        setAdjustData({ quantity: 0, remark: '' });
        setShowAdjustModal(true);
    };

    return (
        <div className="flex flex-col h-full bg-background-beige relative">
            {/* Header Area */}
            <header className="pt-12 pb-6 px-6 bg-white sticky top-0 z-30 shadow-sm border-b border-primary/5">
                <div className="max-w-[1600px] mx-auto space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-primary tracking-tight leading-none uppercase italic">Stock Inventory</h1>
                            <p className="text-[9px] font-bold text-primary-light/60 uppercase tracking-widest mt-1">Management & Real-time Tracking</p>
                        </div>
                        <button 
                            onClick={() => {
                                setSelectedItem(null);
                                setFormData({
                                    code: '', name: '', category: '', unit: 'kg',
                                    unit_price: 0, stock_quantity: 0, min_threshold: 0, max_threshold: 0
                                });
                                setShowItemModal(true);
                            }}
                            className="w-10 h-10 bg-primary text-white rounded-full shadow-lg shadow-primary/20 flex items-center justify-center active:scale-90 transition-all"
                        >
                            <span className="material-icons-round">add</span>
                        </button>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 flex flex-col items-center text-center">
                            <span className="text-[7px] font-black text-emerald-600/60 uppercase tracking-widest mb-1">Total Value</span>
                            <span className="text-xs font-black text-emerald-700">RM{stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className={`p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${stats.lowStock > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                            <span className={`text-[7px] font-black uppercase tracking-widest mb-1 ${stats.lowStock > 0 ? 'text-red-600' : 'text-slate-400'}`}>Low Stock</span>
                            <span className={`text-xs font-black ${stats.lowStock > 0 ? 'text-red-700' : 'text-slate-500'}`}>{stats.lowStock} Items</span>
                        </div>
                        <div className={`p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${stats.overStock > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                            <span className={`text-[7px] font-black uppercase tracking-widest mb-1 ${stats.overStock > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Over Stock</span>
                            <span className={`text-xs font-black ${stats.overStock > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{stats.overStock} Items</span>
                        </div>
                    </div>

                    {/* Tabs / Controls */}
                    <div className="flex gap-2 items-center pt-2">
                        <div className="relative flex-1">
                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-primary/30 text-sm">search</span>
                            <input 
                                type="text"
                                placeholder="搜索物品..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-primary/5 border-none rounded-xl text-xs font-bold text-primary placeholder:text-primary-light/30 focus:ring-1 focus:ring-primary/20"
                            />
                        </div>
                        <select 
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-3 py-2.5 bg-primary/5 border-none rounded-xl text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
                <PullToRefresh onRefresh={fetchData}>
                    <div className="max-w-[1600px] mx-auto p-6 space-y-8">
                        
                        {/* Tab Switcher */}
                        <div className="flex bg-white/50 p-1 rounded-2xl border border-primary/5 self-start w-fit">
                            <button 
                                onClick={() => setActiveTab('items')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'items' ? 'bg-white text-primary shadow-sm' : 'text-primary-light/40'}`}
                            >
                                库存清单
                            </button>
                            <button 
                                onClick={() => setActiveTab('logs')}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'logs' ? 'bg-white text-primary shadow-sm' : 'text-primary-light/40'}`}
                            >
                                最近变动
                            </button>
                        </div>

                        {activeTab === 'items' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {isLoading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="bg-white rounded-[28px] h-48 animate-pulse border border-primary/5" />
                                    ))
                                ) : filteredItems.length === 0 ? (
                                    <div className="col-span-full py-20 text-center">
                                        <span className="material-icons-round text-5xl text-primary/5">inventory_2</span>
                                        <p className="text-[10px] font-black text-primary-light/40 uppercase tracking-widest mt-4">No items matched your search</p>
                                    </div>
                                ) : (
                                    filteredItems.map(item => {
                                        const isLow = item.stock_quantity <= item.min_threshold;
                                        const isOver = item.max_threshold > 0 && item.stock_quantity > item.max_threshold;
                                        return (
                                            <div key={item.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-primary/5 relative overflow-hidden group">
                                                {/* Left accent */}
                                                <div className={`absolute top-0 left-0 w-2 h-full ${isLow ? 'bg-red-500' : isOver ? 'bg-amber-500' : 'bg-primary/10'}`} />
                                                
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-[9px] font-black text-primary/30 font-mono tracking-tighter uppercase">{item.code}</span>
                                                            <span className="text-[8px] font-black px-2 py-0.5 bg-primary/5 text-primary/60 rounded-full uppercase tracking-tight">{item.category || 'General'}</span>
                                                        </div>
                                                        <h3 className="text-sm font-black text-primary leading-tight">{item.name}</h3>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => openEditModal(item)}
                                                            className="w-8 h-8 rounded-full bg-primary/5 text-primary/40 flex items-center justify-center active:scale-90 transition-transform"
                                                        >
                                                            <span className="material-icons-round text-sm">edit</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteItem(item.id)}
                                                            className="w-8 h-8 rounded-full bg-red-50 text-red-400 flex items-center justify-center active:scale-90 transition-transform"
                                                        >
                                                            <span className="material-icons-round text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 mb-6">
                                                    <div className={`p-4 rounded-2xl flex flex-col ${isLow ? 'bg-red-50/50' : isOver ? 'bg-amber-50/50' : 'bg-background-beige/50'}`}>
                                                        <span className="text-[7px] font-black text-primary-light/40 uppercase tracking-widest mb-1">Stock Level</span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className={`text-xl font-black ${isLow ? 'text-red-600' : isOver ? 'text-amber-600' : 'text-primary'}`}>{item.stock_quantity}</span>
                                                            <span className="text-[9px] font-bold text-primary-light/40">{item.unit}</span>
                                                        </div>
                                                        {(isLow || isOver) && (
                                                            <span className={`text-[7px] font-black uppercase mt-1 ${isLow ? 'text-red-500' : 'text-amber-500'}`}>
                                                                {isLow ? 'Low Stock Alert' : 'Over Stock Warning'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="p-4 rounded-2xl bg-background-beige/50 flex flex-col">
                                                        <span className="text-[7px] font-black text-primary-light/40 uppercase tracking-widest mb-1">Unit Price</span>
                                                        <div className="flex items-baseline gap-0.5">
                                                            <span className="text-xs font-bold text-primary-light/60">RM</span>
                                                            <span className="text-lg font-black text-primary">{item.unit_price.toFixed(2)}</span>
                                                        </div>
                                                        <span className="text-[7px] font-black text-emerald-600 uppercase mt-1">Value: RM{(item.stock_quantity * item.unit_price).toFixed(0)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => openAdjustModal(item, 'IN')}
                                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-primary/20"
                                                    >
                                                        <span className="material-icons-round text-sm">add_circle</span>
                                                        入库
                                                    </button>
                                                    <button 
                                                        onClick={() => openAdjustModal(item, 'OUT')}
                                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border-2 border-primary/10 text-primary rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                                                    >
                                                        <span className="material-icons-round text-sm">remove_circle</span>
                                                        出库
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {isLoading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} className="h-20 bg-white rounded-3xl animate-pulse" />
                                    ))
                                ) : logs.length === 0 ? (
                                    <div className="py-20 text-center">
                                        <p className="text-[10px] font-black text-primary-light/40 uppercase tracking-widest">No activity logs recorded</p>
                                    </div>
                                ) : (
                                    logs.map(log => (
                                        <div key={log.id} className="bg-white rounded-[24px] p-4 flex items-center gap-4 border border-primary/5 shadow-sm">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                                log.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : 
                                                log.type === 'OUT' ? 'bg-red-50 text-red-600' : 'bg-primary/5 text-primary/60'
                                            }`}>
                                                <span className="material-icons-round text-xl">
                                                    {log.type === 'IN' ? 'arrow_downward' : log.type === 'OUT' ? 'arrow_upward' : 'sync_alt'}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="text-[13px] font-black text-primary truncate leading-tight">
                                                        {(log as any).inventory_items?.name || items.find(i => i.id === log.item_id)?.name || '未知物项'}
                                                    </h4>
                                                    <span className="text-[8px] font-bold text-primary-light/30 whitespace-nowrap ml-2">
                                                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-[9px] font-bold text-primary-light/40 mt-0.5 truncate uppercase tracking-tight">{log.remark || 'SYSTEM ADJUSTMENT'}</p>
                                            </div>
                                            <div className={`text-base font-black tabular-nums ${log.type === 'IN' ? 'text-emerald-600' : log.type === 'OUT' ? 'text-red-600' : 'text-primary'}`}>
                                                {log.type === 'IN' ? '+' : log.type === 'OUT' ? '-' : ''}{log.quantity}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </PullToRefresh>
            </main>

            {/* ITEM MODAL */}
            {showItemModal && (
                <div className="fixed inset-0 z-[100] flex items-end">
                    <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm" onClick={() => setShowItemModal(false)} />
                    <div className="relative w-full bg-white rounded-t-[40px] p-8 max-h-[90vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-500">
                        <div className="w-12 h-1.5 bg-primary/5 rounded-full mx-auto mb-6" />
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-xl font-black text-primary tracking-tight uppercase italic">{selectedItem ? 'Edit Item' : 'New Inventory Item'}</h2>
                            <button onClick={() => setShowItemModal(false)} className="w-10 h-10 rounded-full bg-primary/5 text-primary/40 flex items-center justify-center">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Code</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-background-beige/50 rounded-2xl text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20 uppercase"
                                        value={formData.code}
                                        onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                                        placeholder="RICE-01"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Category</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-background-beige/50 rounded-2xl text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20"
                                        value={formData.category}
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                        placeholder="Mains"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Item Name</label>
                                <input 
                                    className="w-full px-4 py-4 bg-background-beige/50 rounded-2xl text-sm font-black text-primary focus:ring-1 focus:ring-primary/20"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="Full product name..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Unit</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-background-beige/50 rounded-2xl text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20"
                                        value={formData.unit}
                                        onChange={e => setFormData({...formData, unit: e.target.value})}
                                        placeholder="kg / pcs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Unit Price (RM)</label>
                                    <input 
                                        type="number"
                                        className="w-full px-4 py-3 bg-background-beige/50 rounded-2xl text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20"
                                        value={formData.unit_price}
                                        onChange={e => setFormData({...formData, unit_price: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Min Threshold</label>
                                    <input 
                                        type="number"
                                        className="w-full px-4 py-3 bg-red-50/30 rounded-2xl text-xs font-bold text-red-600 focus:ring-1 focus:ring-red-500/20"
                                        value={formData.min_threshold}
                                        onChange={e => setFormData({...formData, min_threshold: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-primary/40 uppercase tracking-widest ml-1">Max Threshold</label>
                                    <input 
                                        type="number"
                                        className="w-full px-4 py-3 bg-amber-50/30 rounded-2xl text-xs font-bold text-amber-600 focus:ring-1 focus:ring-amber-500/20"
                                        value={formData.max_threshold}
                                        onChange={e => setFormData({...formData, max_threshold: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={handleSaveItem}
                                className="w-full py-5 bg-primary text-white rounded-[24px] font-black text-base uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all mt-4"
                            >
                                Save Inventory Info
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADJUSTMENT MODAL */}
            {showAdjustModal && selectedItem && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-primary/40 backdrop-blur-md" onClick={() => setShowAdjustModal(false)} />
                    <div className="relative w-full max-w-sm bg-white rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="text-center mb-8">
                            <div className={`w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center ${
                                adjustType === 'IN' ? 'bg-emerald-50 text-emerald-600' : 
                                adjustType === 'OUT' ? 'bg-red-50 text-red-600' : 'bg-primary/5 text-primary'
                            }`}>
                                <span className="material-icons-round text-3xl">
                                    {adjustType === 'IN' ? 'add_circle' : adjustType === 'OUT' ? 'remove_circle' : 'sync'}
                                </span>
                            </div>
                            <h2 className="text-2xl font-black text-red-900 tracking-tight mb-1">
                                {adjustType === 'IN' ? '库存入库' : adjustType === 'OUT' ? '库存出库' : '库存校准'}
                            </h2>
                            <p className="text-[11px] font-black text-red-900/40 uppercase tracking-widest">{selectedItem.name}</p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2 text-center">
                                <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">QUANTITY ({selectedItem.unit})</label>
                                <div className="relative">
                                    <input 
                                        type="number"
                                        autoFocus
                                        className="w-full px-6 py-6 bg-amber-50/80 rounded-[2.5rem] text-5xl font-black text-red-900 text-center focus:ring-2 focus:ring-amber-200 border-2 border-slate-900 shadow-inner"
                                        value={adjustData.quantity}
                                        onChange={e => setAdjustData({...adjustData, quantity: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1">REMARK</label>
                                <input 
                                    className="w-full px-5 py-4 bg-amber-50/50 rounded-2xl text-sm font-black text-slate-700 focus:ring-1 focus:ring-amber-200 border-none"
                                    placeholder="e.g. Monthly Restock"
                                    value={adjustData.remark}
                                    onChange={e => setAdjustData({...adjustData, remark: e.target.value})}
                                />
                            </div>

                            <button 
                                onClick={handleAdjustStock}
                                className={`w-full py-5 rounded-[24px] font-black text-base uppercase tracking-widest shadow-xl transition-all active:scale-95 ${
                                    adjustType === 'IN' ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 
                                    adjustType === 'OUT' ? 'bg-red-600 text-white shadow-red-500/20' : 
                                    'bg-primary text-white shadow-primary/20'
                                }`}
                            >
                                CONFIRM ADJUSTMENT
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryManagement;
