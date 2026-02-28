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
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [selectedPrintOrder, setSelectedPrintOrder] = useState<Order | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 12;

    // Assign Driver Modal State
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignOrderId, setAssignOrderId] = useState<string | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');

    // Delete Confirmation Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);

    // Create Order Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [newOrder, setNewOrder] = useState({
        id: '',
        customerName: '',
        customerPhone: '',
        address: '',
        type: 'delivery' as 'dine-in' | 'takeaway' | 'delivery',
        paymentMethod: PaymentMethod.CASH as PaymentMethod,
        eventDate: '',
        eventTime: '',
        items: [] as { product: Product, quantity: number }[],
        equipments: {} as Record<string, number>,
        driverId: null as string | null
    });
    const EQUIPMENTS_LIST = ['汤匙', '烤鸡网', '叉子', '垃圾袋', 'Food Tong', '盘子', '红烧桶', '高盖', '杯子', '篮子', '铁脚架', '装酱碗'];
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

    const handleEditClick = (order: Order) => {
        const preparedItems = order.items.map((i: any) => {
            const product = products.find(p => p.id === i.id) || { id: i.id, name: i.name, price: i.price, code: '' } as Product;
            return { product, quantity: i.quantity };
        });

        const dueDate = order.dueTime ? new Date(order.dueTime) : new Date();
        const eventDate = order.dueTime ? `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}` : '';
        const eventTime = order.dueTime ? `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}` : '';

        setNewOrder({
            id: order.id,
            customerName: order.customerName || '',
            customerPhone: order.customerPhone || '',
            address: order.address || '',
            type: order.type as any,
            paymentMethod: order.paymentMethod || PaymentMethod.CASH,
            items: preparedItems,
            equipments: order.equipments || {},
            driverId: order.driverId || null,
            eventDate,
            eventTime
        });
        setEditingOrder(order);
        setShowCreateModal(true);
    };

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newOrder.items.length === 0) {
            alert("Please add at least one item to the order.");
            return;
        }

        try {
            setIsSubmitting(true);
            const amount = newOrder.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

            let dueTime = editingOrder ? editingOrder.dueTime : new Date(Date.now() + 30 * 60000).toISOString();
            if (newOrder.eventDate && newOrder.eventTime) {
                try {
                    dueTime = new Date(`${newOrder.eventDate}T${newOrder.eventTime}:00`).toISOString();
                } catch (e) {
                    console.warn('Invalid custom date/time provided, falling back to existing dueTime');
                }
            }

            const payload = {
                id: newOrder.id || undefined,
                customerName: newOrder.customerName || 'Walk-in Customer',
                customerPhone: newOrder.customerPhone || '-',
                address: newOrder.address || '',
                items: newOrder.items.map(i => ({ id: i.product.id, name: i.product.name, quantity: i.quantity, price: i.product.price })),
                status: editingOrder ? editingOrder.status : OrderStatus.PENDING,
                dueTime: dueTime,
                amount: parseFloat(amount.toFixed(2)),
                type: 'delivery',
                paymentMethod: newOrder.paymentMethod,
                driverId: newOrder.driverId || undefined,
                equipments: newOrder.equipments
            };

            if (editingOrder) {
                await api.put(`/orders/${editingOrder.id}`, payload);
                alert("Order successfully updated! (更新成功)");
            } else {
                await SuperAdminService.create(payload as any);
                alert("Order successfully created! (创建成功)");
            }

            setShowCreateModal(false);
            setEditingOrder(null);
            setNewOrder({
                id: '', customerName: '', customerPhone: '', address: '', type: 'delivery', paymentMethod: PaymentMethod.CASH, items: [], equipments: {}, driverId: null, eventDate: '', eventTime: ''
            });
            await loadOrders();
        } catch (error) {
            console.error('Failed to save order', error);
            alert(`Failed to ${editingOrder ? 'update' : 'create'} order. Please check inputs.`);
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

    const handleEquipQuantityChange = (name: string, val: string) => {
        const num = parseInt(val) || 0;
        setNewOrder(prev => ({
            ...prev,
            equipments: { ...prev.equipments, [name]: num }
        }));
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

    const handleRejectDelete = (orderId: string) => {
        setDeleteOrderId(orderId);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!deleteOrderId) return;
        try {
            await api.delete(`/orders/${deleteOrderId}`);
            await loadOrders();
            setShowDeleteModal(false);
            setDeleteOrderId(null);
        } catch (error) {
            console.error('Failed to delete order', error);
        }
    };

    const handleAssignDriverClick = (orderId: string) => {
        setAssignOrderId(orderId);
        setSelectedDriverId('');
        setShowAssignModal(true);
    };

    const confirmAssignDriver = async () => {
        if (!assignOrderId || !selectedDriverId) return;
        try {
            await api.post(`/orders/${assignOrderId}/assign`, { driver_id: selectedDriverId });
            await loadOrders();
            setShowAssignModal(false);
            setAssignOrderId(null);
            setSelectedDriverId('');
        } catch (error) {
            console.error('Failed to assign driver', error);
            alert('Failed to assign driver.');
        }
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-yellow-50 text-yellow-600 border border-yellow-200',
        [OrderStatus.PREPARING]: 'bg-blue-50 text-blue-600 border border-blue-200',
        [OrderStatus.READY]: 'bg-purple-50 text-purple-600 border border-purple-200',
        [OrderStatus.DELIVERING]: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
        [OrderStatus.COMPLETED]: 'bg-slate-50 text-slate-600 border border-slate-200',
    };

    const filteredOrders = orders.filter(o =>
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerPhone.includes(searchQuery)
    );

    const totalPages = Math.ceil(filteredOrders.length / pageSize);
    const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Reset pagination when search or filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Order Status</h1>
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm relative">
                <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-max">
                        <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm shadow-sm">
                            <tr className="border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                                <th className="px-6 py-4 whitespace-nowrap">Order ID</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Total Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Photos</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                    </td>
                                </tr>
                            ) : paginatedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">No matching orders found.</td>
                                </tr>
                            ) : (
                                paginatedOrders.map(order => (
                                    <React.Fragment key={order.id}>
                                        <tr className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <p className="font-mono font-bold text-slate-800">{order.id}</p>
                                                <p className="text-xs text-slate-500 uppercase">{order.type}</p>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <p className="font-bold text-slate-800">{order.customerName}</p>
                                                <p className="text-xs text-slate-500">{order.customerPhone}</p>
                                            </td>
                                            <td className="px-6 py-4 font-black text-slate-800 whitespace-nowrap">
                                                <span className="text-xs font-bold text-slate-400">RM</span> {order.amount.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                                    {order.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-500">
                                                {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                                            </td>
                                            {/* Photos column */}
                                            <td className="px-6 py-4 whitespace-nowrap">
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
                                            <td className="px-6 py-4 pr-8 text-right space-x-1.5 whitespace-nowrap">
                                                {order.status === OrderStatus.PENDING && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleApprove(order.id); }}
                                                        title="Approve Order"
                                                        className="w-8 h-8 inline-flex items-center justify-center bg-green-50 text-green-600 rounded-lg font-bold hover:bg-green-100 hover:scale-110 transition-all shadow-sm group"
                                                    >
                                                        <span className="material-icons-round text-[16px]">check_circle</span>
                                                    </button>
                                                )}
                                                {/* Assign Driver Logic for SuperAdmin */}
                                                {['pending', 'preparing', 'ready'].includes(order.status) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleAssignDriverClick(order.id); }}
                                                        className="w-8 h-8 inline-flex items-center justify-center bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 hover:scale-110 transition-all shadow-sm group"
                                                        title={order.driverId ? `Reassign (Current: ${order.driverId})` : "Assign Driver"}
                                                    >
                                                        <span className="material-icons-round text-[16px]">local_shipping</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedPrintOrder(order); }}
                                                    title="View Bill / Print"
                                                    className="w-8 h-8 inline-flex items-center justify-center bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 hover:scale-110 transition-all shadow-sm group"
                                                >
                                                    <span className="material-icons-round text-[16px]">receipt_long</span>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditClick(order); }}
                                                    title="Edit Order"
                                                    className="w-8 h-8 inline-flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 hover:scale-110 transition-all shadow-sm group"
                                                >
                                                    <span className="material-icons-round text-[16px]">edit</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRejectDelete(order.id); }}
                                                    title="Delete Order"
                                                    className="w-8 h-8 inline-flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 hover:scale-110 transition-all shadow-sm group cursor-pointer"
                                                >
                                                    <span className="material-icons-round text-[16px]">delete</span>
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

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">
                            Displaying {paginatedOrders.length} of {filteredOrders.length} orders
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                <span className="material-icons-round text-sm">chevron_left</span>
                            </button>
                            <span className="text-xs font-bold text-slate-700 px-2 min-w-[80px] text-center">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                <span className="material-icons-round text-sm">chevron_right</span>
                            </button>
                        </div>
                    </div>
                )}
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
                                <h2 className="text-xl font-bold text-slate-800">{editingOrder ? 'Edit Order' : 'Create New Order'}</h2>
                                <p className="text-sm text-slate-500 mt-1">{editingOrder ? 'Modify existing order details' : 'Manually dispatch a POS point order'}</p>
                            </div>
                            <button
                                onClick={() => { setShowCreateModal(false); setEditingOrder(null); }}
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
                                        <input
                                            type="text" placeholder="Order ID (Auto-generated if empty)"
                                            value={newOrder.id} onChange={e => setNewOrder({ ...newOrder, id: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                        />
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="block text-xs text-slate-500 mb-1 ml-1">Event Date (活动日期)</label>
                                                <input
                                                    type="date"
                                                    value={newOrder.eventDate} onChange={e => setNewOrder({ ...newOrder, eventDate: e.target.value })}
                                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs text-slate-500 mb-1 ml-1">Event Time (活动时间)</label>
                                                <input
                                                    type="time"
                                                    value={newOrder.eventTime} onChange={e => setNewOrder({ ...newOrder, eventTime: e.target.value })}
                                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                                />
                                            </div>
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
                                        <textarea
                                            placeholder="Delivery Address *" required
                                            value={newOrder.address} onChange={e => setNewOrder({ ...newOrder, address: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20 resize-none h-20"
                                        />

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

                                    <hr className="border-slate-100" />

                                    <div>
                                        <h4 className="font-bold text-xs text-slate-500 mb-3 uppercase tracking-wider">包含设备 (Equipments)</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            {EQUIPMENTS_LIST.map((eq) => (
                                                <div
                                                    key={eq}
                                                    className={`bg-slate-50 rounded-xl p-2 border transition-all flex flex-col gap-2 shadow-sm ${(newOrder.equipments[eq] || 0) > 0 ? 'border-primary/50 bg-primary/5' : 'border-slate-100'
                                                        }`}
                                                >
                                                    <span className="text-[10px] font-bold text-slate-700 uppercase">{eq}</span>
                                                    <div className="relative">
                                                        <span className="material-icons-round absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]">edit</span>
                                                        <input
                                                            type="number"
                                                            placeholder="0"
                                                            className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-6 pr-2 text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20 outline-none"
                                                            value={newOrder.equipments[eq] || ''}
                                                            onChange={(e) => handleEquipQuantityChange(eq, e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <hr className="border-slate-100" />

                                    <div>
                                        <h4 className="font-bold text-xs text-slate-500 mb-3 uppercase tracking-wider">指派配送员 (Driver Assignment)</h4>
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                            {drivers.map((driver) => (
                                                <button
                                                    key={driver.id}
                                                    onClick={() => setNewOrder({ ...newOrder, driverId: driver.id })}
                                                    className={`min-w-[100px] p-2 rounded-xl border transition-all flex flex-col items-center gap-2 relative ${newOrder.driverId === driver.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-white border-slate-100'
                                                        }`}
                                                >
                                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 overflow-hidden">
                                                        {driver.avatar_url ? (
                                                            <img src={driver.avatar_url} alt={driver.name || driver.email} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="material-icons-round text-lg">person</span>
                                                        )}
                                                    </div>
                                                    <div className="text-center w-full px-1">
                                                        <p className="text-[10px] font-bold text-slate-800 truncate">{driver.name || driver.email.split('@')[0]}</p>
                                                    </div>
                                                    {newOrder.driverId === driver.id && (
                                                        <div className="absolute top-1 right-1 text-primary">
                                                            <span className="material-icons-round text-[12px]">check_circle</span>
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer summary & submit */}
                                <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0 relative z-10">
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
                                        {isSubmitting ? 'Processing...' : (editingOrder ? 'Update Order' : 'Place Order')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Driver Modal */}
            {showAssignModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col items-center p-6 border border-slate-100 relative">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                            <span className="material-icons-round text-2xl">local_shipping</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 text-center">Assign Driver</h3>
                        <p className="text-xs font-bold text-slate-500 text-center mt-1 mb-6">Order ID: {assignOrderId}</p>

                        <div className="w-full space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2 mb-6">
                            {drivers.map(driver => (
                                <button
                                    key={driver.id}
                                    onClick={() => setSelectedDriverId(driver.id)}
                                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center gap-3 ${selectedDriverId === driver.id ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-slate-200 focus:outline-none'}`}
                                >
                                    <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                                        {driver.avatar_url ? (
                                            <img src={driver.avatar_url} alt={driver.name || driver.email} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-icons-round text-[16px]">person</span>
                                        )}
                                    </div>
                                    <span className="font-bold text-sm text-slate-700 flex-1">{driver.name || driver.email.split('@')[0]}</span>
                                    {selectedDriverId === driver.id && (
                                        <span className="material-icons-round text-primary text-[18px]">check_circle</span>
                                    )}
                                </button>
                            ))}
                            {drivers.length === 0 && (
                                <p className="text-center text-slate-400 text-xs py-4 font-bold">No dispatchers available</p>
                            )}
                        </div>

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => { setShowAssignModal(false); setAssignOrderId(null); setSelectedDriverId(''); }}
                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAssignDriver}
                                disabled={!selectedDriverId}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:bg-primary text-white font-bold rounded-xl transition-all shadow-lg hover:-translate-y-0.5 text-sm"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col items-center p-8 border border-red-100 relative scale-in-center">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-5 ring-8 ring-red-50">
                            <span className="material-icons-round text-3xl">delete_forever</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-800 text-center mb-2">Delete Order?</h3>
                        <p className="text-sm text-slate-500 text-center mb-1">
                            Are you absolutely sure you want to delete this order?
                        </p>
                        <p className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1 pb-1.5 rounded-lg text-center mb-8 break-all max-w-[280px]">
                            ID: {deleteOrderId}
                        </p>

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => { setShowDeleteModal(false); setDeleteOrderId(null); }}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:-translate-y-0.5 shadow-red-500/30 text-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* View Bill / Print Receipt Modal */}
            {selectedPrintOrder && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in print:bg-white print:p-0">
                    <style>
                        {`
                        @media print {
                            body * { visibility: hidden; }
                            #printable-receipt, #printable-receipt * { visibility: visible; }
                            #printable-receipt { position: absolute; left: 0; top: 0; width: 100%; height: auto; box-shadow: none; overflow: visible; padding: 20px; }
                            @page { margin: 0; size: auto; }
                            .no-print { display: none !important; }
                        }
                        `}
                    </style>
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden relative border border-slate-100 print:shadow-none print:border-none print:max-h-none">

                        {/* Header Actions (Hidden in Print) */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0 no-print bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-icons-round text-purple-500">receipt_long</span>
                                Order Invoice
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-700 transition shadow-sm flex items-center gap-1.5"
                                >
                                    <span className="material-icons-round text-[16px]">print</span>
                                    Print Bill
                                </button>
                                <button
                                    onClick={() => setSelectedPrintOrder(null)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                                >
                                    <span className="material-icons-round text-[16px]">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Printable Content */}
                        <div id="printable-receipt" className="p-8 overflow-y-auto bg-white flex-1 text-slate-800">
                            <div className="text-center mb-6 border-b-2 border-slate-900 pb-6">
                                <h1 className="text-2xl font-black tracking-wider uppercase mb-1">Kim Long Smart Catering</h1>
                                <p className="text-sm text-slate-500">Official Order Invoice</p>
                                <p className="text-xs font-mono mt-3 text-slate-400">ID: {selectedPrintOrder.id}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm mb-6 bg-slate-50/50 p-4 rounded-xl border border-slate-100 print:border-slate-300">
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Customer Name</p>
                                    <p className="font-bold">{selectedPrintOrder.customerName || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Phone Contact</p>
                                    <p className="font-bold">{selectedPrintOrder.customerPhone || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Event Due Date</p>
                                    <p className="font-bold">
                                        {selectedPrintOrder.dueTime
                                            ? new Date(selectedPrintOrder.dueTime).toLocaleString('zh-CN', { hour12: false })
                                            : 'Not Set'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Order Type</p>
                                    <p className="font-bold uppercase text-indigo-600">{selectedPrintOrder.type}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Delivery Address</p>
                                    <p className="font-bold">{selectedPrintOrder.address || 'Takeaway/Dine-In'}</p>
                                </div>
                            </div>

                            <div className="mb-6">
                                <h3 className="text-sm font-black uppercase text-slate-400 border-b border-slate-200 pb-2 mb-3">Itemized List</h3>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                            <th className="pb-2 font-bold uppercase">Item</th>
                                            <th className="pb-2 font-bold uppercase text-center w-16">Qty</th>
                                            <th className="pb-2 font-bold uppercase text-right w-24">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {selectedPrintOrder.items?.map((item: any, index: number) => (
                                            <tr key={index}>
                                                <td className="py-3 font-bold">{item.name}</td>
                                                <td className="py-3 text-center">{item.quantity}x</td>
                                                <td className="py-3 text-right font-bold">RM {(item.price * item.quantity).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        {selectedPrintOrder.equipments && Object.entries(selectedPrintOrder.equipments).filter(([_, qty]) => Number(qty) > 0).map(([equip, qty], index) => (
                                            <tr key={`eq-${index}`}>
                                                <td className="py-2 pl-4 text-xs text-slate-500 italic flex items-center gap-1.5">+ Equipment: {equip}</td>
                                                <td className="py-2 text-center text-xs text-slate-500">{qty}x</td>
                                                <td className="py-2 text-right text-xs text-slate-400">—</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-end">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase">Payment Method</p>
                                    <p className="font-bold uppercase text-slate-700">{selectedPrintOrder.paymentMethod || 'NOT SET'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Grand Total</p>
                                    <p className="text-3xl font-black text-slate-900 leading-none">RM {selectedPrintOrder.amount.toFixed(2)}</p>
                                </div>
                            </div>

                            <div className="mt-12 text-center text-xs text-slate-400 border-t border-slate-100 pt-6">
                                <p>Thank you for choosing Kim Long Smart Catering!</p>
                                <p>Please contact us for any inquiries regarding this order.</p>
                            </div>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};
