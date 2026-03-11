import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, SuperAdminService, ProductService } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, Product } from '../types';
import { OrderStatus } from '../types';
import { PageHeader } from '../components/PageHeader';
import { NotificationBell } from '../components/NotificationBell';

export const OrdersPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [dateFilter, setDateFilter] = useState<string>(searchParams.get('date') || 'all');

    // Sync state with URL parameters when they change
    useEffect(() => {
        const status = searchParams.get('status');
        const search = searchParams.get('search');
        const date = searchParams.get('date');
        const isReset = searchParams.get('reset') === 'true';
        const isCreate = searchParams.get('create') === 'true';

        if (isReset) {
            setStatusFilter('all');
            setSearchQuery('');
            setDateFilter('all');
        } else if (isCreate) {
            setShowCreateModal(true);
        } else {
            if (status) setStatusFilter(status);
            if (search !== null) setSearchQuery(search);
            if (date) setDateFilter(date);
        }
    }, [searchParams]);

    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [selectedPrintOrder, setSelectedPrintOrder] = useState<Order | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 12;

    // Modal States
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
    const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
    const [isDeleting, setIsDeleting] = useState(false);

    // Create Order Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [newOrder, setNewOrder] = useState({
        id: '',
        customerName: '',
        customerPhone: '',
        address: '',
        type: 'delivery' as 'dine-in' | 'takeaway' | 'delivery',
        remark: '',
        payment_received: 0,
        eventDate: '',
        eventTime: '',
        items: [] as { product: Product, quantity: number, priceOverride?: number }[],
        equipments: {} as Record<string, number>,
        driverId: null as string | null
    });
    const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
    const EQUIPMENTS_LIST = ['汤匙', '烤鸡网', '叉子', '垃圾袋', 'Food Tong', '盘子', '红烧桶', '高盖', '杯子', '篮子', '铁脚架', '装酱碗'];
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadOrders = useCallback(async () => {
        try {
            const response = await api.get(`/orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`);
            setOrders(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Failed to load orders', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const fetchProducts = useCallback(async () => {
        try {
            const data = await ProductService.getAll();
            const productsData = Array.isArray(data) ? data : [];
            setProducts(productsData);

            const prices: Record<string, number> = {};
            productsData.forEach(p => {
                prices[p.id] = p.price || 0;
            });
            setCustomPrices(prices);
        } catch (error) {
            console.error('Failed to load products', error);
        }
    }, []);

    useEffect(() => {
        loadOrders();
        fetchProducts();

        const channel = supabase
            .channel('orders-page-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    loadOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadOrders, fetchProducts]);

    const handleEditClick = (order: Order) => {
        const prices: Record<string, number> = { ...customPrices };

        const preparedItems = (order.items || []).map((i: any) => {
            const product = products.find(p => p.id === i.id) || { id: i.id, name: i.name, price: i.price, code: '' } as Product;
            if (i.price !== undefined) {
                prices[i.id] = Number(i.price);
            }
            return {
                product,
                quantity: i.quantity,
                priceOverride: i.price !== undefined ? Number(i.price) : undefined
            };
        });

        setCustomPrices(prices);

        const dueDate = order.dueTime ? new Date(order.dueTime) : new Date();
        const eventDate = order.dueTime ? `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}` : '';
        const eventTime = order.dueTime ? `${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}` : '';

        setNewOrder({
            id: order.id,
            customerName: order.customerName || '',
            customerPhone: order.customerPhone || '',
            address: order.address || '',
            type: order.type as any,
            remark: order.remark || '',
            payment_received: order.payment_received || 0,
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

        if (!newOrder.customerName.trim() || !newOrder.customerPhone.trim() || !newOrder.address.trim() || !newOrder.eventDate.trim() || !newOrder.eventTime.trim()) {
            alert('请填写完整客户姓名、电话、地址、活动日期和时间');
            return;
        }

        if (newOrder.items.length === 0) {
            alert("Please add at least one item to the order.");
            return;
        }

        try {
            setIsSubmitting(true);
            const amount = newOrder.items.reduce((sum, item) => sum + ((item.priceOverride ?? item.product.price) || 0) * item.quantity, 0);

            const itemsPayload = newOrder.items.map(i => ({
                id: i.product.id,
                name: i.product.name,
                price: i.priceOverride ?? i.product.price,
                original_price: i.product.price,
                quantity: i.quantity,
                note: (i as any).note
            }));

            let dueTime = editingOrder ? editingOrder.dueTime : new Date(Date.now() + 30 * 60000).toISOString();
            if (newOrder.eventDate && newOrder.eventTime) {
                try {
                    dueTime = new Date(`${newOrder.eventDate}T${newOrder.eventTime}:00`).toISOString();
                } catch (e) {
                    console.warn('Invalid custom date/time provided, falling back');
                }
            }

            const payload = {
                id: editingOrder ? editingOrder.id : undefined,
                items: itemsPayload,
                amount,
                customerName: newOrder.customerName,
                customerPhone: newOrder.customerPhone,
                address: newOrder.address,
                type: newOrder.type,
                remark: newOrder.remark,
                payment_received: newOrder.payment_received,
                dueTime,
                status: editingOrder ? editingOrder.status : OrderStatus.PENDING,
                equipments: newOrder.equipments,
                driverId: newOrder.driverId || undefined
            };

            if (editingOrder) {
                await api.put(`/super-admin/orders/${editingOrder.id}`, payload);
            } else {
                await SuperAdminService.create(payload as any);
            }

            await loadOrders();
            setShowCreateModal(false);
            setEditingOrder(null);
            setProductSearchQuery('');
            setNewOrder({
                id: '',
                customerName: '',
                customerPhone: '',
                address: '',
                type: 'delivery',
                remark: '',
                payment_received: 0,
                eventDate: '',
                eventTime: '',
                items: [],
                equipments: {},
                driverId: null
            });
        } catch (error) {
            console.error('Failed to save order', error);
            alert('Failed to save order.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleOrderItem = (productId: string) => {
        const exists = newOrder.items.find(i => i.product.id === productId);
        if (exists) {
            setNewOrder({ ...newOrder, items: newOrder.items.filter(i => i.product.id !== productId) });
        } else {
            const product = products.find(p => p.id === productId);
            if (product) {
                const price = customPrices[productId] ?? product.price;
                setNewOrder({ ...newOrder, items: [...newOrder.items, { product, quantity: 1, priceOverride: price }] });
            }
        }
    };

    const handlePriceChange = (productId: string, price: string) => {
        const num = parseFloat(price) || 0;
        setCustomPrices(prev => ({ ...prev, [productId]: num }));
        setNewOrder(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.product.id === productId ? { ...item, priceOverride: num } : item
            )
        }));
    };

    const updateItemQuantity = (productId: string, delta: number) => {
        setNewOrder({
            ...newOrder,
            items: newOrder.items.map(item => {
                if (item.product.id === productId) {
                    return { ...item, quantity: Math.max(1, item.quantity + delta) };
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
        }
    };

    const handleDeleteClick = (id: string) => {
        setDeleteOrderId(id);
        setDeleteStep(1);
        setShowDeleteModal(true);
    };

    const handleRejectDelete = () => {
        setShowDeleteModal(false);
        setDeleteOrderId(null);
        setDeleteStep(1);
    };

    const confirmDelete = async () => {
        if (!deleteOrderId) return;
        setIsDeleting(true);
        try {
            await api.delete(`/orders/${deleteOrderId}`);
            await loadOrders();
            handleRejectDelete();
        } catch (error) {
            console.error('Failed to delete order', error);
        } finally {
            setIsDeleting(false);
        }
    };


    /**
     * 直接在表格中更改订单状态（点击状态标签出现下拉菜单）
     */
    const handleInlineStatusChange = async (orderId: string, newStatus: string) => {
        try {
            await api.post(`/orders/${encodeURIComponent(orderId)}/status?status=${newStatus}`);
            await loadOrders();
        } catch (error) {
            console.error('Failed to update order status inline', error);
            alert('状态更新失败 / Status update failed.');
        }
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-yellow-50 text-yellow-600 border border-yellow-200',
        [OrderStatus.PREPARING]: 'bg-blue-50 text-blue-600 border border-blue-200',
        [OrderStatus.READY]: 'bg-cyan-50 text-cyan-600 border border-cyan-200',
        [OrderStatus.DELIVERING]: 'bg-purple-50 text-purple-600 border border-purple-200',
        [OrderStatus.COMPLETED]: 'bg-green-50 text-green-600 border border-green-200',
        delayed: 'bg-red-50 text-red-600 border border-red-200',
    };

    const filteredOrders = orders.filter(o => {
        const id = String(o.id || '');
        const name = String(o.customerName || '');
        const phone = String(o.customerPhone || '');
        const search = String(searchQuery || '').toLowerCase();

        const matchesSearch =
            id.toLowerCase().includes(search) ||
            name.toLowerCase().includes(search) ||
            phone.includes(searchQuery);

        const matchesStatus = statusFilter === 'all' || o.status === statusFilter;

        let matchesDate = true;
        if (dateFilter === 'today') {
            const today = new Date().toDateString();
            const orderDateValue = o.dueTime || o.created_at;
            if (orderDateValue) {
                const orderDate = new Date(orderDateValue).toDateString();
                matchesDate = today === orderDate;
            } else {
                matchesDate = false;
            }
        }

        return matchesSearch && matchesStatus && matchesDate;
    });

    const totalPages = Math.ceil(filteredOrders.length / pageSize);
    const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Reset pagination when search or filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, dateFilter]);

    return (
        <div className="pb-20">
            <PageHeader
                title="Order Status / 订单状态"
                subtitle="Manage all incoming tasks and dispatches"
                showStats={false}
                actions={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setStatusFilter('all');
                                    setSearchQuery('');
                                    window.history.replaceState({}, '', window.location.pathname);
                                }}
                                className="px-4 py-2 bg-slate-100/50 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all flex items-center gap-2"
                                title="Reset all filters"
                            >
                                <span className="material-icons-round text-[18px]">restart_alt</span>
                            </button>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"
                            >
                                <span className="material-icons-round text-[18px]">add</span>
                                <span className="hidden lg:inline">New Order</span>
                            </button>

                            <NotificationBell />

                            <select
                                id="order-status-filter"
                                name="order-status-filter"
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="px-4 py-2 bg-white/50 backdrop-blur border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                                <option value="all">All Status</option>
                                <option value={OrderStatus.PENDING}>Pending</option>
                                <option value={OrderStatus.PREPARING}>Preparing</option>
                                <option value={OrderStatus.READY}>Ready</option>
                                <option value={OrderStatus.DELIVERING}>Delivering</option>
                                <option value={OrderStatus.COMPLETED}>Completed</option>
                            </select>

                            <div className="relative w-48 lg:w-64">
                                <span className="material-icons-round absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
                                <input
                                    id="order-search"
                                    name="order-search"
                                    type="text"
                                    placeholder="Search orders..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white/50 backdrop-blur text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                        </div>
                    </div>
                }
            />

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm relative">
                {/* 锁定高度与固定表头加固 */}
                <div className="h-[60vh] min-h-[400px] overflow-y-auto custom-scrollbar scroll-smooth">
                    <table className="w-full text-left border-collapse min-w-max table-auto">
                        <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md shadow-sm border-b border-slate-200">
                            <tr className="text-slate-500 font-bold text-[11px] uppercase tracking-wider">
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
                                                <p className="font-mono font-bold text-slate-800">{order.order_number || order.id}</p>
                                                <p className="text-xs text-slate-500 uppercase">{order.type}</p>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <p className="font-bold text-slate-800">{order.customerName}</p>
                                                <p className="text-xs text-slate-500">{order.customerPhone}</p>
                                            </td>
                                            <td className="px-6 py-4 font-black text-slate-800 whitespace-nowrap">
                                                <span className="text-xs font-bold text-slate-400">RM</span> {(order.amount || 0).toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <select
                                                    value={order.status || 'pending'}
                                                    onChange={(e) => handleInlineStatusChange(order.id, e.target.value)}
                                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer outline-none appearance-none bg-no-repeat bg-right pr-6 transition-all ${(statusColors as any)[order.status || 'pending'] || 'bg-slate-100 text-slate-600'}`}
                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 4px center' }}
                                                >
                                                    <option value={OrderStatus.PENDING}>PENDING</option>
                                                    <option value={OrderStatus.PREPARING}>PREPARING</option>
                                                    <option value={OrderStatus.READY}>READY</option>
                                                    <option value={OrderStatus.DELIVERING}>DELIVERING</option>
                                                    <option value={OrderStatus.COMPLETED}>COMPLETED</option>
                                                </select>
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
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(order.id); }}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative border border-slate-100 mt-4 sm:mt-0">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white z-10">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">{editingOrder ? 'Edit Order' : 'Create New Order'}</h2>
                                <p className="text-sm font-medium text-slate-500 mt-1">{editingOrder ? 'Modify existing order details' : 'Manually dispatch a POS point order'}</p>
                            </div>
                            <button
                                onClick={() => { setShowCreateModal(false); setEditingOrder(null); setProductSearchQuery(''); }}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-50/50">
                            {/* Left: Menu Selection */}
                            <div className="flex-1 border-r border-slate-200 p-6 overflow-y-auto flex flex-col h-full bg-slate-50/50">
                                <div className="shrink-0 mb-4 space-y-3">
                                    <h3 className="font-black text-slate-700 tracking-tight uppercase text-sm">Select Items</h3>
                                    {/* 红色部分要求：产品搜索栏 */}
                                    <div className="relative">
                                        <span className="material-icons-round absolute left-3 top-2.5 text-slate-400">search</span>
                                        <input
                                            type="text"
                                            placeholder="Search products..."
                                            value={productSearchQuery}
                                            onChange={(e) => setProductSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-red-500/30 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all shadow-sm"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto custom-scrollbar pb-6 pr-2">
                                    {products
                                        .filter(p =>
                                            (p.name || '').toLowerCase().includes((productSearchQuery || '').toLowerCase()) ||
                                            (p.code && p.code.toLowerCase().includes((productSearchQuery || '').toLowerCase()))
                                        )
                                        .map(p => {
                                            const selected = newOrder.items.find(i => i.product.id === p.id);
                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => toggleOrderItem(p.id)}
                                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selected ? 'border-red-500 bg-red-50/30' : 'border-transparent bg-white shadow-sm hover:shadow-md'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 bg-slate-100 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                                                            {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <span className="material-icons-round text-slate-300">fastfood</span>}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-sm text-slate-800 line-clamp-1">{p.name}</p>
                                                            <div className="flex items-center gap-1 text-red-500 group/price relative mt-1">
                                                                <span className="text-[10px] font-black">RM</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={customPrices[p.id] !== undefined ? customPrices[p.id] : (p.price || 0)}
                                                                    onChange={(e) => handlePriceChange(p.id, e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="w-16 bg-transparent border-none p-0 text-xs font-black outline-none focus:ring-0"
                                                                />
                                                                <span className="material-icons-round text-[10px] opacity-0 group-hover/price:opacity-100 transition-opacity">edit</span>
                                                            </div>
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
                                            type="text" placeholder="Customer Name *"
                                            value={newOrder.customerName} onChange={e => setNewOrder({ ...newOrder, customerName: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                            required
                                        />
                                        <input
                                            type="text" placeholder="Phone Number *"
                                            value={newOrder.customerPhone} onChange={e => setNewOrder({ ...newOrder, customerPhone: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                                            required
                                        />
                                        <textarea
                                            placeholder="Delivery Address *" required
                                            value={newOrder.address} onChange={e => setNewOrder({ ...newOrder, address: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20 resize-none h-20"
                                        />
                                        <textarea
                                            placeholder="Remark (Optional)"
                                            value={newOrder.remark} onChange={e => setNewOrder({ ...newOrder, remark: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/20 resize-none h-20"
                                        />
                                    </div>

                                    <hr className="border-slate-100" />

                                    {/* Deposit Input */}
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">定金 Deposit (RM)</label>
                                        <div className="relative group">
                                            <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">payments</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono font-bold"
                                                placeholder="0.00"
                                                value={newOrder.payment_received || ''}
                                                onChange={(e) => setNewOrder({ ...newOrder, payment_received: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
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
                                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 rounded-lg border border-red-100/50 mt-1">
                                                                <span className="text-[10px] font-black">RM</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={item.priceOverride ?? item.product.price}
                                                                    onChange={(e) => handlePriceChange(item.product.id, e.target.value)}
                                                                    className="w-16 bg-transparent border-none p-0 text-xs font-black outline-none focus:ring-0"
                                                                />
                                                            </div>
                                                            {item.priceOverride !== undefined && item.priceOverride !== item.product.price && (
                                                                <p className="text-[9px] text-slate-400 line-through mt-0.5 ml-1">
                                                                    Original: RM {(item.product.price || 0).toFixed(2)}
                                                                </p>
                                                            )}
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

                                </div>

                                {/* Footer summary & submit */}
                                <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0 relative z-10">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="font-bold text-slate-500">Total Amount</span>
                                        <span className="text-2xl font-black text-red-600">
                                            <span className="text-sm mr-1">RM</span>
                                            {newOrder.items.reduce((s, i) => s + ((i.priceOverride ?? i.product.price) || 0) * i.quantity, 0).toFixed(2)}
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


            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden relative border border-slate-100">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className={`material-icons-round text-red-500 text-4xl ${deleteStep === 2 ? 'animate-pulse' : ''}`}>
                                    {deleteStep === 1 ? 'delete_sweep' : 'report_problem'}
                                </span>
                            </div>

                            <h3 className="text-2xl font-black text-slate-800 mb-2">
                                {deleteStep === 1 ? 'Delete Order?' : 'Final Warning!'}
                            </h3>

                            <p className="text-slate-500 font-bold leading-relaxed mb-8 px-4 text-sm">
                                {deleteStep === 1 ? (
                                    <>Are you sure you want to delete order <span className="text-slate-900 font-black">"{deleteOrderId}"</span>?</>
                                ) : (
                                    <span className="text-red-500 font-black">This will permanently remove the order, its preparation status, and GoEasy notifications. Data recovery is NOT possible.</span>
                                )}
                            </p>

                            <div className="flex flex-col gap-3">
                                {deleteStep === 1 ? (
                                    <button
                                        onClick={() => setDeleteStep(2)}
                                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-xl shadow-slate-900/20"
                                    >
                                        Yes, Continue
                                    </button>
                                ) : (
                                    <button
                                        onClick={confirmDelete}
                                        disabled={isDeleting}
                                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-xl shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isDeleting && <span className="material-icons-round animate-spin">autorenew</span>}
                                        Confirm Final Delete
                                    </button>
                                )}

                                <button
                                    onClick={handleRejectDelete}
                                    disabled={isDeleting}
                                    className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* View Bill / Print Receipt Modal */}
            {selectedPrintOrder && (
                <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 sm:items-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in print:bg-white print:p-0 print:items-start print:justify-start">
                    {/* 打印模式样式 — A4 纸张适配，尽量单页完成 */}
                    <style>{`
                        @page {
                            size: A4 portrait;
                            margin: 10mm;
                        }
                        @media print {
                            /* 1. 隐藏页面上的所有元素 */
                            body * {
                                visibility: hidden;
                            }
                            
                            /* 2. 只显示我们的模态框以及模态框里的所有子元素 */
                            #printable-order-wrapper, 
                            #printable-order-wrapper * {
                                visibility: visible;
                            }

                            /* 3. 把模态框强行拉到页面的最左上角，脱离原本的文档流 */
                            #printable-order-wrapper {
                                position: absolute !important;
                                left: 0 !important;
                                top: 0 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                width: 100% !important;
                                max-height: none !important;
                                overflow: visible !important;
                                /* 取消任何滚动条和多余背景 */
                                background: white !important;
                            }

                            /* 4. 清理模态框自身的样式，确保它在白纸上能占满全宽 */
                            #printable-order {
                                width: 100% !important;
                                max-width: 100% !important;
                                box-shadow: none !important;
                                border: none !important;
                                border-radius: 0 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                            }

                            /* 5. 隐藏一些特定的不该被打印的元素 (例如关闭按钮和打印按钮) */
                            .no-print-area, .no-print-area * {
                                display: none !important;
                            }

                            /* 6. 防止表格内容被硬切断 */
                            table { page-break-inside: auto; }
                            tr { page-break-inside: avoid; page-break-after: auto; }
                            thead { display: table-header-group; }
                            tfoot { display: table-footer-group; }
                            
                            /* 7. 强制开启背景色打印 (很多浏览器默认忽略 CSS 背景色) */
                            .bg-slate-50 { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-blue-50 { background-color: #eff6ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-violet-50 { background-color: #f5f3ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-amber-50 { background-color: #fffbeb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    `}</style>
                    <div id="printable-order-wrapper" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-transparent print:max-h-none print:overflow-visible">
                        <div className="bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden relative mx-auto print:rounded-none print:shadow-none print:border-none" id="printable-order">

                            {/* 关闭按钮 (不可打印) */}
                            <button
                                onClick={() => setSelectedPrintOrder(null)}
                                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors z-10 no-print-area"
                            >
                                <span className="material-icons-round text-[18px]">close</span>
                            </button>

                            {/* 标题 */}
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 text-white text-center no-print-area">
                                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                                    <span className="material-icons-round text-3xl">receipt_long</span>
                                </div>
                                <h2 className="text-xl font-black">Order Details</h2>
                                <p className="text-blue-100 text-xs mt-1 font-bold uppercase tracking-widest">Receipt</p>
                            </div>

                            <div className="p-8 print:p-0 space-y-6 print:space-y-4 max-w-3xl mx-auto font-sans">
                                {/* 收据公司标头（打印时显示）*/}
                                <div className="text-center pb-6 border-b-2 border-slate-800 flex flex-col items-center">
                                    {/* 公司 Logo */}
                                    <img
                                        src="/print-logo.png"
                                        alt="Kim Long Logo"
                                        className="w-48 h-auto print:w-40 mb-3 shadow-sm"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    <h1 className="text-2xl print:text-xl font-black text-slate-900 tracking-tight">KIM LONG CATERING SDN BHD</h1>
                                    <p className="text-sm print:text-xs text-slate-600 font-bold mt-1">1519675-T</p>
                                    <div className="text-sm print:text-[11px] text-slate-500 font-medium leading-tight mt-2 space-y-0.5">
                                        <p>NO 120&121, JALAN SENAI UTAMA</p>
                                        <p>TAMAN SENAI UTAMA 5/17</p>
                                        <p>81400, SENAI, JOHOR.</p>
                                    </div>
                                    <p className="text-xs print:text-[10px] text-blue-600 font-black tracking-widest mt-4 uppercase bg-blue-50 px-3 py-1 rounded-md">CUSTOMER BILL / INVOICE</p>
                                </div>

                                {/* 订单基础信息 & 客户信息 */}
                                <div className="flex flex-col md:flex-row justify-between gap-6 print:gap-4 pb-4">
                                    {/* 左侧：客户信息 */}
                                    <div className="flex-1 space-y-2">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Billed To</h3>
                                        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-sm print:text-xs">
                                            <span className="text-slate-500 font-medium">Name:</span>
                                            <span className="font-bold text-slate-900">{selectedPrintOrder.customerName || '-'}</span>

                                            <span className="text-slate-500 font-medium">Phone:</span>
                                            <span className="font-bold text-slate-900 font-mono">{selectedPrintOrder.customerPhone || '-'}</span>

                                            <span className="text-slate-500 font-medium">Address:</span>
                                            <span className="font-bold text-slate-900 leading-snug">{selectedPrintOrder.address || 'Self Pickup'}</span>
                                        </div>
                                    </div>

                                    {/* 右侧：订单信息 & QR */}
                                    <div className="flex gap-4 sm:justify-end">
                                        <div className="space-y-2 flex-grow sm:flex-grow-0 min-w-[200px]">
                                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 text-right">Order Details</h3>
                                            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm print:text-xs text-right">
                                                <span className="text-slate-500 font-medium">Order Ref:</span>
                                                <span className="font-black text-slate-900 font-mono">{selectedPrintOrder.id}</span>

                                                <span className="text-slate-500 font-medium">Created:</span>
                                                <span className="font-bold text-slate-700">{selectedPrintOrder.created_at ? new Date(selectedPrintOrder.created_at).toLocaleString('en-MY', { hour12: false }) : '-'}</span>

                                                <span className="text-slate-500 font-medium">Event Time:</span>
                                                <span className="font-bold text-slate-900">{selectedPrintOrder.dueTime ? new Date(selectedPrintOrder.dueTime).toLocaleString('en-MY', { hour12: false }) : '-'}</span>
                                            </div>
                                        </div>

                                        <div className="shrink-0 pt-1">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(selectedPrintOrder.id)}&bgcolor=ffffff&color=0f172a&margin=0`}
                                                alt="Order QR Code"
                                                className="w-16 h-16 border border-slate-200 p-1"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 商品明细 */}
                                <div>
                                    <table className="w-full text-sm print:text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b-2 border-slate-800">
                                                <th className="text-left py-2 font-black text-slate-700 uppercase tracking-wider">Description</th>
                                                <th className="text-center py-2 font-black text-slate-700 uppercase tracking-wider w-16">Qty</th>
                                                <th className="text-right py-2 font-black text-slate-700 uppercase tracking-wider w-24">Unit Price</th>
                                                <th className="text-right py-2 font-black text-slate-700 uppercase tracking-wider w-24">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {selectedPrintOrder.items?.map((item: any, idx: number) => (
                                                <tr key={idx} className="group">
                                                    <td className="py-3 pr-2">
                                                        <p className="font-bold text-slate-900">{item.name}</p>
                                                        {item.code && <p className="text-xs text-slate-500 font-mono mt-0.5">Item Code: {item.code}</p>}
                                                        {item.note && <p className="text-xs text-slate-500 italic mt-0.5">Note: {item.note}</p>}
                                                    </td>
                                                    <td className="py-3 px-2 text-center align-top">
                                                        <span className="font-black text-slate-900">{item.quantity}</span>
                                                    </td>
                                                    <td className="py-3 px-2 text-right text-slate-600 font-mono align-top">
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-bold text-slate-900">RM {item.price ? Number(item.price).toFixed(2) : '-'}</span>
                                                            {item.original_price && Number(item.price) !== Number(item.original_price) && (
                                                                <span className="text-[9px] text-slate-400 line-through">市场价: RM {Number(item.original_price).toFixed(2)}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pl-2 text-right font-black text-slate-900 font-mono align-top">RM {item.price ? (Number(item.price) * item.quantity).toFixed(2) : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* 设备 / 物资 */}
                            {selectedPrintOrder.equipments && Object.keys(selectedPrintOrder.equipments).length > 0 && (
                                <div className="pt-2">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Equipments / Materials</h3>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {Object.entries(selectedPrintOrder.equipments)
                                            .filter(([_, qty]) => Number(qty) > 0)
                                            .map(([name, qty]) => (
                                                <span key={name} className="text-sm print:text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                    {name}
                                                    <span className="text-slate-500 font-normal ml-1">× {qty}</span>
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* 底部附加信息 & 金额总计 */}
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-6 border-t border-slate-200 mt-6 page-break-avoid">
                                {/* 左侧：其他杂项信息 */}
                                <div className="flex-1 space-y-3 w-full sm:w-auto">
                                    <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm print:text-xs">
                                        <span className="text-slate-500 font-medium">Payment:</span>
                                        <span className="font-bold text-slate-900 uppercase">
                                            {selectedPrintOrder.paymentMethod === 'cash' ? 'Cash' :
                                                selectedPrintOrder.paymentMethod === 'bank_transfer' ? 'Bank Transfer' :
                                                    selectedPrintOrder.paymentMethod === 'ewallet' ? 'E-Wallet' :
                                                        selectedPrintOrder.paymentMethod === 'cheque' ? 'Cheque' :
                                                            (selectedPrintOrder.paymentMethod || 'Cash')}
                                        </span>

                                        <span className="text-slate-500 font-medium">Driver:</span>
                                        <span className="font-bold text-slate-900">
                                            {selectedPrintOrder.driverId ? 'Assigned' : 'Unassigned'}
                                        </span>

                                        <span className="text-slate-500 font-medium">Status:</span>
                                        <span className="font-bold text-slate-900 uppercase tracking-wider">{selectedPrintOrder.status}</span>
                                    </div>

                                    {(selectedPrintOrder as any).remark && (
                                        <div className="mt-6 border-t border-slate-100 pt-6">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-1">Remarks</span>
                                            <p className="text-sm print:text-xs font-medium text-slate-800">{(selectedPrintOrder as any).remark}</p>
                                        </div>
                                    )}
                                </div>

                                {/* 右侧：总合计 */}
                                <div className="w-full sm:w-64 shrink-0">
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                            <span>Subtotal</span>
                                            <span className="font-mono">RM {selectedPrintOrder.amount?.toFixed(2) || '0.00'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                            <span>Tax (0%)</span>
                                            <span className="font-mono">RM 0.00</span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                                            <span className="text-sm print:text-xs font-black text-slate-900 uppercase tracking-wider">Total</span>
                                            <span className="text-2xl print:text-xl font-black text-slate-900 font-mono">RM {selectedPrintOrder.amount?.toFixed(2) || '0.00'}</span>
                                        </div>
                                    </div>

                                    <div className="text-center mt-6 text-[10px] text-slate-400 space-y-1">
                                        <p>Thank you for choosing Kim Long.</p>
                                        <p>This is a computer-generated document. No signature is required.</p>
                                    </div>
                                </div>
                            </div>

                            {/* 操作按钮 (不打印) */}
                            <div className="flex gap-3 no-print-area mt-8">
                                <button
                                    onClick={() => window.print()}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
                                >
                                    <span className="material-icons-round text-[18px]">print</span>
                                    Print Customer Bill
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersPage;
