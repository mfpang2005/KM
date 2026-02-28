import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProductService, AdminOrderService, SuperAdminService } from '../services/api';
import { supabase } from '../lib/supabase';
import { OrderStatus, PaymentMethod } from '../types';
import type { Product, OrderCreate, User } from '../types';

/** 购物车项目 */
interface CartItem {
    product: Product;
    quantity: number;
    note: string;
}

/** 订单确认快照 — 含全部可打印所需字段 */
interface ConfirmedOrderSnapshot {
    orderId: string;
    orderRef: string;
    total: number;
    customerName: string;
    customerPhone: string;
    address: string;
    mapsLink: string;
    remarks: string;
    eventDate: string;
    eventTime: string;
    payment: string;
    items: CartItem[];
    equipments: Record<string, number>;
    driverName: string;
    dueTime: string;
    createdAt: string;
}

/** 格式化订单号：ORD-YYYYMMDD-三位序号 */
const generateOrderRef = (): string => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(100 + Math.random() * 900)); // 100-999
    return `ORD-${date}-${seq}`;
};

const PAYMENT_OPTIONS = [
    { id: PaymentMethod.CASH, label: '现金 Cash', icon: 'payments' },
    { id: PaymentMethod.BANK_TRANSFER, label: '转账 Transfer', icon: 'account_balance' },
    { id: PaymentMethod.EWALLET, label: 'E-Wallet', icon: 'contactless' },
    { id: PaymentMethod.CHEQUE, label: '支票 Cheque', icon: 'receipt' },
];

const EQUIPMENT_LIST = [
    "设备 (可选数量)", "汤匙", "烤鸡网", "叉子", "垃圾袋",
    "Food Tong", "盘子", "红烧桶", "高盖", "杯子", "篮子", "铁脚架"
];

export const CreateOrderPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [address, setAddress] = useState('');
    const [mapsLink, setMapsLink] = useState('');
    const [remarks, setRemarks] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('');
    const [payment, setPayment] = useState<string>(PaymentMethod.CASH);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrderSnapshot | null>(null);
    const orderRef = useRef(generateOrderRef());

    // 新增状态
    const [equipments, setEquipments] = useState<Record<string, number>>(
        EQUIPMENT_LIST.reduce((acc, eq) => ({ ...acc, [eq]: 0 }), {})
    );
    const [drivers, setDrivers] = useState<User[]>([]);
    const [driversLoading, setDriversLoading] = useState(true);
    const [selectedDriverId, setSelectedDriverId] = useState<string | undefined>(undefined);

    // 加载产品和司机
    useEffect(() => {
        Promise.all([
            ProductService.getAll(),
            SuperAdminService.getUsers()
        ])
            .then(([productsData, usersData]) => {
                setProducts(productsData);
                setDrivers(usersData.filter(u => u.role === 'driver'));
            })
            .catch(err => console.error('Failed to load data', err))
            .finally(() => {
                setProductsLoading(false);
                setDriversLoading(false);
            });
    }, []);

    // NOTE: Supabase Realtime 监听 orders 表变化，确保管理员下单后 App 端可实时收到推送
    useEffect(() => {
        const channel = supabase
            .channel('admin-order-watch')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
                console.log('[Realtime] New order inserted:', payload.new);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    // 动态品类
    const categories = useMemo(() => {
        const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
        return ['全部', ...cats];
    }, [products]);

    // 筛选菜单
    const filteredProducts = useMemo(() => products.filter(p => {
        const matchCat = activeCategory === '全部' || p.category === activeCategory;
        const q = searchQuery.toLowerCase();
        const matchSearch = p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
        return matchCat && matchSearch;
    }), [products, activeCategory, searchQuery]);

    const totalAmount = useMemo(() =>
        cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
        [cart]
    );

    /** 将产品加入购物车 */
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(i => i.product.id === product.id);
            if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            return [...prev, { product, quantity: 1, note: '' }];
        });
    };

    const updateQty = (id: string, delta: number) => {
        setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0));
    };

    const updateNote = (id: string, note: string) => {
        setCart(prev => prev.map(i => i.product.id === id ? { ...i, note } : i));
    };

    /** 更新设备数量 */
    const updateEquipmentQty = (name: string, delta: number) => {
        setEquipments(prev => ({
            ...prev,
            [name]: Math.max(0, prev[name] + delta)
        }));
    };

    /** 提交后台下单 */
    const handleSubmit = async () => {
        if (!customerName.trim() || !customerPhone.trim()) {
            alert('请填写客户姓名和联系电话');
            return;
        }
        if (cart.length === 0) {
            alert('购物车为空，请先选择产品');
            return;
        }

        setIsSubmitting(true);
        try {
            // 过滤掉数量为 0 的设备
            const activeEquipments = Object.fromEntries(
                Object.entries(equipments).filter(([_, qty]) => qty > 0)
            );
            const payload: OrderCreate = {
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                address: address.trim() || '到店自取',
                items: cart.map(i => ({
                    id: i.product.id,
                    name: i.product.name,
                    price: i.product.price,
                    quantity: i.quantity,
                    note: i.note || undefined,
                })),
                status: OrderStatus.PENDING,
                dueTime: new Date(Date.now() + 60 * 60 * 1000)
                    .toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit' }),
                amount: totalAmount,
                type: address.trim() ? 'delivery' : 'takeaway',
                paymentMethod: payment as PaymentMethod,
                driverId: selectedDriverId,
                equipments: Object.keys(activeEquipments).length > 0 ? activeEquipments : undefined,
            };

            const order = await AdminOrderService.create(payload);
            const assignedDriver = selectedDriverId ? drivers.find(d => d.id === selectedDriverId) : null;
            setConfirmedOrder({
                orderId: order.id,
                orderRef: orderRef.current,
                total: totalAmount,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                address: address.trim() || '到店自取',
                mapsLink: mapsLink.trim(),
                remarks: remarks.trim(),
                eventDate: eventDate.trim(),
                eventTime: eventTime.trim(),
                payment,
                items: [...cart],
                equipments: { ...equipments },
                driverName: assignedDriver?.name || assignedDriver?.email || '未指派',
                dueTime: payload.dueTime,
                createdAt: new Date().toLocaleString('zh-MY', { hour12: false }),
            });
        } catch (err) {
            console.error('Failed to create order', err);
            alert('下单失败，请检查后端服务是否运行');
        } finally {
            setIsSubmitting(false);
        }
    };

    /** 重置表单，再次下单 */
    const handleReset = () => {
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setAddress('');
        setMapsLink('');
        setRemarks('');
        setEventDate('');
        setEventTime('');
        setPayment(PaymentMethod.CASH);
        setEquipments(EQUIPMENT_LIST.reduce((acc, eq) => ({ ...acc, [eq]: 0 }), {}));
        setSelectedDriverId(undefined);
        setConfirmedOrder(null);
        orderRef.current = generateOrderRef();
    };

    // ─── 订单确认成功界面 —— 全部明细 + 可打印收据─────────────────────
    if (confirmedOrder) {
        const activeEquip = Object.entries(confirmedOrder.equipments).filter(([, qty]) => qty > 0);
        const paymentLabel = PAYMENT_OPTIONS.find(p => p.id === confirmedOrder.payment)?.label ?? confirmedOrder.payment;

        return (
            <div className="max-w-2xl mx-auto animate-in fade-in duration-500" id="printable-order">
                {/* 打印模式样式 — A4 纸张适配，尽量单页完成 */}
                <style>{`
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    @media print {
                        /* ── 结构：隐藏侧边栏 / 顶栏 / 按钮 ── */
                        aside, header, .no-print-area { display: none !important; }

                        /* ── 解除祖先 overflow / height 限制 ── */
                        html, body, #root, #root > *, #root > * > * {
                            overflow: visible !important;
                            height: auto !important;
                        }
                        main {
                            width: 100% !important;
                            overflow: visible !important;
                            padding: 0 !important;
                        }
                        main > div, main > div > div {
                            overflow: visible !important;
                            height: auto !important;
                            max-width: 100% !important;
                            padding: 0 !important;
                        }

                        /* ── 收据容器全宽、无动画 ── */
                        #printable-order {
                            width: 100% !important;
                            max-width: 100% !important;
                            margin: 0 !important;
                            animation: none !important;
                        }
                        #printable-order > div {
                            box-shadow: none !important;
                            border-radius: 8px !important;
                        }

                        /* ── 全局缩小字体基准（rem 跟随缩） ── */
                        #printable-order { font-size: 10px !important; }

                        /* ── 压缩各级标题 ── */
                        #printable-order .text-3xl  { font-size: 16px !important; }
                        #printable-order .text-2xl  { font-size: 14px !important; }
                        #printable-order .text-xl   { font-size: 13px !important; }
                        #printable-order .text-lg   { font-size: 12px !important; }
                        #printable-order .text-sm   { font-size: 10px !important; }
                        #printable-order .text-xs   { font-size: 9px  !important; }
                        #printable-order .text-\\[10px\\] { font-size: 8px !important; }
                        #printable-order .text-\\[9px\\]  { font-size: 7px !important; }

                        /* ── 压缩内边距 ── */
                        #printable-order .p-6 { padding: 8px !important; }
                        #printable-order .p-5 { padding: 7px !important; }
                        #printable-order .p-4 { padding: 6px !important; }
                        #printable-order .p-3 { padding: 5px !important; }
                        #printable-order .p-8 { padding: 8px !important; }
                        #printable-order .py-4 { padding-top: 5px !important; padding-bottom: 5px !important; }
                        #printable-order .py-3 { padding-top: 4px !important; padding-bottom: 4px !important; }
                        #printable-order .py-2\\.5 { padding-top: 3px !important; padding-bottom: 3px !important; }
                        #printable-order .px-4 { padding-left: 8px !important; padding-right: 8px !important; }
                        #printable-order .px-3 { padding-left: 6px !important; padding-right: 6px !important; }

                        /* ── 压缩间距 ── */
                        #printable-order .space-y-5 > * + * { margin-top: 6px !important; }
                        #printable-order .space-y-3 > * + * { margin-top: 4px !important; }
                        #printable-order .space-y-2\\.5 > * + * { margin-top: 3px !important; }
                        #printable-order .gap-4 { gap: 6px !important; }
                        #printable-order .gap-3 { gap: 5px !important; }
                        #printable-order .mb-8 { margin-bottom: 6px !important; }
                        #printable-order .mb-5 { margin-bottom: 5px !important; }
                        #printable-order .mb-3 { margin-bottom: 4px !important; }
                        #printable-order .mb-2 { margin-bottom: 3px !important; }
                        #printable-order .pb-4 { padding-bottom: 5px !important; }

                        /* ── 表格压缩 ── */
                        #printable-order table { font-size: 9px !important; }
                        #printable-order thead th { padding: 3px 6px !important; }
                        #printable-order tbody td { padding: 3px 6px !important; }

                        /* ── QR 码缩小 ── */
                        #printable-order img { max-width: 70px !important; max-height: 70px !important; width: 70px !important; height: 70px !important; }

                        /* ── 避免在表格行中间断页 ── */
                        #printable-order tr { page-break-inside: avoid; }
                        #printable-order .space-y-5 > div { page-break-inside: avoid; }
                    }
                `}</style>

                <div className="bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden">
                    {/* 成功标头 */}
                    <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-white text-center no-print-area">
                        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                            <span className="material-icons-round text-3xl">check_circle</span>
                        </div>
                        <h2 className="text-xl font-black">订单已创建</h2>
                        <p className="text-green-100 text-xs mt-1 font-bold uppercase tracking-widest">Order Confirmed</p>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* 收据公司标头（打印时显示）*/}
                        <div className="hidden print:block text-center pb-4 border-b border-slate-200">
                            <p className="text-xl font-black text-slate-900">金龙餐饮配送系统</p>
                            <p className="text-xs text-slate-400 font-mono">Kim Long Smart Catering System</p>
                        </div>

                        {/* 订单参考号 + 时间 */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">订单参考号</p>
                                <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">{confirmedOrder.orderRef}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{confirmedOrder.orderId}</p>
                            </div>
                            <div className="text-right text-xs text-slate-500 font-medium shrink-0">
                                <p>创建时间: <span className="font-bold text-slate-700">{confirmedOrder.createdAt}</span></p>
                                <p>预计交付: <span className="font-bold text-slate-700">{confirmedOrder.dueTime}</span></p>
                            </div>
                        </div>

                        {/* QR 码 + 客户信息 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col items-center gap-2 bg-slate-50 rounded-2xl p-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">扫描订单</p>
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(confirmedOrder.orderRef)}&bgcolor=f8f8f8&color=1e293b&margin=2`}
                                    alt="Order QR Code"
                                    className="w-24 h-24 rounded-xl"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                <p className="text-[9px] font-black text-slate-300 tracking-widest font-mono">{confirmedOrder.orderRef}</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">客户资讯</p>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold">姓名</p>
                                    <p className="text-sm font-black text-slate-800">{confirmedOrder.customerName}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold">电话</p>
                                    <p className="text-sm font-bold text-slate-700 font-mono">{confirmedOrder.customerPhone}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold">地址</p>
                                    <p className="text-xs font-bold text-slate-700 leading-relaxed">{confirmedOrder.address}</p>
                                </div>
                                {confirmedOrder.mapsLink && (
                                    <a href={confirmedOrder.mapsLink} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] font-black text-red-500 no-print-area">
                                        <span className="material-icons-round text-[11px]">place</span>Maps 导航
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* 商品明细 */}
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</p>
                            <div className="rounded-2xl border border-slate-100 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">编号 / 品名</th>
                                            <th className="text-center px-3 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">数量</th>
                                            <th className="text-right px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">单价</th>
                                            <th className="text-right px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">小计</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {confirmedOrder.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-slate-800">{item.product.name}</p>
                                                    <p className="text-[9px] text-slate-400 font-mono">{item.product.code}</p>
                                                    {item.note && <p className="text-[9px] text-slate-400 italic mt-0.5">备注: {item.note}</p>}
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-black text-xs">{item.quantity}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600 font-mono font-bold text-xs">RM {item.product.price.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right font-black text-slate-800 font-mono text-xs">RM {(item.product.price * item.quantity).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 设备 / 物资 */}
                        {activeEquip.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">设备 / 物资</p>
                                <div className="flex flex-wrap gap-2">
                                    {activeEquip.map(([name, qty]) => (
                                        <span key={name} className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-black">
                                            {name} × {qty}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 其他信息 */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 rounded-2xl p-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">付款方式</p>
                                <p className="text-xs font-black text-slate-700">{paymentLabel}</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">配送司机</p>
                                <p className="text-xs font-black text-slate-700">{confirmedOrder.driverName}</p>
                            </div>
                            {confirmedOrder.remarks && (
                                <div className="bg-amber-50 rounded-2xl p-3 border border-amber-100">
                                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">整单备注</p>
                                    <p className="text-xs font-bold text-amber-700">{confirmedOrder.remarks}</p>
                                </div>
                            )}
                        </div>

                        {/* 活动日期 + 活动时间（有值才显示） */}
                        {(confirmedOrder.eventDate || confirmedOrder.eventTime) && (
                            <div className="flex gap-3">
                                {confirmedOrder.eventDate && (
                                    <div className="flex-1 bg-violet-50 rounded-2xl p-3 border border-violet-100 flex items-center gap-2">
                                        <span className="material-icons-round text-violet-500 text-[16px]">event</span>
                                        <div>
                                            <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">活动日期</p>
                                            <p className="text-xs font-black text-violet-700">{confirmedOrder.eventDate}</p>
                                        </div>
                                    </div>
                                )}
                                {confirmedOrder.eventTime && (
                                    <div className="flex-1 bg-violet-50 rounded-2xl p-3 border border-violet-100 flex items-center gap-2">
                                        <span className="material-icons-round text-violet-500 text-[16px]">schedule</span>
                                        <div>
                                            <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">活动时间</p>
                                            <p className="text-xs font-black text-violet-700">{confirmedOrder.eventTime}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 总计 */}
                        <div className="flex justify-between items-center py-4 border-t-2 border-slate-900">
                            <span className="text-sm font-black text-slate-600 uppercase tracking-wider">应付总额</span>
                            <span className="text-3xl font-black text-indigo-600 font-mono">RM {confirmedOrder.total.toFixed(2)}</span>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex gap-3 no-print-area">
                            <button
                                onClick={() => window.print()}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
                            >
                                <span className="material-icons-round text-[18px]">print</span>
                                打印收据
                            </button>
                            <button
                                onClick={handleReset}
                                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20 transition-all"
                            >
                                <span className="material-icons-round text-[18px]">add_shopping_cart</span>
                                再次下单
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── 下单主界面 ────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* 顶部信息栏 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">后台下单</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        订单号预览：<span className="font-mono font-black text-indigo-600">{orderRef.current}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-xl text-indigo-600 text-xs font-black border border-indigo-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                    Supabase Realtime 已激活
                </div>
            </div>

            <div className="grid grid-cols-7 gap-6">
                {/* ── 左侧：产品选择 ──────────────────────── (占 4/7) */}
                <div className="col-span-4 space-y-4">
                    <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-5 border-b border-slate-50">
                            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                                <span className="material-icons-round text-[18px] text-indigo-500">restaurant_menu</span>
                                产品目录
                            </h3>
                            <div className="relative mt-3">
                                <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                <input
                                    type="text"
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    placeholder="搜索产品名或编号..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* 品类 Tabs */}
                            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${activeCategory === cat ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 max-h-[460px] overflow-y-auto no-scrollbar">
                            {productsLoading ? (
                                <div className="flex items-center justify-center py-16 text-slate-300">
                                    <span className="material-icons-round animate-spin text-3xl mr-2">autorenew</span>
                                    <span className="text-sm font-bold">加载产品中...</span>
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div className="flex flex-col items-center py-16 text-slate-300">
                                    <span className="material-icons-round text-5xl mb-2">inventory_2</span>
                                    <p className="text-sm font-bold">暂无匹配产品</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {filteredProducts.map(p => {
                                        const inCart = cart.find(i => i.product.id === p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => addToCart(p)}
                                                className={`relative text-left rounded-2xl border transition-all overflow-hidden group ${inCart ? 'border-indigo-400 bg-indigo-50/60 shadow-md shadow-indigo-100' : 'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-sm'}`}
                                            >
                                                {p.image_url && (
                                                    <img src={p.image_url} alt={p.name} className="w-full h-24 object-cover" />
                                                )}
                                                {!p.image_url && (
                                                    <div className="w-full h-16 bg-slate-50 flex items-center justify-center">
                                                        <span className="material-icons-round text-3xl text-slate-200">fastfood</span>
                                                    </div>
                                                )}
                                                <div className="p-3">
                                                    <div className="text-[9px] font-black text-slate-400 uppercase mb-1">{p.code}</div>
                                                    <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{p.name}</div>
                                                    <div className="text-sm font-black text-indigo-600 mt-1">RM {p.price.toFixed(2)}</div>
                                                </div>
                                                {inCart && (
                                                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shadow-md">
                                                        {inCart.quantity}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 设备/物资选择模块 */}
                    <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden mt-4">
                        <div className="p-5 border-b border-slate-50">
                            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                                <span className="material-icons-round text-[18px] text-blue-500">handyman</span>
                                包含设备 / 物资
                            </h3>
                        </div>
                        <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto no-scrollbar">
                            {EQUIPMENT_LIST.map(eq => (
                                <div key={eq} className={`flex flex-col justify-between p-3 rounded-2xl border transition-all ${equipments[eq] > 0 ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                    <span className="text-xs font-bold text-slate-700 mb-2 truncate" title={eq}>{eq}</span>
                                    <div className="flex items-center justify-between mt-auto">
                                        <button
                                            onClick={() => updateEquipmentQty(eq, -1)}
                                            className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
                                            disabled={equipments[eq] === 0}
                                        >
                                            <span className="material-icons-round text-sm">remove</span>
                                        </button>
                                        <span className="text-sm font-black w-8 text-center">{equipments[eq]}</span>
                                        <button
                                            onClick={() => updateEquipmentQty(eq, 1)}
                                            className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                                        >
                                            <span className="material-icons-round text-sm">add</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── 右侧：购物车 + 客户信息 ─────────── (占 3/7) */}
                <div className="col-span-3 space-y-4">
                    {/* 购物车 */}
                    <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-5 border-b border-slate-50 flex items-center justify-between">
                            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                                <span className="material-icons-round text-[18px] text-orange-500">shopping_cart</span>
                                购物车
                            </h3>
                            {cart.length > 0 && (
                                <button onClick={() => setCart([])} className="text-xs text-red-400 font-bold hover:text-red-600 transition-colors">
                                    清空
                                </button>
                            )}
                        </div>
                        <div className="max-h-64 overflow-y-auto no-scrollbar">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center py-8 text-slate-300">
                                    <span className="material-icons-round text-4xl mb-2">add_shopping_cart</span>
                                    <p className="text-xs font-bold">点击左侧产品加入购物车</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {cart.map(item => (
                                        <div key={item.product.id} className="px-5 py-3 space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{item.product.name}</p>
                                                    <p className="text-[10px] text-indigo-500 font-black">RM {(item.product.price * item.quantity).toFixed(2)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-2 py-1 border border-slate-100">
                                                    <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
                                                        <span className="material-icons-round text-sm">remove</span>
                                                    </button>
                                                    <span className="text-sm font-black min-w-[20px] text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQty(item.product.id, 1)} className="w-6 h-6 rounded-full bg-indigo-600 text-white shadow-sm flex items-center justify-center hover:bg-indigo-700 transition-colors">
                                                        <span className="material-icons-round text-sm">add</span>
                                                    </button>
                                                </div>
                                            </div>
                                            {/* 备注 */}
                                            <input
                                                type="text"
                                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/20 placeholder:text-slate-300"
                                                placeholder={`备注 (${item.product.name})`}
                                                value={item.note}
                                                onChange={e => updateNote(item.product.id, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {cart.length > 0 && (
                            <div className="px-5 py-3 border-t border-slate-50 flex justify-between items-center bg-slate-50/50">
                                <span className="text-xs font-bold text-slate-500">{cart.reduce((s, i) => s + i.quantity, 0)} 件商品</span>
                                <span className="text-lg font-black text-indigo-700">RM {totalAmount.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* 客户资讯 */}
                    <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-5 border-b border-slate-50">
                            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                                <span className="material-icons-round text-[18px] text-emerald-500">person</span>
                                客户资讯
                            </h3>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-1.5">客户姓名 *</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                                    placeholder="e.g. 陈大明"
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-1.5">联系电话 *</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                                    placeholder="+60123456789"
                                    value={customerPhone}
                                    onChange={e => setCustomerPhone(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-1.5">配送地址（选填）</label>
                                <textarea
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium resize-none"
                                    placeholder="留空视为到店自取..."
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                />
                            </div>

                            {/* Google Maps 链接 */}
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-1.5 flex items-center gap-1">
                                    <span className="material-icons-round text-[13px] text-red-500">place</span>
                                    Google Maps 链接（选填）
                                </label>
                                <div className="relative">
                                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">link</span>
                                    <input
                                        type="url"
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
                                        placeholder="粘贴 Google Maps 链接..."
                                        value={mapsLink}
                                        onChange={e => setMapsLink(e.target.value)}
                                    />
                                </div>
                                {/* 链接快捷按钮栏 */}
                                {mapsLink && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <a
                                            href={mapsLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                                        >
                                            <span className="material-icons-round text-[13px]">open_in_new</span>
                                            在 Maps 中打开
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setMapsLink('')}
                                            className="ml-auto text-xs text-slate-400 font-bold hover:text-red-500 transition-colors"
                                        >
                                            清除
                                        </button>
                                    </div>
                                )}
                                {/* NOTE: 当用户贴上 maps.app.goo.gl 短链时，因 CORS 无法内嵌 iframe，仅显示可点击链接 */}
                                {mapsLink && mapsLink.includes('google.com/maps') && (
                                    <div className="mt-2 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                                        <iframe
                                            src={mapsLink.replace('/maps/', '/maps/embed?')}
                                            width="100%"
                                            height="160"
                                            className="border-0"
                                            loading="lazy"
                                            allowFullScreen
                                            referrerPolicy="no-referrer-when-downgrade"
                                            title="Delivery Location"
                                        />
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-1.5">整单备注（选填）</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                                    placeholder="e.g. 少辣、不要葱..."
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                />
                            </div>

                            {/* 活动日期和活动时间 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 mb-1.5 flex items-center gap-1">
                                        <span className="material-icons-round text-[13px] text-violet-500">event</span>
                                        活动日期（选填）
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 font-medium text-slate-700"
                                        value={eventDate}
                                        onChange={e => setEventDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 mb-1.5 flex items-center gap-1">
                                        <span className="material-icons-round text-[13px] text-violet-500">schedule</span>
                                        活动时间（选填）
                                    </label>
                                    <input
                                        type="time"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 font-medium text-slate-700"
                                        value={eventTime}
                                        onChange={e => setEventTime(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* 付款方式 */}
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-1.5">付款方式</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PAYMENT_OPTIONS.map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setPayment(opt.id)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${payment === opt.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                                        >
                                            <span className="material-icons-round text-[14px]">{opt.icon}</span>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 指派配送员模块 */}
                    <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden mt-4">
                        <div className="p-5 border-b border-slate-50 flex justify-between items-center">
                            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                                <span className="material-icons-round text-[18px] text-teal-500">local_shipping</span>
                                指派配送员
                            </h3>
                            {selectedDriverId && (
                                <button
                                    onClick={() => setSelectedDriverId(undefined)}
                                    className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    清除选择
                                </button>
                            )}
                        </div>
                        <div className="p-4">
                            {driversLoading ? (
                                <div className="text-center py-4 text-xs font-bold text-slate-400 flex items-center justify-center gap-2">
                                    <span className="material-icons-round animate-spin text-sm">autorenew</span>
                                    加载司机列表中...
                                </div>
                            ) : drivers.length === 0 ? (
                                <div className="text-center py-4 text-xs font-bold text-slate-400">
                                    暂无可用司机
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto no-scrollbar pr-1">
                                    {drivers.map(driver => (
                                        <button
                                            key={driver.id}
                                            onClick={() => setSelectedDriverId(driver.id)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedDriverId === driver.id ? 'bg-teal-50 border-teal-300 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                                        >
                                            <div className="relative">
                                                {driver.avatar_url ? (
                                                    <img src={driver.avatar_url} alt={driver.name} className="w-10 h-10 rounded-full object-cover" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                        <span className="material-icons-round text-lg">person</span>
                                                    </div>
                                                )}
                                                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${driver.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-800 truncate">{driver.name || driver.email}</div>
                                                <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                                                    <span className="material-icons-round text-[12px] text-slate-400">phone</span>
                                                    {driver.phone || '无电话记录'}
                                                </div>
                                            </div>
                                            {selectedDriverId === driver.id && (
                                                <span className="material-icons-round text-teal-600">check_circle</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 提交按钮 */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || cart.length === 0}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <><span className="material-icons-round animate-spin text-[20px]">autorenew</span>提交中...</>
                        ) : (
                            <><span className="material-icons-round text-[20px]">send</span>确认下单 · RM {totalAmount.toFixed(2)}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
