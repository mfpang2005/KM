
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order, OrderStatus, OrderItem, PaymentMethod } from '../types';

// Mock products for the edit item selector and code matching
const MOCK_PRODUCTS = [
    { id: '1', code: 'ML-001', name: 'Nasi Lemak Special', price: 12.00 },
    { id: '2', code: 'ST-002', name: 'Chicken Satay (10)', price: 15.00 },
    { id: '3', code: 'DR-003', name: 'Teh Tarik', price: 3.50 },
    { id: '4', code: 'ML-004', name: 'Mee Goreng Mamak', price: 10.50 },
];

// Mock drivers for assignment
const MOCK_DRIVERS = [
    { id: 'ali', name: 'Ali Ahmad', status: '可选', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCr1A0UkYD47bPyjINVhOMMiB-pdO6Vk9GkIst7TGBPcENh6mor-beIE0m-zai1jb8ISvg0dfAHur75hz38kljvdLDYDhZL-2ExznnuKSVz_DC0ZJEAL2uTdFO5HUVg3AYRyECUgerFv4RSqf8DUrKNHpID4Dd5JhD0TnTCZbd2A9ZDW4MCHQT65EjZTHjvSdZf_OqT0CAh_1IQOS7JVmm59EG9tT5QDfeexTdpUkUFKHXXnZwE66rkmWOuJ0Q7WWSPtN1nUcxBxRf' },
    { id: 'tan', name: 'Tan Wei', status: '附近', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDLlyYiZxjedNYrM_16MJem_-z8phukD8Y0feARWqrmek1SnFPW4HVi7sm7VddsZtD-UU756Kogt_EUqpzfEUqXDDKMI3s2g6IxxLz3NBeqHkMSSCG0Cf-z3HYu02DWkNOFWb-bA9YVclQyaW35kBs0WTXA2ImEqpPqbRazqVCsx-z2c2OHILM7zBpNigWz9_gIcnizGf9SOcVa0elsIXsnl6J_ZOWF6G9MeORyCWaoUvIAua6w0WMg-Z4HRcPizWY5q-0CMfhjjIz8' }
];

const INITIAL_ORDERS: Order[] = [
    { id: 'KL-468167', customerName: 'Alice Wong', customerPhone: '012-3456789', address: 'KL Sentral, Kuala Lumpur', items: [{ id: '1', name: 'Nasi Lemak Special', quantity: 20 }], status: OrderStatus.DELIVERING, amount: 240.00, dueTime: '12:30 PM', type: 'delivery', driverId: 'ali', paymentMethod: PaymentMethod.CASH },
    { id: 'KL-468168', customerName: 'Penang Conf', customerPhone: '019-8765432', address: 'Bangsar South', items: [{ id: '2', name: 'Chicken Satay (10)', quantity: 5 }], status: OrderStatus.PREPARING, amount: 75.00, dueTime: '01:00 PM', type: 'delivery', paymentMethod: PaymentMethod.BANK_TRANSFER },
    { id: 'KL-468169', customerName: 'John Doe', customerPhone: '017-2233445', address: 'Taman Melawati', items: [{ id: '1', name: 'Nasi Lemak Special', quantity: 2 }], status: OrderStatus.COMPLETED, amount: 24.00, dueTime: '11:00 AM', type: 'delivery', driverId: 'tan', paymentMethod: PaymentMethod.EWALLET },
];

import { OrderService } from '../src/services/api';
import { getGoogleMapsUrl } from '../src/utils/maps';

const OrderManagement: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadOrders();
        const timer = setInterval(loadOrders, 10000);
        return () => clearInterval(timer);
    }, []);

    const loadOrders = async () => {
        try {
            setIsLoading(true);
            const data = await OrderService.getAll();
            setOrders(data);
        } catch (error) {
            console.error("Failed to load orders", error);
            // Fallback to initial mock data if backend fails/empty for demo purposes
            // setOrders(INITIAL_ORDERS); 
        } finally {
            setIsLoading(false);
        }
    };
    const [tab, setTab] = useState<OrderStatus | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

    // Deletion states
    const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

    // Detailed Edit state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [scanCode, setScanCode] = useState('');
    const [scanError, setScanError] = useState(false);

    const statusColors: Record<OrderStatus, string> = {
        [OrderStatus.PENDING]: 'text-slate-500 bg-slate-100',
        [OrderStatus.PREPARING]: 'text-blue-600 bg-blue-50',
        [OrderStatus.READY]: 'text-purple-600 bg-purple-50',
        [OrderStatus.DELIVERING]: 'text-orange-600 bg-orange-100/50',
        [OrderStatus.COMPLETED]: 'text-green-600 bg-green-50',
    };

    const statusLabels: Record<OrderStatus, string> = {
        [OrderStatus.PENDING]: '待处理',
        [OrderStatus.PREPARING]: '准备中',
        [OrderStatus.READY]: '待取餐',
        [OrderStatus.DELIVERING]: '配送中',
        [OrderStatus.COMPLETED]: '已完成',
    };

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const matchesTab = tab === 'all' || order.status === tab;
            const matchesSearch =
                order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.id.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [orders, tab, searchQuery]);

    const handleDownloadPDF = (order: Order) => {
        const originalTitle = document.title;
        document.title = `Order_${order.id} `;
        setPrintingOrder(order);
        setTimeout(() => {
            window.print();
            document.title = originalTitle;
            setPrintingOrder(null);
        }, 100);
    };

    const handleUpdateStatus = async (id: string, newStatus: OrderStatus) => {
        try {
            await OrderService.updateStatus(id, newStatus);
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
        } catch (error) {
            console.error("Failed to update status", error);
            alert("更新状态失败");
        }
    };

    const handleDeleteOrder = async (id: string) => {
        try {
            await OrderService.delete(id);
            setOrders(prev => prev.filter(o => o.id !== id));
            setOrderToDelete(null);
        } catch (error) {
            console.error("Failed to delete order", error);
            alert("Failed to delete order");
        }
    };

    const handleOpenEdit = (order: Order) => {
        setEditingOrder({ ...order, items: [...order.items.map(item => ({ ...item }))] });
        setScanCode('');
        setScanError(false);
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingOrder) return;
        try {
            // For simplicity, we are sending the whole object as OrderCreate. 
            // In real app, we might want separate update types.
            // Also handling the case where backend expects specific fields.
            await OrderService.update(editingOrder.id, editingOrder);

            const updatedOrders = orders.map(o => o.id === editingOrder.id ? editingOrder : o);
            setOrders(updatedOrders);
            setIsEditModalOpen(false);
            setEditingOrder(null);
        } catch (error) {
            console.error("Failed to update order", error);
            alert("Failed to update order");
        }
    };

    const updateEditItemQty = (id: string, delta: number) => {
        if (!editingOrder) return;
        const newItems = editingOrder.items.map(item => {
            if (item.id === id) {
                return { ...item, quantity: Math.max(1, item.quantity + delta) };
            }
            return item;
        });
        setEditingOrder({ ...editingOrder, items: newItems });
    };

    const removeEditItem = (id: string) => {
        if (!editingOrder) return;
        const newItems = editingOrder.items.filter(item => item.id !== id);
        setEditingOrder({ ...editingOrder, items: newItems });
    };

    const addEditItemByProduct = (product: typeof MOCK_PRODUCTS[0]) => {
        if (!editingOrder) return;
        const existing = editingOrder.items.find(i => i.id === product.id);
        if (existing) {
            updateEditItemQty(product.id, 1);
        } else {
            setEditingOrder({
                ...editingOrder,
                items: [...editingOrder.items, { id: product.id, name: product.name, quantity: 1 }]
            });
        }
    };

    const handleAddByCode = () => {
        if (!scanCode.trim()) return;
        const product = MOCK_PRODUCTS.find(p => p.code.toLowerCase() === scanCode.trim().toLowerCase());
        if (product) {
            addEditItemByProduct(product);
            setScanCode('');
            setScanError(false);
        } else {
            setScanError(true);
            setTimeout(() => setScanError(false), 500);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f6f6] relative">
            {/* Print Template */}
            {printingOrder && (
                <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8">
                    <div className="max-w-xl mx-auto border border-slate-200 p-8 space-y-6">
                        <div className="flex justify-between items-start border-b pb-6">
                            <div>
                                <h1 className="text-2xl font-black text-slate-900">金龙餐饮订单</h1>
                                <p className="text-xs text-slate-400 uppercase tracking-widest">OFFICIAL RECEIPT</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-900">{printingOrder.id}</p>
                                <p className="text-[10px] text-slate-400">{new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-bold text-slate-800">客户: {printingOrder.customerName}</p>
                            <p className="text-xs text-slate-600">电话: {printingOrder.customerPhone}</p>
                            <p className="text-xs text-slate-600 leading-relaxed">地址: {printingOrder.address}</p>
                        </div>
                        <div className="border-y border-slate-100 py-4">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">项目清单</h4>
                            {printingOrder.items.map((item, i) => (
                                <div key={i} className="flex justify-between text-xs py-1">
                                    <span className="text-slate-800">{item.name} x {item.quantity}</span>
                                    <span className="font-bold text-slate-900">RM {(item.quantity * 15).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between items-center pt-4">
                            <span className="text-sm font-bold text-slate-800">合计金额:</span>
                            <span className="text-xl font-black text-primary">RM {printingOrder.amount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="pt-12 pb-4 px-6 bg-white flex flex-col gap-4 sticky top-0 z-30 no-print shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="text-slate-400 p-1 active:scale-90 transition-transform">
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold text-slate-900">订单管理</h1>
                </div>

                <div className="relative">
                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[18px]">search</span>
                    <input
                        type="text"
                        className="w-full pl-10 pr-4 py-2 bg-[#f1f3f5] border-none rounded-full text-xs font-medium focus:ring-1 focus:ring-primary/20 placeholder:text-slate-300"
                        placeholder="搜索订单 (姓名或编号)"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-white px-4 flex gap-6 border-b border-slate-50 overflow-x-auto no-scrollbar sticky top-[132px] z-20 no-print shadow-sm">
                {['all', ...Object.values(OrderStatus)].map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t as any)}
                        className={`py - 3 px - 1 text - [11px] font - bold whitespace - nowrap border - b - 2 transition - all relative ${tab === t ? 'text-primary' : 'border-transparent text-slate-400'
                            } `}
                    >
                        {t === 'all' ? '全部订单' : statusLabels[t as OrderStatus]}
                        {tab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary animate-in fade-in duration-300"></div>}
                    </button>
                ))}
            </div>

            {/* List */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-32 no-print">
                {filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-200">
                        <span className="material-icons-round text-6xl">receipt_long</span>
                        <p className="text-sm font-bold mt-2">暂无订单</p>
                    </div>
                ) : (
                    filteredOrders.map(order => (
                        <div
                            key={order.id}
                            className="bg-white p-5 rounded-[32px] shadow-sm flex flex-col gap-4 animate-in fade-in duration-300 border border-slate-100/50"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-[17px] font-black text-slate-900">{order.customerName}</h3>
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">{order.id}</p>
                                    <div className="flex items-center gap-1 mt-1.5">
                                        <span className="material-icons-round text-[12px] text-slate-300">place</span>
                                        <a
                                            href={getGoogleMapsUrl(order.address)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] font-bold text-slate-500 hover:text-blue-600 hover:underline truncate max-w-[220px]"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {order.address}
                                        </a>
                                    </div>
                                </div>
                                <span className={`text - [10px] font - black uppercase px - 2.5 py - 1 rounded - lg ${statusColors[order.status]} `}>
                                    {statusLabels[order.status]}
                                </span>
                            </div>

                            <div className="bg-[#f1f3f5]/60 p-5 rounded-[24px] space-y-3">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-[13px] font-bold text-slate-700">
                                        <span>{item.name}</span>
                                        <span className="text-slate-400 font-black">x{item.quantity}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-between mt-1">
                                <div className="flex flex-col">
                                    <span className="text-2xl font-black text-primary leading-none tracking-tight">RM {order.amount.toFixed(2)}</span>
                                    {order.driverId && (
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <span className="material-icons-round text-[12px] text-slate-300">local_shipping</span>
                                            <span className="text-[10px] font-bold text-slate-400">{MOCK_DRIVERS.find(d => d.id === order.driverId)?.name}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2.5">
                                    {order.status === OrderStatus.PENDING && (
                                        <button
                                            onClick={() => handleUpdateStatus(order.id, OrderStatus.PREPARING)}
                                            className="px-4 h-10 bg-primary text-white rounded-full flex items-center justify-center text-[11px] font-black active:scale-90 transition-transform shadow-md gap-1"
                                        >
                                            <span className="material-icons-round text-sm">check_circle</span>
                                            确认并制作
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleOpenEdit(order)}
                                        className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform shadow-sm"
                                    >
                                        <span className="material-icons-round text-[18px]">edit</span>
                                    </button>
                                    <button
                                        onClick={() => handleDownloadPDF(order)}
                                        className="w-10 h-10 bg-red-50 border border-red-100 rounded-full flex items-center justify-center text-primary active:scale-90 transition-transform shadow-sm"
                                    >
                                        <span className="material-icons-round text-[18px]">picture_as_pdf</span>
                                    </button>
                                    <button
                                        onClick={() => setOrderToDelete(order.id)}
                                        className="w-10 h-10 bg-white border border-slate-100 rounded-full flex items-center justify-center text-red-500 active:scale-90 transition-transform shadow-sm"
                                    >
                                        <span className="material-icons-round text-[18px]">delete_outline</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </main>

            {/* Confirm Deletion Popup */}
            {orderToDelete && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 no-print">
                    <div className="bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-in zoom-in duration-200">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons-round text-red-500 text-3xl">delete_forever</span>
                        </div>
                        <h2 className="text-lg font-black text-slate-900 text-center mb-2">确认移除订单？</h2>
                        <p className="text-xs text-slate-400 text-center mb-6">此操作将永久删除订单 {orderToDelete}，无法恢复。</p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleDeleteOrder(orderToDelete)}
                                className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-200 active:scale-95 transition-all"
                            >
                                确认移除
                            </button>
                            <button
                                onClick={() => setOrderToDelete(null)}
                                className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold text-sm active:bg-slate-200 transition-all"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comprehensive Edit Modal */}
            {isEditModalOpen && editingOrder && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end justify-center no-print">
                    <div className="bg-white w-full max-w-md h-[92vh] rounded-t-[40px] flex flex-col animate-in slide-in-from-bottom duration-300 shadow-2xl">
                        <header className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-50 flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-black text-slate-900">修改订单详情</h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{editingOrder.id}</p>
                            </div>
                            <button onClick={() => setIsEditModalOpen(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 active:scale-90">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>

                        <main className="flex-1 overflow-y-auto px-8 py-6 space-y-8 no-scrollbar">
                            {/* Section: Payment Method Selection (NEW - as requested) */}
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">付款方式选项 (PAYMENT)</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { id: PaymentMethod.CASH, label: 'CASH', icon: 'payments' },
                                        { id: PaymentMethod.BANK_TRANSFER, label: 'BANK TRANSFER', icon: 'account_balance' },
                                        { id: PaymentMethod.EWALLET, label: 'EWALLET', icon: 'account_balance_wallet' },
                                        { id: PaymentMethod.CHEQUE, label: 'CHEQUE', icon: 'description' }
                                    ].map((pm) => (
                                        <button
                                            key={pm.id}
                                            onClick={() => setEditingOrder({ ...editingOrder, paymentMethod: pm.id })}
                                            className={`flex items - center gap - 2.5 p - 3.5 rounded - 2xl border transition - all ${editingOrder.paymentMethod === pm.id
                                                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                                                : 'bg-slate-50 border-slate-100 text-slate-500'
                                                } `}
                                        >
                                            <span className="material-icons-round text-sm">{pm.icon}</span>
                                            <span className="text-[10px] font-black uppercase tracking-tight">{pm.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">顾客基本资料</h3>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 ml-1">姓名</label>
                                        <input
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:bg-white transition-colors"
                                            value={editingOrder.customerName}
                                            onChange={e => setEditingOrder({ ...editingOrder, customerName: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 ml-1">联系电话</label>
                                        <input
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:bg-white transition-colors"
                                            value={editingOrder.customerPhone}
                                            onChange={e => setEditingOrder({ ...editingOrder, customerPhone: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 ml-1">配送地址</label>
                                        <textarea
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm min-h-[80px] focus:bg-white transition-colors"
                                            value={editingOrder.address}
                                            onChange={e => setEditingOrder({ ...editingOrder, address: e.target.value })}
                                        />
                                        <div className="flex justify-end mt-1">
                                            <a
                                                href={getGoogleMapsUrl(editingOrder.address)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-bold text-blue-500 flex items-center gap-0.5 hover:underline"
                                            >
                                                <span className="material-icons-round text-[10px]">open_in_new</span>
                                                在地图中查看
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">指派/修改配送员</h3>
                                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                    {MOCK_DRIVERS.map((driver) => (
                                        <button
                                            key={driver.id}
                                            onClick={() => setEditingOrder({ ...editingOrder, driverId: driver.id })}
                                            className={`min - w - [120px] p - 3 rounded - [24px] border transition - all flex flex - col items - center gap - 2 ${editingOrder.driverId === driver.id
                                                ? 'bg-primary/5 border-primary shadow-md'
                                                : 'bg-slate-50 border-slate-100 shadow-sm'
                                                } `}
                                        >
                                            <div className="relative">
                                                <img src={driver.img} className="w-12 h-12 rounded-full border-2 border-white shadow-sm object-cover" alt={driver.name} />
                                                {editingOrder.driverId === driver.id && (
                                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-in zoom-in">
                                                        <span className="material-icons-round text-white text-[12px]">check</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] font-bold text-slate-800 leading-tight">{driver.name}</p>
                                                <span className="text-[8px] font-black text-slate-400 uppercase">{driver.status}</span>
                                            </div>
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setEditingOrder({ ...editingOrder, driverId: undefined })}
                                        className={`min - w - [120px] p - 3 rounded - [24px] border transition - all flex flex - col items - center justify - center gap - 2 ${!editingOrder.driverId
                                            ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                                            : 'bg-slate-50 border-slate-100 text-slate-400 shadow-sm'
                                            } `}
                                    >
                                        <span className="material-icons-round">person_off</span>
                                        <span className="text-[10px] font-bold">暂不指派</span>
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">订购项目管理 (扫码/编号)</h3>

                                <div className="space-y-3">
                                    <div className={`flex gap - 2 p - 1 bg - slate - 100 rounded - 2xl border - 2 transition - all ${scanError ? 'border-red-500 animate-pulse' : 'border-transparent'} `}>
                                        <div className="flex-1 relative">
                                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">qr_code_scanner</span>
                                            <input
                                                className="w-full pl-9 pr-4 py-3 bg-transparent border-none rounded-xl text-xs font-bold focus:ring-0"
                                                placeholder="输入编号或扫描条码 (如 ML-001)"
                                                value={scanCode}
                                                onChange={e => setScanCode(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddByCode()}
                                            />
                                        </div>
                                        <button
                                            onClick={handleAddByCode}
                                            className="px-6 bg-slate-800 text-white rounded-xl text-[11px] font-black active:scale-95 transition-transform"
                                        >
                                            添加
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3 mt-4">
                                    {editingOrder.items.map((item) => (
                                        <div key={item.id} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
                                            <div className="flex-1">
                                                <h4 className="text-xs font-bold text-slate-800">{item.name}</h4>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Code: {MOCK_PRODUCTS.find(p => p.id === item.id)?.code || item.id}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => updateEditItemQty(item.id, -1)}
                                                    className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 active:scale-90"
                                                >
                                                    <span className="material-icons-round text-sm">remove</span>
                                                </button>
                                                <span className="text-sm font-black w-6 text-center">{item.quantity}</span>
                                                <button
                                                    onClick={() => updateEditItemQty(item.id, 1)}
                                                    className="w-8 h-8 rounded-full bg-primary text-white shadow-sm flex items-center justify-center active:scale-90"
                                                >
                                                    <span className="material-icons-round text-sm">add</span>
                                                </button>
                                                <button
                                                    onClick={() => removeEditItem(item.id)}
                                                    className="ml-2 text-slate-300 hover:text-red-500 active:scale-90 transition-colors"
                                                >
                                                    <span className="material-icons-round text-[18px]">delete_outline</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-4 pb-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">订单状态流程</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.values(OrderStatus).map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => setEditingOrder({ ...editingOrder, status })}
                                            className={`py - 3 px - 4 rounded - xl text - [10px] font - black uppercase tracking - wider border transition - all ${editingOrder.status === status
                                                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105 z-10'
                                                : 'bg-white text-slate-400 border-slate-100'
                                                } `}
                                        >
                                            {statusLabels[status]}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        </main>

                        <footer className="p-8 border-t border-slate-50 flex-shrink-0 bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
                            <button
                                onClick={handleSaveEdit}
                                className="w-full py-5 bg-primary text-white rounded-2xl font-black text-lg shadow-2xl shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round">save</span>
                                保存订单信息
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* FAB */}
            <button
                onClick={() => navigate('/admin/create-order')}
                className="fixed bottom-8 right-6 w-16 h-16 bg-primary text-white rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform z-40 no-print"
            >
                <span className="material-icons-round text-[36px]">add</span>
            </button>
        </div>
    );
};

export default OrderManagement;