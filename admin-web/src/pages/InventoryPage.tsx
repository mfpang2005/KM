import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { InventoryItem, InventoryLog } from '../types';

export const InventoryPage: React.FC = () => {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [logs, setLogs] = useState<InventoryLog[]>([]);
    const [loading, setLoading] = useState(true);
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

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [itemsRes, logsRes] = await Promise.all([
                api.get('/inventory/items'),
                api.get('/inventory/logs')
            ]);
            setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
            setLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
        } catch (err) {
            console.error('Failed to fetch inventory data:', err);
        } finally {
            setLoading(false);
        }
    };

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

    const handleSaveItem = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (selectedItem) {
                await api.put(`/inventory/items/${selectedItem.id}`, formData);
            } else {
                await api.post('/inventory/items', formData);
            }
            setShowItemModal(false);
            setSelectedItem(null);
            fetchData();
        } catch (err) {
            console.error('Failed to save item:', err);
            alert('Failed to save item');
        }
    };

    const handleAdjustStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        
        try {
            await api.post('/inventory/adjust', {
                item_id: selectedItem.id,
                type: adjustType,
                quantity: adjustData.quantity,
                remark: adjustData.remark
            });
            setShowAdjustModal(false);
            setSelectedItem(null);
            fetchData();
        } catch (err) {
            console.error('Failed to adjust stock:', err);
            alert('Failed to adjust stock');
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this item? This will also delete all associated logs.')) return;
        try {
            await api.delete(`/inventory/items/${id}`);
            fetchData();
        } catch (err) {
            console.error('Failed to delete item:', err);
            alert('Failed to delete item');
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
        <div className="p-6 space-y-8 max-w-[1600px] mx-auto mt-10">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Stock Inventory</h1>
                    <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">Management & Real-time Tracking</p>
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                    <span className="material-icons-round text-[20px]">add</span>
                    NEW INVENTORY ITEM
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <span className="material-icons-round text-3xl">payments</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Inventory Value</p>
                        <h3 className="text-2xl font-black text-slate-900">RM {stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
                    </div>
                </div>
                <div className={`bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-5 ${stats.lowStock > 0 ? 'ring-2 ring-red-100' : ''}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stats.lowStock > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                        <span className="material-icons-round text-3xl">trending_down</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Stock Items</p>
                        <h3 className={`text-2xl font-black ${stats.lowStock > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.lowStock} Items</h3>
                    </div>
                </div>
                <div className={`bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-5 ${stats.overStock > 0 ? 'ring-2 ring-amber-100' : ''}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stats.overStock > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                        <span className="material-icons-round text-3xl">inventory_2</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Over Stock Warning</p>
                        <h3 className={`text-2xl font-black ${stats.overStock > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{stats.overStock} Items</h3>
                    </div>
                </div>
            </div>

            {/* Table Controls */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center flex-1 min-w-[300px]">
                        <div className="relative flex-1">
                            <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                            <input 
                                type="text" 
                                placeholder="Search by name or code..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                            />
                        </div>
                        <select 
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-6 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse">
                        <thead>
                            <tr className="text-[11px] font-black text-slate-900 uppercase tracking-widest bg-slate-50/80">
                                <th className="px-5 py-5 border-b border-slate-100">Code</th>
                                <th className="px-5 py-5 border-b border-slate-100">Item Name</th>
                                <th className="px-5 py-5 border-b border-slate-100">Category</th>
                                <th className="px-5 py-5 border-b border-slate-100">Unit Price</th>
                                <th className="px-5 py-5 border-b border-slate-100">Stock</th>
                                <th className="px-5 py-5 border-b border-slate-100">Threshold (Min/Max)</th>
                                <th className="px-5 py-5 border-b border-slate-100">Total Value</th>
                                <th className="px-5 py-5 border-b border-slate-100">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50">
                            {filteredItems.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={8} className="py-20 text-slate-400 font-bold">No inventory items found. Add your first item above!</td>
                                </tr>
                            )}
                            {filteredItems.map(item => {
                                const isLow = item.stock_quantity <= item.min_threshold;
                                const isOver = item.max_threshold > 0 && item.stock_quantity > item.max_threshold;
                                
                                return (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-5 py-4 font-mono text-[12px] font-bold text-indigo-600">{item.code}</td>
                                        <td className="px-5 py-4">
                                            <p className="text-[13px] font-bold text-slate-800 tracking-tight">{item.name}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider">{item.category || 'General'}</span>
                                        </td>
                                        <td className="px-5 py-4 font-bold text-slate-600 text-[12px]">RM {item.unit_price.toFixed(2)}</td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col items-center">
                                                <span className={`text-sm font-black ${isLow ? 'text-red-600' : isOver ? 'text-amber-600' : 'text-slate-900'}`}>
                                                    {item.stock_quantity} <span className="text-[10px] text-slate-400 font-bold ml-0.5">{item.unit}</span>
                                                </span>
                                                {isLow && <span className="text-[8px] font-black text-red-500 uppercase mt-0.5">Low Stock</span>}
                                                {isOver && <span className="text-[8px] font-black text-amber-500 uppercase mt-0.5">Over Stock</span>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-[11px] font-bold text-slate-400">
                                            {item.min_threshold} / {item.max_threshold || '∞'}
                                        </td>
                                        <td className="px-5 py-4 font-bold text-emerald-600 text-[12px]">RM {(item.stock_quantity * item.unit_price).toFixed(2)}</td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button 
                                                    onClick={() => openAdjustModal(item, 'IN')}
                                                    className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                                    title="Stock In"
                                                >
                                                    <span className="material-icons-round text-sm">add_circle</span>
                                                </button>
                                                <button 
                                                    onClick={() => openAdjustModal(item, 'OUT')}
                                                    className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                    title="Stock Out"
                                                >
                                                    <span className="material-icons-round text-sm">remove_circle</span>
                                                </button>
                                                <button 
                                                    onClick={() => openEditModal(item)}
                                                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white transition-all"
                                                    title="Edit Details"
                                                >
                                                    <span className="material-icons-round text-sm">edit</span>
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    className="p-2 rounded-xl bg-slate-100 text-slate-400 hover:bg-red-600 hover:text-white transition-all"
                                                    title="Delete Item"
                                                >
                                                    <span className="material-icons-round text-sm">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent Logs Section */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-8">
                <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <span className="material-icons-round text-indigo-500">history</span>
                    Recent Activity Logs
                </h2>
                <div className="space-y-4">
                    {logs.slice(0, 10).map(log => (
                        <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100/50">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                    log.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : 
                                    log.type === 'OUT' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
                                }`}>
                                    <span className="material-icons-round text-[20px]">
                                        {log.type === 'IN' ? 'arrow_downward' : log.type === 'OUT' ? 'arrow_upward' : 'sync_alt'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">
                                        {log.inventory_items?.name || 'Unknown Item'} 
                                        <span className="mx-2 text-slate-300">|</span>
                                        <span className={log.type === 'IN' ? 'text-emerald-600' : log.type === 'OUT' ? 'text-red-600' : 'text-indigo-600'}>
                                            {log.type === 'IN' ? '+' : log.type === 'OUT' ? '-' : ''}{log.quantity}
                                        </span>
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{log.remark || 'Manual Adjustment'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] font-black text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modals Implementation (Simplified for brevity, would be full Tailwind modals) */}
            {showItemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-slate-900">{selectedItem ? 'Edit Item' : 'New Item'}</h2>
                            <button onClick={() => setShowItemModal(false)} className="material-icons-round text-slate-300 hover:text-slate-600">close</button>
                        </div>
                        <form onSubmit={handleSaveItem} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Product Code</label>
                                    <input 
                                        required value={formData.code} 
                                        onChange={e => setFormData({...formData, code: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Item Name</label>
                                    <input 
                                        required value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Category</label>
                                    <input 
                                        list="category-options"
                                        value={formData.category} 
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                        placeholder="Type or select category..."
                                    />
                                    <datalist id="category-options">
                                        {categories.filter(c => c !== 'ALL').map(cat => (
                                            <option key={cat} value={cat} />
                                        ))}
                                    </datalist>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Unit (e.g. kg, box)</label>
                                    <input 
                                        value={formData.unit} 
                                        onChange={e => setFormData({...formData, unit: e.target.value})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Price (RM)</label>
                                    <input 
                                        type="number" step="0.01" value={formData.unit_price} 
                                        onChange={e => setFormData({...formData, unit_price: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Min Qty</label>
                                    <input 
                                        type="number" value={formData.min_threshold} 
                                        onChange={e => setFormData({...formData, min_threshold: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Max Qty</label>
                                    <input 
                                        type="number" value={formData.max_threshold} 
                                        onChange={e => setFormData({...formData, max_threshold: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    />
                                </div>
                            </div>
                            <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 mt-4 hover:bg-indigo-700 transition-all active:scale-95">
                                SAVE ITEM DETAILS
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showAdjustModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-2xl font-black text-slate-900">
                                {adjustType === 'IN' ? 'Stock In' : adjustType === 'OUT' ? 'Stock Out' : 'Set Inventory'}
                            </h2>
                            <button onClick={() => setShowAdjustModal(false)} className="material-icons-round text-slate-300 hover:text-slate-600">close</button>
                        </div>
                        <p className="text-sm font-bold text-slate-400 mb-6">{selectedItem?.name} ({selectedItem?.code})</p>
                        
                        <form onSubmit={handleAdjustStock} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Quantity ({selectedItem?.unit})</label>
                                <input 
                                    type="number" required autoFocus
                                    value={adjustData.quantity} 
                                    onChange={e => setAdjustData({...adjustData, quantity: parseFloat(e.target.value)})}
                                    className="w-full px-4 py-4 bg-slate-100 rounded-2xl text-lg font-black border-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Remark / Reason</label>
                                <input 
                                    value={adjustData.remark} 
                                    onChange={e => setAdjustData({...adjustData, remark: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold border-none"
                                    placeholder="e.g. Monthly Supplier Delivery"
                                />
                            </div>
                            
                            {/* Overstock Warning */}
                            {adjustType === 'IN' && selectedItem?.max_threshold && (selectedItem.stock_quantity + adjustData.quantity > selectedItem.max_threshold) && (
                                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                                    <span className="material-icons-round text-amber-500 text-sm">warning</span>
                                    <p className="text-[11px] font-bold text-amber-800 leading-tight">
                                        Warning: Adding this quantity will exceed the maximum threshold of {selectedItem.max_threshold} {selectedItem.unit}.
                                    </p>
                                </div>
                            )}

                            <button type="submit" className={`w-full py-4 rounded-2xl font-black text-sm shadow-xl mt-4 transition-all active:scale-95 ${
                                adjustType === 'IN' ? 'bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700' :
                                adjustType === 'OUT' ? 'bg-red-600 text-white shadow-red-100 hover:bg-red-700' :
                                'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'
                            }`}>
                                CONFIRM ADJUSTMENT
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
