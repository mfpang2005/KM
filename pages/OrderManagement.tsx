
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order, OrderStatus, OrderItem, PaymentMethod } from '../types';

// NOTE: 不再使用 MOCK_PRODUCTS，改用从后端动态获取的真实产品列表

// Mock drivers for assignment (保留，后续替换为真实司机数据)
const MOCK_DRIVERS = [
    { id: 'ali', name: 'Ali Ahmad', status: '可选', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCr1A0UkYD47bPyjINVhOMMiB-pdO6Vk9GkIst7TGBPcENh6mor-beIE0m-zai1jb8ISvg0dfAHur75hz38kljvdLDYDhZL-2ExznnuKSVz_DC0ZJEAL2uTdFO5HUVg3AYRyECUgerFv4RSqf8DUrKNHpID4Dd5JhD0TnTCZbd2A9ZDW4MCHQT65EjZTHjvSdZf_OqT0CAh_1IQOS7JVmm59EG9tT5QDfeexTdpUkUFKHXXnZwE66rkmWOuJ0Q7WWSPtN1nUcxBxRf' },
    { id: 'tan', name: 'Tan Wei', status: '附近', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDLlyYiZxjedNYrM_16MJem_-z8phukD8Y0feARWqrmek1SnFPW4HVi7sm7VddsZtD-UU756Kogt_EUqpzfEUqXDDKMI3s2g6IxxLz3NBeqHkMSSCG0Cf-z3HYu02DWkNOFWb-bA9YVclQyaW35kBs0WTXA2ImEqpPqbRazqVCsx-z2c2OHILM7zBpNigWz9_gIcnizGf9SOcVa0elsIXsnl6J_ZOWF6G9MeORyCWaoUvIAua6w0WMg-Z4HRcPizWY5q-0CMfhjjIz8' }
];

const INITIAL_ORDERS: Order[] = [
    { id: 'KL-468167', customerName: 'Alice Wong', customerPhone: '012-3456789', address: 'KL Sentral, Kuala Lumpur', items: [{ id: '1', name: 'Nasi Lemak Special', quantity: 20 }], status: OrderStatus.DELIVERING, amount: 240.00, dueTime: '12:30 PM', type: 'delivery', driverId: 'ali', paymentMethod: PaymentMethod.CASH },
    { id: 'KL-468168', customerName: 'Penang Conf', customerPhone: '019-8765432', address: 'Bangsar South', items: [{ id: '2', name: 'Chicken Satay (10)', quantity: 5 }], status: OrderStatus.PREPARING, amount: 75.00, dueTime: '01:00 PM', type: 'delivery', paymentMethod: PaymentMethod.BANK_TRANSFER },
    { id: 'KL-468169', customerName: 'John Doe', customerPhone: '017-2233445', address: 'Taman Melawati', items: [{ id: '1', name: 'Nasi Lemak Special', quantity: 2 }], status: OrderStatus.COMPLETED, amount: 24.00, dueTime: '11:00 AM', type: 'delivery', driverId: 'tan', paymentMethod: PaymentMethod.EWALLET },
];

import { OrderService, ProductService } from '../src/services/api';
import type { Product } from '../types';
import { getGoogleMapsUrl } from '../src/utils/maps';
import { supabase } from '../src/lib/supabase';
import PullToRefresh from '../src/components/PullToRefresh';

const OrderManagement: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [realProducts, setRealProducts] = useState<Product[]>([]);

    useEffect(() => {
        loadOrders();
        loadProducts();

        const channel = supabase
            .channel('app-order-management')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                loadOrders(); // Auto-refresh when an order is updated in SuperAdmin
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
                loadOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    /**
     * 从后端加载真实产品列表，用于扫码/编号搜索
     */
    const loadProducts = async () => {
        try {
            const data = await ProductService.getAll();
            setRealProducts(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load products for scan search', error);
        }
    };

    const loadOrders = async () => {
        try {
            setIsLoading(true);
            const data = await OrderService.getAll();
            const sorted = data.sort((a: any, b: any) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
            setOrders(sorted as any);
        } catch (error) {
            console.error("Failed to load orders", error);
            // Fallback to initial mock data if backend fails/empty for demo purposes
            if (orders.length === 0) setOrders(INITIAL_ORDERS as any);
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

    // Filter & Pagination state
    const [dateFilter, setDateFilter] = useState<'all' | 'today'>('all'); // 默认显示全部，或根据用户习惯设为 today
    const [currentPage, setCurrentPage] = useState(1);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const pageSize = 10;

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-yellow-50 text-yellow-600 border border-yellow-200',
        [OrderStatus.PREPARING]: 'bg-blue-50 text-blue-600 border border-blue-200',
        [OrderStatus.READY]: 'bg-cyan-50 text-cyan-600 border border-cyan-200',
        [OrderStatus.DELIVERING]: 'bg-purple-50 text-purple-600 border border-purple-200',
        [OrderStatus.COMPLETED]: 'bg-green-50 text-green-600 border border-green-200',
        delayed: 'bg-red-50 text-red-600 border border-red-200',
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

            let matchesDate = true;
            if (dateFilter === 'today') {
                const today = new Date().toDateString();
                // 优先检查活动时间 dueTime，其次是创建时间
                const orderDateValue = order.dueTime || (order as any).created_at;
                if (orderDateValue) {
                    const orderDate = new Date(orderDateValue).toDateString();
                    matchesDate = today === orderDate;
                } else {
                    matchesDate = false;
                }
            }

            return matchesTab && matchesSearch && matchesDate;
        });
    }, [orders, tab, searchQuery, dateFilter]);

    const totalPages = Math.ceil(filteredOrders.length / pageSize);
    const paginatedOrders = useMemo(() => {
        return filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [filteredOrders, currentPage]);

    // 重置分页
    useEffect(() => {
        setCurrentPage(1);
    }, [tab, searchQuery, dateFilter]);

    const handleDownloadPDF = (order: Order) => {
        setPrintingOrder(order);
    };

    const handleShareToWhatsApp = (order: Order) => {
        const phone = order.customerPhone.replace(/\D/g, '');
        const itemsList = order.items.map(item => `- ${item.name} x ${item.quantity}`).join('\n');

        const message = `[KIM LONG CATERING]\n你好 ${order.customerName}, 您的订单 ${order.id} 已确认。\n\n详情:\n${itemsList}\n\n总计: RM ${order.amount.toFixed(2)}\n预计送达: ${order.dueTime || '-'}`;

        // If phone is valid, send directly, otherwise open whatsapp to choose contact
        if (phone && phone.length >= 10) {
            window.open(`https://wa.me/60${phone.replace(/^60/, '').replace(/^0/, '')}?text=${encodeURIComponent(message)}`, '_blank');
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        }
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
        const newAmount = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * item.quantity), 0);
        setEditingOrder({ ...editingOrder, items: newItems, amount: newAmount });
    };

    const removeEditItem = (id: string) => {
        if (!editingOrder) return;
        const newItems = editingOrder.items.filter(item => item.id !== id);
        const newAmount = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * item.quantity), 0);
        setEditingOrder({ ...editingOrder, items: newItems, amount: newAmount });
    };

    const addEditItemByProduct = (product: Product) => {
        if (!editingOrder) return;
        const existing = editingOrder.items.find(i => i.id === product.id);
        if (existing) {
            updateEditItemQty(product.id, 1);
        } else {
            const newItems = [...editingOrder.items, { 
                id: product.id, 
                name: product.name, 
                quantity: 1, 
                price: product.price // Using current product price as default
            }];
            const newAmount = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * item.quantity), 0);
            setEditingOrder({
                ...editingOrder,
                items: newItems,
                amount: newAmount
            });
        }
    };

    const updateEditItemPrice = (id: string, newPrice: number) => {
        if (!editingOrder) return;
        const newItems = editingOrder.items.map(item => {
            if (item.id === id) {
                return { ...item, price: newPrice };
            }
            return item;
        });
        const newAmount = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * item.quantity), 0);
        setEditingOrder({ ...editingOrder, items: newItems, amount: newAmount });
    };

    /**
     * 通过产品编号或名称搜索，支持模糊匹配（替换原来的 MOCK_PRODUCTS 硬编码）
     */
    const handleAddByCode = () => {
        if (!scanCode.trim()) return;
        const query = scanCode.trim().toLowerCase();
        // 优先精确匹配 code，其次模糊匹配 name
        const product = realProducts.find(p =>
            (p.code && p.code.toLowerCase() === query) ||
            p.name.toLowerCase().includes(query)
        );
        if (product) {
            addEditItemByProduct(product);
            setScanCode('');
            setScanError(false);
        } else {
            setScanError(true);
        }
    };

    // 扫码输入时的实时建议列表
    const scanSuggestions = useMemo(() => {
        if (!scanCode.trim() || scanCode.trim().length < 1) return [];
        const query = scanCode.trim().toLowerCase();
        return realProducts.filter(p =>
            (p.code && p.code.toLowerCase().includes(query)) ||
            p.name.toLowerCase().includes(query)
        ).slice(0, 5);
    }, [scanCode, realProducts]);

    return (
        <div className="flex flex-col h-full bg-[#f8f6f6] relative">
            {/* Print Template */}
            {/* Print Template Preview Modal */}
            {printingOrder && (
                <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-transparent animate-in zoom-in duration-200">
                    <style>{`
                        @media print {
                            @page { size: auto; margin: 5mm; }
                            body * { visibility: hidden; }
                            html, body {
                                height: auto !important;
                                min-height: auto !important;
                                overflow: visible !important;
                                background-color: white !important;
                            }
                            #printable-order, #printable-order * {
                                visibility: visible;
                                color: black !important;
                            }
                            #printable-order-wrapper {
                                position: absolute !important;
                                left: 0 !important;
                                top: 0 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                width: 100% !important;
                                max-height: none !important;
                                overflow: visible !important;
                                background: white !important;
                            }
                            #printable-order {
                                width: 100% !important;
                                max-width: 100% !important;
                                box-shadow: none !important;
                                border: none !important;
                                border-radius: 0 !important;
                                margin: 0 !important;
                                padding: 0 !important;
                            }
                            .no-print-area, .no-print-area * {
                                display: none !important;
                            }
                            table { page-break-inside: auto; }
                            tr { page-break-inside: avoid; page-break-after: auto; }
                            thead { display: table-header-group; }
                            tfoot { display: table-footer-group; }
                            .bg-slate-50 { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .bg-blue-50 { background-color: #eff6ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    `}</style>
                    <div id="printable-order-wrapper" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-transparent print:max-h-none print:overflow-visible">
                        <div className="bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden relative mx-auto print:rounded-none print:shadow-none print:border-none" id="printable-order">

                            {/* 关闭按钮 (不可打印) */}
                            <button
                                onClick={() => setPrintingOrder(null)}
                                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors z-10 no-print-area"
                            >
                                <span className="material-icons-round text-[18px]">close</span>
                            </button>

                            {/* 标题 */}
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 text-white text-center no-print-area pt-10">
                                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                                    <span className="material-icons-round text-3xl">receipt_long</span>
                                </div>
                                <h2 className="text-xl font-black">Order Details</h2>
                                <p className="text-blue-100 text-xs mt-1 font-bold uppercase tracking-widest">Receipt</p>
                            </div>

                            <div className="p-8 print:p-0 space-y-6 print:space-y-4 max-w-3xl mx-auto font-sans">
                                {/* 收据公司标头（打印时显示）*/}
                                <div className="text-center pb-6 border-b-2 border-slate-800 flex flex-col items-center mt-6 print:mt-0">
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
                                            <span className="font-bold text-slate-900">{printingOrder.customerName || '-'}</span>

                                            <span className="text-slate-500 font-medium">Phone:</span>
                                            <span className="font-bold text-slate-900 font-mono">{printingOrder.customerPhone || '-'}</span>

                                            <span className="text-slate-500 font-medium">Address:</span>
                                            <span className="font-bold text-slate-900 leading-snug">{printingOrder.address || 'Self Pickup'}</span>
                                        </div>
                                    </div>

                                    {/* 右侧：订单信息 & QR */}
                                    <div className="flex gap-4 sm:justify-end">
                                        <div className="space-y-2 flex-grow sm:flex-grow-0 min-w-[200px]">
                                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 text-right">Order Details</h3>
                                            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm print:text-xs text-right">
                                                <span className="text-slate-500 font-medium">Order Ref:</span>
                                                <span className="font-black text-slate-900 font-mono">{printingOrder.id}</span>

                                                <span className="text-slate-500 font-medium">Created:</span>
                                                <span className="font-bold text-slate-700">{(printingOrder as any).created_at ? new Date((printingOrder as any).created_at).toLocaleString('en-MY', { hour12: false }) : '-'}</span>

                                                <span className="text-slate-500 font-medium">Event Time:</span>
                                                <span className="font-bold text-slate-900">{printingOrder.dueTime ? new Date(printingOrder.dueTime).toLocaleString('en-MY', { hour12: false }) : '-'}</span>
                                            </div>
                                        </div>

                                        <div className="shrink-0 pt-1">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(printingOrder.id)}&bgcolor=ffffff&color=0f172a&margin=0`}
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
                                            {printingOrder.items?.map((item: any, idx: number) => (
                                                <tr key={idx} className="group">
                                                    <td className="py-3 pr-2">
                                                        <p className="font-bold text-slate-900">{item.name}</p>
                                                        {item.code && <p className="text-xs text-slate-500 font-mono mt-0.5">Item Code: {item.code}</p>}
                                                        {item.note && <p className="text-xs text-slate-500 italic mt-0.5">Note: {item.note}</p>}
                                                    </td>
                                                    <td className="py-3 px-2 text-center align-top">
                                                        <span className="font-black text-slate-900">{item.quantity}</span>
                                                    </td>
                                                    <td className="py-3 px-2 text-right text-slate-600 font-mono align-top">RM {item.price ? Number(item.price).toFixed(2) : '-'}</td>
                                                    <td className="py-3 pl-2 text-right font-black text-slate-900 font-mono align-top">RM {item.price ? (Number(item.price) * item.quantity).toFixed(2) : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* 设备 / 物资 */}
                                {(printingOrder as any).equipments && Object.keys((printingOrder as any).equipments).length > 0 && (
                                    <div className="pt-2">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Equipments / Materials</h3>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {Object.entries((printingOrder as any).equipments)
                                                .filter(([_, qty]) => Number(qty) > 0)
                                                .map(([name, qty]) => (
                                                    <span key={name} className="text-sm print:text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                        {name}
                                                        <span className="text-slate-500 font-normal ml-1">× {qty as string}</span>
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
                                                {printingOrder.paymentMethod === 'cash' ? 'Cash' :
                                                    printingOrder.paymentMethod === 'bank_transfer' ? 'Bank Transfer' :
                                                        printingOrder.paymentMethod === 'ewallet' ? 'E-Wallet' :
                                                            printingOrder.paymentMethod === 'cheque' ? 'Cheque' :
                                                                (printingOrder.paymentMethod || 'Cash')}
                                            </span>

                                            <span className="text-slate-500 font-medium">Driver:</span>
                                            <span className="font-bold text-slate-900">
                                                {printingOrder.driverId ? (MOCK_DRIVERS.find(d => d.id === printingOrder.driverId)?.name || 'Assigned') : 'Unassigned'}
                                            </span>

                                            <span className="text-slate-500 font-medium">Status:</span>
                                            <span className="font-bold text-slate-900 uppercase tracking-wider">{printingOrder.status}</span>
                                        </div>

                                        {(printingOrder as any).remarks && (
                                            <div className="mt-4 p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50/50">
                                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-1">Remarks</span>
                                                <p className="text-sm print:text-xs font-medium text-slate-800">{(printingOrder as any).remarks}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* 右侧：总合计 */}
                                    <div className="w-full sm:w-64 shrink-0">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                                            <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                                <span>Subtotal</span>
                                                <span className="font-mono">RM {printingOrder.amount?.toFixed(2) || '0.00'}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                                <span>Tax (0%)</span>
                                                <span className="font-mono">RM 0.00</span>
                                            </div>
                                            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                                                <span className="text-sm print:text-xs font-black text-slate-900 uppercase tracking-wider">Total</span>
                                                <span className="text-2xl print:text-xl font-black text-slate-900 font-mono">RM {printingOrder.amount?.toFixed(2) || '0.00'}</span>
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
                                        onClick={() => {
                                            const originalTitle = document.title;
                                            document.title = `Order_${printingOrder.id}`;
                                            window.print();
                                            document.title = originalTitle;
                                        }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
                                    >
                                        <span className="material-icons-round text-[18px]">print</span>
                                        Print Customer Bill
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="pt-12 pb-6 px-6 bg-white flex flex-col gap-6 sticky top-0 z-30 no-print shadow-sm">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/admin')} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-full active:scale-90 transition-transform">
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">订单管理</h1>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Order Management Flow</p>
                        </div>
                    </div>
                    
                    {/* Date Filters (Aligned with Backend logic) */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl shrink-0">
                        <button 
                            onClick={() => setDateFilter('today')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${dateFilter === 'today' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                        >
                            今日
                        </button>
                        <button 
                            onClick={() => setDateFilter('all')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${dateFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                        >
                            全部
                        </button>
                    </div>
                </div>

                <div className="relative group">
                    <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors">search</span>
                    <input
                        type="text"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-200"
                        placeholder="搜索客户姓名、电话或订单编号..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-white px-6 flex gap-8 border-b border-slate-50 overflow-x-auto no-scrollbar sticky top-[168px] z-20 no-print shadow-sm">
                {['all', ...Object.values(OrderStatus)].map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t as any)}
                        className={`py-4 text-[11px] font-black whitespace-nowrap transition-all relative ${tab === t ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {t === 'all' ? '全部订单' : statusLabels[t as OrderStatus]}
                        {tab === t && (
                            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full animate-in slide-in-from-bottom-1 duration-300"></div>
                        )}
                    </button>
                ))}
            </div>

            {/* List */}
            <main className="flex-1 relative overflow-hidden pb-4 no-print bg-[#f8f6f6]">
                <PullToRefresh onRefresh={loadOrders}>
                    <div className="p-6 space-y-6 min-h-full pb-32">
                        {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="bg-white p-6 rounded-[32px] shadow-sm flex flex-col gap-5 border border-slate-100 animate-pulse">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3.5 h-3.5 rounded-full bg-slate-100" />
                                                <div className="w-32 h-6 bg-slate-100 rounded-lg" />
                                            </div>
                                            <div className="w-48 h-3 bg-slate-100 rounded-md ml-6" />
                                        </div>
                                        <div className="w-16 h-6 bg-slate-100 rounded-lg" />
                                    </div>
                                    <div className="bg-slate-50 p-6 rounded-[24px] space-y-3">
                                        <div className="w-full h-3 bg-slate-100 rounded-md" />
                                        <div className="w-2/3 h-3 bg-slate-100 rounded-md" />
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <div className="w-24 h-8 bg-slate-100 rounded-lg" />
                                        <div className="flex gap-2">
                                            <div className="w-10 h-10 bg-slate-100 rounded-full" />
                                            <div className="w-10 h-10 bg-slate-100 rounded-full" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : paginatedOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-slate-200">
                                <span className="material-icons-round text-7xl opacity-20">receipt_long</span>
                                <p className="text-sm font-black mt-4 uppercase tracking-widest text-slate-300">暂无匹配订单</p>
                                <button
                                    onClick={() => { setTab('all'); setSearchQuery(''); setDateFilter('all'); }}
                                    className="mt-6 px-6 py-3 bg-white text-slate-400 font-bold text-xs rounded-2xl shadow-sm border border-slate-100 active:scale-95 transition-all"
                                >
                                    清除所有过滤器
                                </button>
                            </div>
                        ) : (
                            paginatedOrders.map(order => (
                                <div
                                    key={order.id}
                                    className="bg-white p-6 rounded-[32px] shadow-sm flex flex-col gap-5 animate-in fade-in zoom-in duration-300 border border-slate-100 hover:shadow-md hover:border-slate-200/60 transition-all group"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${['completed', 'ready'].includes(order.status) ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : ['preparing', 'delivering'].includes(order.status) ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)] animate-pulse' : 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]'}`} />
                                                <h3 className="text-lg font-black text-slate-900 tracking-tight">{order.customerName}</h3>
                                            </div>
                                            <div className="flex items-center gap-1.5 pl-6">
                                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{order.order_number || order.id}</span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                                <span className="text-[10px] font-bold text-slate-400">{order.dueTime ? new Date(order.dueTime).toLocaleString('zh-CN', { hour12: false }) : (order as any).created_at ? new Date((order as any).created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}</span>
                                            </div>
                                        </div>
                                        
                                        {/* Inline Status Dropdown (Aligned with Backend) */}
                                        <div className="relative">
                                            <select
                                                value={order.status}
                                                onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderStatus)}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider outline-none appearance-none cursor-pointer border hover:scale-105 transition-all shadow-sm ${(statusColors as any)[order.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 4px center', backgroundRepeat: 'no-repeat' }}
                                            >
                                                {Object.values(OrderStatus).map(st => (
                                                    <option key={st} value={st}>{statusLabels[st]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Items List Snapshot */}
                                    <div className="bg-[#f8f9fa] p-5 rounded-[24px] space-y-2 border border-slate-50">
                                        {order.items.slice(0, 3).map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-[13px] font-bold text-slate-700">
                                                <span className="truncate max-w-[200px]">{item.name}</span>
                                                <span className="text-slate-400 font-black shrink-0 ml-2">x{item.quantity}</span>
                                            </div>
                                        ))}
                                        {order.items.length > 3 && (
                                            <p className="text-[10px] text-slate-400 font-black text-center mt-2 uppercase tracking-wide">... 及其他 {order.items.length - 3} 项项目</p>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto pt-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1.5">结算总额</span>
                                            <span className="text-2xl font-black text-primary leading-none tracking-tight">RM {order.amount.toFixed(2)}</span>
                                        </div>
                                        <div className="flex gap-2.5">
                                            {/* Lightbox Trigger for Photos */}
                                            {order.delivery_photos && order.delivery_photos.length > 0 && (
                                                <button
                                                    onClick={() => setLightboxUrl(order.delivery_photos![0])}
                                                    className="w-11 h-11 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 active:scale-90 transition-all shadow-sm group/btn"
                                                >
                                                    <span className="material-icons-round text-xl group/btn:scale-110 transition-transform">photo_library</span>
                                                </button>
                                            )}
                                            
                                            <button
                                                onClick={() => handleOpenEdit(order)}
                                                className="w-11 h-11 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 transition-all shadow-sm"
                                            >
                                                <span className="material-icons-round text-[20px]">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleShareToWhatsApp(order)}
                                                className="w-11 h-11 bg-green-50 border border-green-100 rounded-2xl flex items-center justify-center text-green-500 active:scale-90 transition-all shadow-sm"
                                            >
                                                <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-5 h-5 opacity-80" alt="WA" />
                                            </button>
                                            <button
                                                onClick={() => handleDownloadPDF(order)}
                                                className="w-11 h-11 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-primary active:scale-90 transition-all shadow-sm"
                                            >
                                                <span className="material-icons-round text-[20px]">picture_as_pdf</span>
                                            </button>
                                            <button
                                                onClick={() => setOrderToDelete(order.id)}
                                                className="w-11 h-11 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-red-500 active:scale-90 transition-all shadow-sm"
                                            >
                                                <span className="material-icons-round text-[20px]">delete_outline</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </PullToRefresh>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md px-8 py-5 flex items-center justify-between border-t border-slate-50 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-20">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                            第 {currentPage} 页 / 共 {totalPages} 页
                        </span>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="w-12 h-12 flex items-center justify-center bg-slate-100 text-slate-400 rounded-2xl disabled:opacity-30 active:scale-90 transition-all"
                            >
                                <span className="material-icons-round">chevron_left</span>
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="w-12 h-12 flex items-center justify-center bg-slate-100 text-slate-400 rounded-2xl disabled:opacity-30 active:scale-90 transition-all"
                            >
                                <span className="material-icons-round">chevron_right</span>
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Lightbox Modal for Photos */}
            {lightboxUrl && (
                <div 
                    className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300"
                    onClick={() => setLightboxUrl(null)}
                >
                    <div className="relative max-w-full max-h-full flex flex-col items-center">
                        <img 
                            src={lightboxUrl} 
                            className="max-w-full max-h-[80vh] object-contain rounded-[32px] shadow-2xl animate-in zoom-in duration-300" 
                            alt="Order Proof" 
                        />
                        <button 
                            onClick={() => setLightboxUrl(null)}
                            className="mt-10 px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-sm transition-all active:scale-95"
                        >
                            关闭预览
                        </button>
                    </div>
                </div>
            )}

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
                                            className={`flex items-center gap-2.5 p-3.5 rounded-2xl border transition-all ${editingOrder.paymentMethod === pm.id
                                                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                                                : 'bg-slate-50 border-slate-100 text-slate-500'
                                                }`}
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

                            {/* 交付照片 (Delivery Photos) */}
                            {editingOrder.delivery_photos && editingOrder.delivery_photos.length > 0 && (
                                <section className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">交付凭证 (Proof of Delivery)</h3>
                                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                        {editingOrder.delivery_photos.map((url, idx) => (
                                            <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block w-24 h-24 shrink-0 rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm hover:border-primary transition-all group relative">
                                                <img src={url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" alt="Delivery Proof" />
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="material-icons-round text-white">zoom_in</span>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">指派/修改配送员</h3>
                                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                    {MOCK_DRIVERS.map((driver) => (
                                        <button
                                            key={driver.id}
                                            onClick={() => setEditingOrder({ ...editingOrder, driverId: driver.id })}
                                            className={`min-w-[120px] p-3 rounded-[24px] border transition-all flex flex-col items-center gap-2 ${editingOrder.driverId === driver.id
                                                ? 'bg-primary/5 border-primary shadow-md'
                                                : 'bg-slate-50 border-slate-100 shadow-sm'
                                                }`}
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
                                        className={`min-w-[120px] p-3 rounded-[24px] border transition-all flex flex-col items-center justify-center gap-2 ${!editingOrder.driverId
                                            ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                                            : 'bg-slate-50 border-slate-100 text-slate-400 shadow-sm'
                                            }`}
                                    >
                                        <span className="material-icons-round">person_off</span>
                                        <span className="text-[10px] font-bold">暂不指派</span>
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">订购项目管理 (扫码/编号)</h3>

                                <div className="space-y-3">
                                    <div className={`flex gap-2 p-1 bg-slate-100 rounded-2xl border-2 transition-all ${scanError ? 'border-red-500 animate-pulse' : 'border-transparent'}`}>
                                        <div className="flex-1 relative">
                                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">qr_code_scanner</span>
                                            <input
                                                className="w-full pl-9 pr-4 py-3 bg-transparent border-none rounded-xl text-xs font-bold focus:ring-0"
                                                placeholder="输入编号或名称搜索产品"
                                                value={scanCode}
                                                onChange={e => { setScanCode(e.target.value); setScanError(false); }}
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
                                    {/* 实时搜索建议列表 */}
                                    {scanSuggestions.length > 0 && (
                                        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                                            {scanSuggestions.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => { addEditItemByProduct(p); setScanCode(''); }}
                                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                                                >
                                                    <div className="flex-1 text-left">
                                                        <p className="text-xs font-bold text-slate-800">{p.name}</p>
                                                        <p className="text-[9px] text-slate-400 font-mono">{p.code || '-'}</p>
                                                    </div>
                                                    <span className="text-xs font-black text-primary">RM {(p.price || 0).toFixed(2)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {scanError && (
                                        <p className="text-[10px] font-bold text-red-500 pl-2">未找到匹配的产品，请检查编号或名称</p>
                                    )}
                                </div>

                                <div className="space-y-3 mt-4">
                                    {editingOrder.items.map((item) => (
                                        <div key={item.id} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
                                            <div className="flex-1">
                                                <h4 className="text-xs font-bold text-slate-800">{item.name}</h4>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Code: {realProducts.find(p => p.id === item.id)?.code || item.id}</p>
                                            </div>
                                                <div className="flex flex-col gap-1.5 min-w-[100px]">
                                                    <label className="text-[9px] font-bold text-slate-400 ml-1 uppercase">单价 (PRICE)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">RM</span>
                                                        <input 
                                                            type="number" 
                                                            className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                                            value={item.price || 0}
                                                            onChange={(e) => updateEditItemPrice(item.id, parseFloat(e.target.value) || 0)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[9px] font-bold text-slate-400 ml-1 uppercase text-center">数量</label>
                                                    <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-xl">
                                                        <button
                                                            onClick={() => updateEditItemQty(item.id, -1)}
                                                            className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90"
                                                        >
                                                            <span className="material-icons-round text-xs">remove</span>
                                                        </button>
                                                        <span className="text-xs font-black min-w-[20px] text-center">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateEditItemQty(item.id, 1)}
                                                            className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center active:scale-90"
                                                        >
                                                            <span className="material-icons-round text-xs">add</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => removeEditItem(item.id)}
                                                    className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center active:scale-90 transition-all self-end"
                                                >
                                                    <span className="material-icons-round text-xl">delete_outline</span>
                                                </button>
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
                                            className={`py-3.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${editingOrder.status === status
                                                ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20 scale-105 z-10'
                                                : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'
                                                }`}
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