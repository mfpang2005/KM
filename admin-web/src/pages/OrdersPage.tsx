import React, { useState, useEffect, useCallback } from 'react';
import { api, SuperAdminService, ProductService } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, Product } from '../types';
import { OrderStatus, PaymentMethod } from '../types';

export const OrdersPage: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [drivers, setDrivers] = useState<any[]>([]);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Create Order Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [newOrder, setNewOrder] = useState({
        customerName: '',
        customerPhone: '',
        address: '',
        type: 'dine-in' as 'dine-in' | 'takeaway' | 'delivery',
        paymentMethod: PaymentMethod.CASH,
        items: [] as { product: Product, quantity: number }[]
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadOrders = useCallback(async () => {
        try {
            // NOTE: 直接读取 /orders 端点返回全部订单，与前端 App 共用同一数据源
            const response = await api.get(`/orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`);
            setOrders(response.data);
        } catch (error) {
            console.error('Failed to load orders', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const fetchDrivers = useCallback(async () => {
        try {
            const users = await api.get('/super-admin/users');
            setDrivers(users.data.filter((u: any) => u.role === 'driver'));
        } catch (error) {
            console.error('Failed to load drivers', error);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            const data = await ProductService.getAll();
            setProducts(data);
        } catch (error) {
            console.error('Failed to load products', error);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        loadOrders();
        fetchDrivers();
        fetchProducts();

        // NOTE: 使用 Supabase Realtime 替代 setInterval 轮询，实现 App 下单后 Admin 端即时柴新
        const channel = supabase
            .channel('orders-page-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    // 任意变更（INSERT/UPDATE/DELETE）都重新拉取最新订单列表
                    loadOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadOrders, fetchDrivers, fetchProducts]);

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newOrder.items.length === 0) {
            alert("Please add at least one item to the order.");
            return;
        }

        try {
            setIsSubmitting(true);
            const amount = newOrder.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

            await SuperAdminService.create({
                customerName: newOrder.customerName || 'Walk-in Customer',
                customerPhone: newOrder.customerPhone || '-',
                address: newOrder.type === 'delivery' ? newOrder.address : '',
                items: newOrder.items.map(i => ({ id: i.product.id, quantity: i.quantity })),
                status: OrderStatus.PENDING,
                dueTime: new Date(Date.now() + 30 * 60000).toISOString(), // +30 mins default
                amount: parseFloat(amount.toFixed(2)),
                type: newOrder.type,
                paymentMethod: newOrder.paymentMethod
            });

            setShowCreateModal(false);
            setNewOrder({
                customerName: '', customerPhone: '', address: '', type: 'dine-in', paymentMethod: PaymentMethod.CASH, items: []
            });
            await loadOrders();
        } catch (error) {
            console.error('Failed to create order', error);
            alert('Failed to create order. Please check inputs.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleOrderItem = (product: Product) => {
        const existing = newOrder.items.find(i => i.product.id === product.id);
        if (existing) {
            setNewOrder({ ...newOrder, items: newOrder.items.filter(i => i.product.id !== product.id) });
        } else {
            setNewOrder({ ...newOrder, items: [...newOrder.items, { product, quantity: 1 }] });
        }
    };

    const updateItemQuantity = (productId: string, delta: number) => {
        setNewOrder({
            ...newOrder,
            items: newOrder.items.map(item => {
                if (item.product.id === productId) {
                    const newQ = Math.max(1, item.quantity + delta);
                    return { ...item, quantity: newQ };
                }
                return item;
            })
        });
    };

    const handleApprove = async (orderId: string) => {
        try {
            await api.patch(`/super-admin/orders/${orderId}/approve`);
            await loadOrders();
        } catch (error) {
            console.error('Failed to approve order', error);
            alert('Approval failed.');
        }
    };

    const handleRejectDelete = async (orderId: string) => {
        if (!window.confirm(`Delete order ${orderId}?`)) return;
        try {
            await api.delete(`/orders/${orderId}`);
            await loadOrders();
        } catch (error) {
            console.error('Failed to delete order', error);
        }
    };

    const handleAssignDriver = async (orderId: string) => {
        const driverId = window.prompt(`Select Driver for Order ${orderId}:\n\n` + drivers.map(d => `${d.id}: ${d.name || d.email}`).join('\n'));
        if (!driverId) return;
        try {
            await api.post(`/orders/${orderId}/assign`, { driver_id: driverId });
            await loadOrders();
            alert('Driver assigned successfully.');
        } catch (error) {
            console.error('Failed to assign driver', error);
            alert('Failed to assign driver.');
        }
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-slate-100 text-slate-700',
        [OrderStatus.PREPARING]: 'bg-blue-100 text-blue-700',
        [OrderStatus.READY]: 'bg-purple-100 text-purple-700',
        [OrderStatus.DELIVERING]: 'bg-amber-100 text-amber-700',
        [OrderStatus.COMPLETED]: 'bg-green-100 text-green-700',
    };

    const filteredOrders = orders.filter(o =>
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerPhone.includes(searchQuery)
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Global Orders</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage all incoming tasks and dispatches</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-bold text-sm hover:shadow-[0_8px_20px_rgba(220,38,38,0.3)] hover:-translate-y-0.5 transition-all flex items-center gap-2 mr-2"
                    >
                        <span className="material-icons-round text-[18px]">add</span>
                        New Order
                    </button>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                    >
                        <option value="all">All Status</option>
                        <option value={OrderStatus.PENDING}>Pending</option>
                        <option value={OrderStatus.PREPARING}>Preparing</option>
                        <option value={OrderStatus.READY}>Ready</option>
                        <option value={OrderStatus.DELIVERING}>Delivering</option>
                        <option value={OrderStatus.COMPLETED}>Completed</option>
                    </select>

                    <div className="relative w-64">
                        <span className="material-icons-round absolute left-3 top-2.5 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Search orders..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="px-6 py-4">Order ID</th>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Total Amount</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Photos</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                </td>
                            </tr>
                        ) : filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No matching orders found.</td>
                            </tr>
                        ) : (
                            filteredOrders.map(order => (
                                <React.Fragment key={order.id}>
                                    <tr className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="font-mono font-bold text-slate-800">{order.id}</p>
                                            <p className="text-xs text-slate-500 uppercase">{order.type}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-slate-800">{order.customerName}</p>
                                            <p className="text-xs text-slate-500">{order.customerPhone}</p>
                                        </td>
                                        <td className="px-6 py-4 font-black text-slate-800">
                                            <span className="text-xs font-bold text-slate-400">RM</span> {order.amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                                {order.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500">
                                            {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                                        </td>
                                        {/* Photos column */}
                                        <td className="px-6 py-4">
                                            {order.delivery_photos && order.delivery_photos.length > 0 ? (
                                                <button
                                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                    className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${expandedOrderId === order.id
                                                        ? 'bg-indigo-100 text-indigo-700'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                                                        }`}
                                                >
                                                    <span className="material-icons-round text-[14px]">photo_library</span>
                                                    {order.delivery_photos.length} Photo{order.delivery_photos.length > 1 ? 's' : ''}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            {order.status === OrderStatus.PENDING && (
                                                <button
                                                    onClick={() => handleApprove(order.id)}
                                                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700 transition-colors shadow-md shadow-red-500/20"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                            {/* Assign Driver Logic for SuperAdmin */}
                                            {['pending', 'preparing', 'ready'].includes(order.status) && (
                                                <button
                                                    onClick={() => handleAssignDriver(order.id)}
                                                    className="px-3 py-1.5 bg-slate-800 text-white rounded-lg font-bold text-xs hover:bg-black transition-colors shadow-md shadow-slate-500/20 whitespace-nowrap"
                                                    title={order.driverId ? `Reassign Driver (Current: ${order.driverId})` : "Assign Driver"}
                                                >
                                                    {order.driverId ? "Reassign" : "Assign"}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleRejectDelete(order.id)}
                                                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg font-bold text-xs hover:bg-red-100 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                    {/* 照片展开子行 */}
                                    {expandedOrderId === order.id && order.delivery_photos && order.delivery_photos.length > 0 && (
                                        <tr>
                                            <td colSpan={8} className="pb-5 bg-indigo-50/30 border-b border-indigo-100">
                                                <div className="px-8 pt-3">
                                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                        <span className="material-icons-round text-[12px]">verified_user</span>
                                                        Delivery Evidence — {order.delivery_photos.length} Photo{order.delivery_photos.length > 1 ? 's' : ''}
                                                    </p>
                                                    <div className="flex flex-wrap gap-3">
                                                        {order.delivery_photos.map((url: string, idx: number) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => setLightboxUrl(url)}
                                                                title={`Proof ${idx + 1} — click to enlarge`}
                                                                className="w-28 h-28 rounded-2xl overflow-hidden ring-2 ring-transparent hover:ring-indigo-400 transition-all shadow-md shrink-0 group relative"
                                                            >
                                                                <img src={url} alt={`proof-${idx + 1}`} className="w-full h-full object-cover" />
                                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                    <span className="material-icons-round text-white text-xl">zoom_in</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Lightbox 全屏图片查看 */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-in fade-in"
                    onClick={() => setLightboxUrl(null)}
                >
                    <div className="relative max-w-3xl w-full">
                        <img src={lightboxUrl} alt="Delivery proof" className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
                        <button
                            onClick={() => setLightboxUrl(null)}
                            className="absolute top-3 right-3 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/40 transition-colors"
                        >
                            <span className="material-icons-round">close</span>
                        </button>
                        <p className="text-center text-white/50 text-xs mt-3">点击任意处关闭</p>
                    </div>
                </div>
            )}

            {/* Create Order Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative border border-slate-100">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Create New Order</h2>
                                <p className="text-sm text-slate-500 mt-1">Manually dispatch a POS point order</p>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            {/* Left: Menu Selection */}
                            <div className="flex-1 border-r border-slate-100 p-6 overflow-y-auto bg-slate-50/50">
                                <h3 className="font-bold text-slate-700 mb-4">Select Items</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {products.map(p => {
                                        const selected = newOrder.items.find(i => i.product.id === p.id);
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => toggleOrderItem(p)}
                                                className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selected ? 'border-red-500 bg-red-50/30' : 'border-transparent bg-white shadow-sm hover:shadow-md'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-slate-100 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                                                        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <span className="material-icons-round text-slate-300">fastfood</span>}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-slate-800 line-clamp-1">{p.name}</p>
                                                        <p className="text-xs font-black text-slate-500 mt-1">RM {p.price.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Right: Order Details Form */}
                            <div className="w-full md:w-96 flex flex-col bg-white shrink-0">
                                <div className="p-6 flex-1 overflow-y-auto space-y-5">
                                    <h3 className="font-bold text-slate-700">Order Details</h3>

                                    <div className="space-y-3">
                                        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                                            {['dine-in', 'takeaway', 'delivery'].map(t => (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => setNewOrder({ ...newOrder, type: t as any })}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${newOrder.type === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                                >
                                                    {t.replace('-', ' ')}
                                                </button>
                                            ))}
                                        </div>

                                        <input
                                            type="text" placeholder="Customer Name (Optional)"
                                            value={newOrder.customerName} onChange={e => setNewOrder({ ...newOrder, customerName: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                        />
                                        <input
                                            type="text" placeholder="Phone Number"
                                            value={newOrder.customerPhone} onChange={e => setNewOrder({ ...newOrder, customerPhone: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                        />
                                        {newOrder.type === 'delivery' && (
                                            <textarea
                                                placeholder="Delivery Address *" required
                                                value={newOrder.address} onChange={e => setNewOrder({ ...newOrder, address: e.target.value })}
                                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20 resize-none h-20"
                                            />
                                        )}

                                        <select
                                            title="Payment Method"
                                            value={newOrder.paymentMethod}
                                            onChange={e => setNewOrder({ ...newOrder, paymentMethod: e.target.value as any })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                                        >
                                            <option value={PaymentMethod.CASH}>Cash</option>
                                            <option value={PaymentMethod.EWALLET}>E-Wallet / QR</option>
                                            <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                                        </select>
                                    </div>

                                    <hr className="border-slate-100" />

                                    <div>
                                        <h4 className="font-bold text-xs text-slate-500 mb-3 uppercase tracking-wider">Cart Items</h4>
                                        {newOrder.items.length === 0 ? (
                                            <div className="text-center py-6 text-slate-400 text-sm">No items selected</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {newOrder.items.map(item => (
                                                    <div key={item.product.id} className="flex items-center justify-between text-sm">
                                                        <div className="flex-1 overflow-hidden pr-2">
                                                            <p className="font-bold text-slate-800 truncate">{item.product.name}</p>
                                                            <p className="text-xs text-slate-400">RM {item.product.price.toFixed(2)}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3 bg-slate-100 px-2 py-1 rounded-lg">
                                                            <button onClick={() => updateItemQuantity(item.product.id, -1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors">
                                                                <span className="material-icons-round text-[16px]">remove</span>
                                                            </button>
                                                            <span className="font-bold w-4 text-center">{item.quantity}</span>
                                                            <button onClick={() => updateItemQuantity(item.product.id, 1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-blue-500 transition-colors">
                                                                <span className="material-icons-round text-[16px]">add</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Footer summary & submit */}
                                <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="font-bold text-slate-500">Total Amount</span>
                                        <span className="text-2xl font-black text-red-600">
                                            <span className="text-sm mr-1">RM</span>
                                            {newOrder.items.reduce((s, i) => s + i.product.price * i.quantity, 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleCreateOrder}
                                        disabled={isSubmitting || newOrder.items.length === 0}
                                        className="w-full py-3.5 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-500/20 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <span className="material-icons-round animate-spin">autorenew</span>
                                        ) : (
                                            <span className="material-icons-round">check_circle</span>
                                        )}
                                        {isSubmitting ? 'Processing...' : 'Place Order'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
