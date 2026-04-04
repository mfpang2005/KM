import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order } from '../types';
import { OrderStatus } from '../types';
import { PageHeader } from '../components/PageHeader';
import { NotificationBell } from '../components/NotificationBell';

export const OrdersPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [dateFilter, setDateFilter] = useState<string>(searchParams.get('date') || 'all');
    const [eventDate, setEventDate] = useState<string>(searchParams.get('eventDate') || '');
    const [isHeaderCompact, setIsHeaderCompact] = useState(false);

    // Sync state with URL parameters when they change
    useEffect(() => {
        const status = searchParams.get('status');
        const search = searchParams.get('search');
        const date = searchParams.get('date');
        const eDate = searchParams.get('eventDate');
        const isReset = searchParams.get('reset') === 'true';
        const isCreate = searchParams.get('create') === 'true';

        if (isReset) {
            setStatusFilter('all');
            setSearchQuery('');
            setDateFilter('all');
            setEventDate('');
        } else if (isCreate) {
            navigate('/create-order');
        } else {
            if (status) setStatusFilter(status);
            if (search !== null) setSearchQuery(search);
            if (date) setDateFilter(date);
            if (eDate !== null) setEventDate(eDate || '');
        }
    }, [searchParams]);

    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [flashOrderId, setFlashOrderId] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [selectedPrintOrder, setSelectedPrintOrder] = useState<Order | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 12;

    // Modal States
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
    const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadOrders = useCallback(async () => {
        try {
            const params: any = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            if (eventDate) params.event_date = eventDate;
            
            const response = await api.get('/orders', { params });
            setOrders(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Failed to load orders', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, eventDate]);

    useEffect(() => {
        const findScrollContainer = () => {
            let el = document.querySelector('main .overflow-y-auto');
            if (!el) el = document.querySelector('.overflow-y-auto');
            return el;
        };

        const scrollContainer = findScrollContainer();
        if (!scrollContainer) return;

        const handleScroll = () => {
            setIsHeaderCompact(scrollContainer.scrollTop > 80);
        };

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        loadOrders();

        let timeoutId: ReturnType<typeof setTimeout>;

        const channel = supabase
            .channel('orders-page-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        loadOrders();
                    }, 1500);
                }
            )
            .subscribe((status, err) => {
                if (err) console.log(`[Realtime Orders] Status: ${status}, Error:`, err);
            });
        
        return () => {
            clearTimeout(timeoutId);
            supabase.removeChannel(channel);
        };
    }, [loadOrders]);

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

    // Handle Drill-down Highlighting and Auto-scroll
    useEffect(() => {
        const highlightId = searchParams.get('highlightOrder');
        if (!highlightId || loading || orders.length === 0) return;

        const orderIndex = filteredOrders.findIndex(o => (o.id === highlightId) || (o.order_number === highlightId));
        if (orderIndex === -1) {
            // Not found in current filter - Reset filters to ensure targeted order is visible
            setStatusFilter('all');
            setSearchQuery('');
            setDateFilter('all');
            setEventDate('');
            return;
        }

        const targetPage = Math.ceil((orderIndex + 1) / pageSize);
        if (currentPage !== targetPage) {
            setCurrentPage(targetPage);
            return;
        }

        setFlashOrderId(highlightId);
        
        const scrollTimer = setTimeout(() => {
            const element = document.getElementById(`order-row-${highlightId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 600);

        const timer = setTimeout(() => {
            setFlashOrderId(null);
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('highlightOrder');
            const searchStr = newParams.toString();
            navigate(`/orders${searchStr ? `?${searchStr}` : ''}`, { replace: true });
        }, 5000);

        return () => {
            clearTimeout(scrollTimer);
            clearTimeout(timer);
        };
    }, [searchParams, loading, orders.length, currentPage, filteredOrders.length]);

    const handleEditClick = (order: Order) => {
        navigate(`/create-order?id=${order.id}`);
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
        } catch (error: any) {
            console.error('Failed to delete order', error);
            const errMsg = error.response?.data?.detail || error.message || 'Unknown error';
            alert(`Failed to delete order: ${errMsg}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleInlineStatusChange = async (orderId: string, newStatus: string) => {
        try {
            await api.post(`/orders/${orderId}/status?status=${newStatus}`);
            await loadOrders();
        } catch (error: any) {
            console.error('Failed to update order status inline', error);
            const errorMsg = error.response?.data?.detail || error.message || 'Unknown Error';
            alert(`状态更新失败 / Status update failed: ${errorMsg}`);
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

    const totalPages = Math.ceil(filteredOrders.length / pageSize);
    const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, dateFilter, eventDate]);

    return (
        <div className="mt-10 mx-auto max-w-[1600px] px-4 pb-20">
            <PageHeader
                title="Order Status / 订单状态"
                subtitle="Manage all incoming tasks and dispatches"
                showStats={false}
                actions={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => navigate('/create-order')}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"
                            >
                                <span className="material-icons-round text-[18px]">add</span>
                                <span className="hidden lg:inline">New Order</span>
                            </button>

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

                            <div className="flex items-center gap-2">
                                <div className="relative flex items-center bg-white/50 backdrop-blur border border-slate-200 rounded-xl px-3 py-2 group focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                    <span className="material-icons-round text-slate-400 text-[16px] mr-2">event</span>
                                    <input
                                        type="date"
                                        value={eventDate}
                                        onChange={(e) => setEventDate(e.target.value)}
                                        className="bg-transparent border-none p-0 text-sm font-bold text-slate-600 focus:ring-0 outline-none uppercase tracking-tighter"
                                        title="Filter by Event Date"
                                    />
                                    {eventDate && (
                                        <button 
                                            onClick={() => setEventDate('')} 
                                            className="ml-2 text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <span className="material-icons-round text-[16px]">cancel</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <NotificationBell />
                        </div>
                    </div>
                }
            />

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm relative">
                <div className="h-[75vh] min-h-[500px] overflow-y-auto custom-scrollbar scroll-smooth relative">
                    <table className="w-full text-left border-collapse min-w-max table-auto">
                        <thead className={`sticky z-20 bg-slate-50/95 backdrop-blur-md shadow-sm border-b border-slate-200 transition-all duration-300 ${isHeaderCompact ? 'top-[-1px]' : 'top-0'}`}>
                            <tr className="text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                                <th className="px-6 py-4 whitespace-nowrap">Order ID</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Total Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Event Date</th>
                                <th className="px-6 py-4">Created At</th>
                                <th className="px-6 py-4">Photos</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                    </td>
                                </tr>
                            ) : paginatedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">No matching orders found.</td>
                                </tr>
                            ) : (
                                paginatedOrders.map(order => (
                                    <React.Fragment key={order.id}>
                                        <tr 
                                            id={`order-row-${order.id}`}
                                            className={`hover:bg-slate-50 transition-all duration-500 group ${flashOrderId === order.id ? 'highlight-order-row' : ''}`}
                                        >
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
                                            <td className="px-6 py-4 text-xs font-bold text-indigo-600 whitespace-nowrap">
                                                {order.eventDate ? (
                                                    <div className="flex flex-col">
                                                        <span>{order.eventDate}</span>
                                                        <span className="text-[10px] text-indigo-400">{order.eventTime || ''}</span>
                                                    </div>
                                                ) : order.dueTime ? (
                                                    new Date(order.dueTime).toLocaleString('en-MY', { 
                                                        year: 'numeric', 
                                                        month: 'numeric', 
                                                        day: 'numeric', 
                                                        hour: '2-digit', 
                                                        minute: '2-digit', 
                                                        hour12: false 
                                                    })
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                                                {order.created_at ? new Date(order.created_at).toLocaleString('en-MY', {
                                                    month: 'numeric',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: false
                                                }) : '-'}
                                            </td>
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

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-4">
                        <span>Total Items: {filteredOrders.length}</span>
                        <div className="h-3 w-px bg-slate-200" />
                        <span className="text-slate-800">
                            Total RM: <span className="text-blue-600 font-mono text-sm ml-1">RM {filteredOrders.reduce((sum, o) => sum + (o.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </span>
                    </div>
                </div>

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

            {selectedPrintOrder && (
                <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 sm:items-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in print:bg-white print:p-0 print:items-start print:justify-start">
                    <style>{`
                        @page { size: A4 portrait; margin: 10mm; }
                        @media print {
                            body * { visibility: hidden; }
                            #printable-order-wrapper, #printable-order-wrapper * { visibility: visible; }
                            #printable-order-wrapper { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-height: none !important; overflow: visible !important; background: white !important; }
                            #printable-order { width: 100% !important; max-width: 100% !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; }
                            .no-print-area, .no-print-area * { display: none !important; }
                            table { page-break-inside: auto; }
                            tr { page-break-inside: avoid; page-break-after: auto; }
                            thead { display: table-header-group; }
                            tfoot { display: table-footer-group; }
                            .bg-slate-50 { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-blue-50 { background-color: #eff6ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-violet-50 { background-color: #f5f3ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-amber-50 { background-color: #fffbeb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    `}</style>
                    <div id="printable-order-wrapper" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-transparent print:max-h-none print:overflow-visible">
                        <div className="bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden relative mx-auto print:rounded-none print:shadow-none print:border-none" id="printable-order">
                            <button onClick={() => setSelectedPrintOrder(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors z-10 no-print-area">
                                <span className="material-icons-round text-[18px]">close</span>
                            </button>
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 text-white text-center no-print-area">
                                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                                    <span className="material-icons-round text-3xl">receipt_long</span>
                                </div>
                                <h2 className="text-xl font-black">Order Details</h2>
                                <p className="text-blue-100 text-xs mt-1 font-bold uppercase tracking-widest">Receipt</p>
                            </div>
                            <div className="p-8 print:p-0 space-y-6 print:space-y-4 max-w-3xl mx-auto font-sans">
                                <div className="text-center pb-6 border-b-2 border-slate-800 flex flex-col items-center">
                                    <img src="/print-logo.png" alt="Kim Long Logo" className="w-48 h-auto print:w-40 mb-3 shadow-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    <h1 className="text-2xl print:text-xl font-black text-slate-900 tracking-tight">KIM LONG CATERING SDN BHD</h1>
                                    <p className="text-sm print:text-xs text-slate-600 font-bold mt-1">1519675-T</p>
                                    <div className="text-sm print:text-[11px] text-slate-500 font-medium leading-tight mt-2 space-y-0.5">
                                        <p>NO 120&121, JALAN SENAI UTAMA</p>
                                        <p>TAMAN SENAI UTAMA 5/17</p>
                                        <p>81400, SENAI, JOHOR.</p>
                                    </div>
                                    <p className="text-xs print:text-[10px] text-blue-600 font-black tracking-widest mt-4 uppercase bg-blue-50 px-3 py-1 rounded-md">CUSTOMER BILL</p>
                                </div>
                                <div className="flex flex-col md:flex-row justify-between gap-6 print:gap-4 pb-4">
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
                                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(selectedPrintOrder.id)}&bgcolor=ffffff&color=0f172a&margin=0`} alt="Order QR Code" className="w-16 h-16 border border-slate-200 p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        </div>
                                    </div>
                                </div>
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
                                                    <td className="py-3 px-2 text-center align-top"><span className="font-black text-slate-900">{item.quantity}</span></td>
                                                    <td className="py-3 px-2 text-right text-slate-600 font-mono align-top">
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-bold text-slate-900">RM {item.price ? Number(item.price).toFixed(2) : '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pl-2 text-right font-black text-slate-900 font-mono align-top">RM {item.price ? (Number(item.price) * item.quantity).toFixed(2) : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {selectedPrintOrder.equipments && Object.keys(selectedPrintOrder.equipments).length > 0 && (
                                    <div className="pt-2">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Equipments / Materials</h3>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {Object.entries(selectedPrintOrder.equipments).filter(([_, qty]) => Number(qty) > 0).map(([name, qty]) => (
                                                <span key={name} className="text-sm print:text-xs font-bold text-slate-700 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>{name}<span className="text-slate-500 font-normal ml-1">× {qty}</span></span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-6 border-t border-slate-200 mt-6 page-break-avoid">
                                    <div className="flex-1 space-y-3 w-full sm:w-auto">
                                        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm print:text-xs">
                                            <span className="text-slate-500 font-medium">Payment:</span>
                                            <span className="font-bold text-slate-900 uppercase">{selectedPrintOrder.paymentMethod || 'Cash'}</span>
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
                                    <div className="w-full sm:w-64 shrink-0">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                                            <div className="flex justify-between items-center text-sm print:text-xs text-slate-600"><span>Subtotal</span><span className="font-mono">RM {selectedPrintOrder.amount?.toFixed(2) || '0.00'}</span></div>
                                            <div className="flex justify-between items-center text-sm print:text-xs text-slate-600"><span>Tax (0%)</span><span className="font-mono">RM 0.00</span></div>
                                            <div className="pt-2 border-t border-slate-200 flex justify-between items-center"><span className="text-sm print:text-xs font-black text-slate-900 uppercase tracking-wider">Total</span><span className="text-2xl print:text-xl font-black text-slate-900 font-mono">RM {selectedPrintOrder.amount?.toFixed(2) || '0.00'}</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3 no-print-area mt-8">
                                    <button onClick={() => window.print()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30">
                                        <span className="material-icons-round text-[18px]">print</span>Print Customer Bill
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

export default OrdersPage;
