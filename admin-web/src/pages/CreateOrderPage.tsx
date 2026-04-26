import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ProductService, AdminOrderService, CustomerService, type Customer } from '../services/api';
import { supabase } from '../lib/supabase';
import { OrderStatus, PaymentMethod } from '../types';
import type { Product, OrderCreate } from '../types';

/** 购物车项目 */
interface CartItem {
    product: Product;
    quantity: number;
    note: string;
    priceOverride?: number;
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
    status: OrderStatus;
}

/** 格式化订单号预览：KM-YY/MM/DD/XXX */
const generateOrderRef = (): string => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    // 注意：前端仅为展示参考，后端会根据当日序号精准分配 XXX
    return `KM-${yy}/${mm}/${dd}/XXX`;
};

const EQUIPMENT_LIST = [
    "汤匙 OTU Spoon", "叉子 OTU Fork", "盘子 OTU Plate", "杯子 OTU Cup", 
    "垃圾袋 Garbage Bag", "白钢网 S/L Net", "食物夹子 Serving Tong", "红烧桶 Plastic Sauce",
    "白钢高盖 Chafing High Lid", "篮子 Plastic Basket", "铁脚架 Chafing Rack", "装酱碗 Sauce Bowl"
];

export const CreateOrderPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const editingOrderId = searchParams.get('id');
    const [products, setProducts] = useState<Product[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [address, setAddress] = useState('');
    const [mapsLink, setMapsLink] = useState('');
    const [remarks, setRemarks] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('');
    const [billingUnit, setBillingUnit] = useState<'PAX' | 'SET' | 'PACKET'>('PAX');
    const [billingQuantity, setBillingQuantity] = useState<number>(0);
    const [billingPricePerUnit, setBillingPricePerUnit] = useState<number>(0);
    const [paymentReceived, setPaymentReceived] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // 状态、编号和司机信息（编辑模式所需）
    const [orderStatus, setOrderStatus] = useState<OrderStatus>(OrderStatus.PENDING);
    const [existingOrderNumber, setExistingOrderNumber] = useState<string | undefined>(undefined);
    const [existingDriverId, setExistingDriverId] = useState<string | undefined>(undefined);
    
    const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrderSnapshot | null>(null);

    const orderRef = useRef(generateOrderRef());

    const [equipments, setEquipments] = useState<Record<string, number>>(
        EQUIPMENT_LIST.reduce((acc, eq) => ({ ...acc, [eq]: 0 }), {})
    );
    const [customEquipments, setCustomEquipments] = useState<string[]>([]);
    const [isAddingCustom, setIsAddingCustom] = useState(false);
    const [newCustomName, setNewCustomName] = useState('');

    // 客户聯想狀態
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

    useEffect(() => {
        ProductService.getAll()
            .then((productsData) => {
                const data = Array.isArray(productsData) ? productsData : [];
                setProducts(data);

                // Initialize custom prices mapping
                const prices: Record<string, number> = {};
                data.forEach(p => {
                    prices[p.id] = p.price || 0;
                });
                setCustomPrices(prices);

                // If editing, fetch order details AFTER products are loaded
                if (editingOrderId) {
                    AdminOrderService.getById(editingOrderId)
                        .then(order => {
                            setCustomerName(order.customerName || '');
                            setCustomerPhone(order.customerPhone || '');
                            setAddress(order.address || '');
                            setRemarks(order.remark || '');
                            
                            if (order.eventDate) {
                                setEventDate(order.eventDate);
                            } else if (order.dueTime) {
                                const dt = new Date(order.dueTime);
                                setEventDate(dt.toISOString().split('T')[0]);
                            }

                            if (order.eventTime) {
                                setEventTime(order.eventTime);
                            } else if (order.dueTime) {
                                const dt = new Date(order.dueTime);
                                setEventTime(dt.toTimeString().slice(0, 5));
                            }

                            setBillingUnit(order.billingUnit as any || 'PAX');
                            setBillingQuantity(order.billingQuantity || 0);
                            setBillingPricePerUnit(order.billingPricePerUnit || 0);
                            setPaymentReceived(order.payment_received || 0);

                            // 保存状态和属性以便编辑后保留
                            setOrderStatus(order.status || OrderStatus.PENDING);
                            setExistingOrderNumber(order.order_number);
                            setExistingDriverId(order.driverId);

                            // Map items back to cart
                            const cartItems: CartItem[] = (order.items || []).map((item: any) => {
                                const product = data.find(p => p.id === item.id) || {
                                    id: item.id,
                                    name: item.name,
                                    price: item.original_price || item.price,
                                    category: 'Unknown'
                                } as Product;
                                
                                return {
                                    product,
                                    quantity: item.quantity,
                                    note: item.note || '',
                                    priceOverride: item.price
                                };
                            });
                            setCart(cartItems);

                            // Map equipments
                            if (order.equipments) {
                                setEquipments(prev => ({
                                    ...prev,
                                    ...order.equipments
                                }));
                                
                                // Check for custom equipments
                                const standardKeys = new Set(EQUIPMENT_LIST);
                                const custom = Object.keys(order.equipments).filter(k => !standardKeys.has(k));
                                if (custom.length > 0) {
                                    setCustomEquipments(custom);
                                }
                            }
                        })
                        .catch(err => {
                            console.error('Failed to load order for editing', err);
                            alert('Failed to load order data');
                        });
                }
            })
            .catch(err => console.error('Failed to load data', err))
            .finally(() => {
                setProductsLoading(false);
            });
    }, [editingOrderId]);

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

    // 客户联想逻辑
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (customerName.trim().length >= 2 || customerPhone.trim().length >= 3) {
                setIsSearchingCustomers(true);
                try {
                    const q = customerName.trim() || customerPhone.trim();
                    const data = await CustomerService.getAll(q);
                    setCustomerSuggestions(data);
                    setShowSuggestions(data.length > 0);
                } catch (err) {
                    console.error('Failed to fetch customers', err);
                } finally {
                    setIsSearchingCustomers(false);
                }
            } else {
                setCustomerSuggestions([]);
                setShowSuggestions(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [customerName, customerPhone]);

    const selectCustomer = (c: Customer) => {
        setCustomerName(c.name);
        setCustomerPhone(c.phone);
        if (c.address) setAddress(c.address);
        setShowSuggestions(false);
    };

    // 动态品类
    const categories = useMemo(() => {
        const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
        return ['全部', ...cats];
    }, [products]);

    // 筛选菜单
    const filteredProducts = useMemo(() => products.filter(p => {
        const matchCat = activeCategory === '全部' || p.category === activeCategory;
        const q = (searchQuery || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        const matchSearch = name.includes(q) || code.includes(q);
        return matchCat && matchSearch;
    }), [products, activeCategory, searchQuery]);

    const totalAmount = useMemo(() =>
        billingQuantity * billingPricePerUnit,
        [billingQuantity, billingPricePerUnit]
    );

    /** 将产品加入购物车 */
    const addToCart = (product: Product) => {
        const currentPrice = customPrices[product.id] ?? product.price;
        setCart(prev => {
            const existing = prev.find(i => i.product.id === product.id);
            if (existing) {
                return prev.map(i =>
                    i.product.id === product.id
                        ? { ...i, quantity: i.quantity + 1, priceOverride: currentPrice }
                        : i
                );
            }
            return [...prev, { product, quantity: 1, note: '', priceOverride: currentPrice }];
        });
    };

    const handlePriceChange = (productId: string, value: string) => {
        const newPrice = value === '' ? 0 : parseFloat(value);
        if (isNaN(newPrice) || newPrice < 0) return;

        setCustomPrices(prev => ({
            ...prev,
            [productId]: newPrice
        }));

        // 同时更新购物车中已有项目的单价
        setCart(prev => prev.map(item =>
            item.product.id === productId
                ? { ...item, priceOverride: newPrice }
                : item
        ));
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
        if (!customerName.trim() || !customerPhone.trim() || !address.trim()) {
            alert('请填写完整客户姓名、电话、地址');
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
                    price: i.priceOverride ?? i.product.price,
                    original_price: i.product.price,
                    quantity: i.quantity,
                    note: i.note || undefined,
                })),
                status: editingOrderId ? orderStatus : OrderStatus.PENDING,
                dueTime: (eventDate.trim() && eventTime.trim()) 
                    ? new Date(`${eventDate.trim()}T${eventTime.trim()}:00`).toISOString()
                    : new Date().toISOString(), // Default to now if not provided
                amount: totalAmount,
                type: address.trim() ? 'delivery' : 'takeaway',
                paymentMethod: PaymentMethod.CASH, // Default to cash
                payment_received: paymentReceived,
                billingUnit,
                billingQuantity,
                billingPricePerUnit,
                order_number: editingOrderId ? existingOrderNumber : undefined,
                driverId: editingOrderId ? existingDriverId : undefined,
                equipments: Object.keys(activeEquipments).length > 0 ? activeEquipments : undefined,
                eventDate: eventDate.trim(),
                eventTime: eventTime.trim(),
                mapsLink: mapsLink.trim(),
                remarks: remarks.trim(),
            };

            let order;
            if (editingOrderId) {
                order = await AdminOrderService.update(editingOrderId, payload);
            } else {
                order = await AdminOrderService.create(payload);
            }

            setConfirmedOrder({
                orderId: order.id,
                orderRef: order.order_number || orderRef.current,
                total: totalAmount,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                address: address.trim() || '到店自取',
                mapsLink: mapsLink.trim(),
                remarks: remarks.trim(),
                eventDate: eventDate.trim(),
                eventTime: eventTime.trim(),
                items: [...cart],
                equipments: { ...equipments },
                driverName: '待指派',
                dueTime: payload.dueTime,
                createdAt: new Date().toLocaleString('zh-MY', { hour12: false }),
                status: payload.status,
                payment: '待财务确认',
            });
        } catch (err) {
            console.error('Failed to save order', err);
            alert('保存失败，请检查后端服务是否运行');
        } finally {
            setIsSubmitting(false);
        }
    };


    // ─── 订单确认成功界面 —— 全部明细 + 可打印收据─────────────────────
    if (confirmedOrder) {
        const activeEquip = Object.entries(confirmedOrder.equipments).filter(([, qty]) => (qty as number) > 0);
        const paymentLabel = confirmedOrder.payment || '待财务确认';

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
                                <div className="mt-2 flex justify-end">
                                    <span className="px-3 py-1 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                        {confirmedOrder.status}
                                    </span>
                                </div>
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
                                                <td className="px-4 py-3 text-right text-slate-600 font-mono font-bold text-xs">RM {(item.product.price || 0).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right font-black text-slate-800 font-mono text-xs">RM {((item.product.price || 0) * item.quantity).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 包含设备及物品 */}
                        {activeEquip.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">包含设备及物品</p>
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
                        <div className="flex flex-col sm:flex-row gap-3 no-print-area mt-4">
                            <button
                                onClick={() => navigate("/orders")}
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-icons-round text-[20px]">list_alt</span>
                                查看订单 (Orders)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── 下单主界面 ────────────────────────────────────────────────────────
    return (
        <div className="mt-10 mx-auto max-w-[1600px] px-4 space-y-6 animate-in fade-in duration-500">
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
                                <label htmlFor="menu-search" className="sr-only">搜索产品</label>
                                <input
                                    id="menu-search"
                                    name="menu-search"
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
                                                    <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight mb-1">{p.name}</div>
                                                    <div className="flex items-center gap-1 text-indigo-600 group/price relative">
                                                        <span className="text-[10px] font-black">RM</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={customPrices[p.id] !== undefined ? customPrices[p.id] : (p.price || 0)}
                                                            onChange={(e) => handlePriceChange(p.id, e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-full bg-transparent border-none p-0 text-sm font-black outline-none focus:ring-0 focus:border-indigo-500"
                                                        />
                                                        <span className="material-icons-round text-[12px] opacity-0 group-hover/price:opacity-100 transition-opacity absolute right-0">edit</span>
                                                    </div>
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
                                包含设备及物品
                            </h3>
                        </div>
                        <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto no-scrollbar">
                            {[...EQUIPMENT_LIST, ...customEquipments].map(eq => (
                                <div key={eq} className={`flex flex-col justify-between p-3 rounded-2xl border transition-all ${equipments[eq] > 0 ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                    <span className="text-xs font-bold text-slate-700 mb-2 truncate" title={eq}>{eq}</span>
                                    <div className="flex items-center justify-between mt-auto">
                                        <button
                                            onClick={() => updateEquipmentQty(eq, -1)}
                                            className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
                                            disabled={equipments[eq] === 0 || (billingUnit === 'PAX' && billingQuantity > 0 && ['盘子 OTU Plate', '汤匙 OTU Spoon', '叉子 OTU Fork', '杯子 OTU Cup'].includes(eq))}
                                        >
                                            <span className="material-icons-round text-sm">remove</span>
                                        </button>
                                        <span className="text-sm font-black w-8 text-center">{equipments[eq] || 0}</span>
                                        <button
                                            onClick={() => updateEquipmentQty(eq, 1)}
                                            className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors disabled:opacity-50"
                                            disabled={billingUnit === 'PAX' && billingQuantity > 0 && ['盘子 OTU Plate', '汤匙 OTU Spoon', '叉子 OTU Fork', '杯子 OTU Cup'].includes(eq)}
                                        >
                                            <span className="material-icons-round text-sm">add</span>
                                        </button>
                                    </div>
                                    {billingUnit === 'PAX' && billingQuantity > 0 && ['盘子 OTU Plate', '汤匙 OTU Spoon', '叉子 OTU Fork', '杯子 OTU Cup'].includes(eq) && (
                                        <p className="text-[8px] font-bold text-blue-500 italic mt-1 text-center">Auto-locked: PAX x 2</p>
                                    )}
                                </div>
                            ))}

                            {/* Add Custom Equipment Card */}
                            <div
                                className={`border-2 border-dashed rounded-2xl p-3 flex flex-col items-center justify-center min-h-[90px] transition-all cursor-pointer ${isAddingCustom ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                                onClick={() => !isAddingCustom && setIsAddingCustom(true)}
                            >
                                {isAddingCustom ? (
                                    <div className="w-full space-y-2">
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="设备名..."
                                            className="w-full bg-transparent border-b border-blue-200 py-1 text-xs font-bold outline-none focus:border-blue-500"
                                            value={newCustomName}
                                            onChange={(e) => setNewCustomName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    if (newCustomName.trim()) {
                                                        const name = newCustomName.trim();
                                                        setCustomEquipments(prev => [...prev, name]);
                                                        setEquipments(prev => ({ ...prev, [name]: 0 }));
                                                        setNewCustomName('');
                                                        setIsAddingCustom(false);
                                                    }
                                                } else if (e.key === 'Escape') {
                                                    setIsAddingCustom(false);
                                                    setNewCustomName('');
                                                }
                                            }}
                                        />
                                        <div className="flex justify-between items-center px-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsAddingCustom(false);
                                                    setNewCustomName('');
                                                }}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <span className="material-icons-round text-sm">close</span>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (newCustomName.trim()) {
                                                        const name = newCustomName.trim();
                                                        setCustomEquipments(prev => [...prev, name]);
                                                        setEquipments(prev => ({ ...prev, [name]: 0 }));
                                                        setNewCustomName('');
                                                        setIsAddingCustom(false);
                                                    }
                                                }}
                                                className="text-blue-500 hover:text-blue-700 transition-colors"
                                            >
                                                <span className="material-icons-round text-sm">check_circle</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-slate-400 group-hover:text-blue-500 transition-colors">
                                        <span className="material-icons-round text-lg">add</span>
                                        <span className="text-[10px] font-black uppercase tracking-wider">Add Item</span>
                                    </div>
                                )}
                            </div>
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
                                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100/50 mt-1">
                                                        <span className="text-[10px] font-black">RM</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={item.priceOverride ?? item.product.price}
                                                            onChange={(e) => handlePriceChange(item.product.id, e.target.value)}
                                                            className="w-full bg-transparent border-none p-0 text-xs font-black outline-none focus:ring-0"
                                                        />
                                                    </div>
                                                    {item.priceOverride !== undefined && item.priceOverride !== item.product.price && (
                                                        <p className="text-[8px] text-slate-400 line-through mt-0.5 ml-1">
                                                            Original: RM {(item.product.price * item.quantity).toFixed(2)}
                                                        </p>
                                                    )}
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
                            <div className="relative">
                                <label htmlFor="customer-name" className="block text-xs font-black text-slate-400 mb-1.5">客户姓名 *</label>
                                <input
                                    id="customer-name"
                                    name="customer-name"
                                    type="text"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                                    placeholder="e.g. 陈大明"
                                    autoComplete="off"
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                    onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)}
                                />
                                
                                {isSearchingCustomers && (
                                    <div className="absolute right-3 top-9 translate-y-0.5">
                                        <span className="material-icons-round text-indigo-500 animate-spin text-[16px]">autorenew</span>
                                    </div>
                                )}
                                
                                {showSuggestions && (
                                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto no-scrollbar">
                                        {customerSuggestions.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between"
                                            >
                                                <div>
                                                    <p className="text-xs font-black text-slate-800">{c.name}</p>
                                                </div>
                                                <span className="material-icons-round text-indigo-500 text-sm">history</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label htmlFor="customer-phone" className="block text-xs font-black text-slate-400 mb-1.5">联系电话 *</label>
                                <input
                                    id="customer-phone"
                                    name="customer-phone"
                                    type="tel"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                                    placeholder="+60123456789"
                                    autoComplete="off"
                                    value={customerPhone}
                                    onChange={e => setCustomerPhone(e.target.value)}
                                    onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)}
                                />
                            </div>
                            <div>
                                <label htmlFor="delivery-address" className="block text-xs font-black text-slate-400 mb-1.5">地址 *</label>
                                <textarea
                                    id="delivery-address"
                                    name="delivery-address"
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium resize-none"
                                    placeholder="请输入详细地址..."
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    required
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
                                    <label htmlFor="maps-link" className="sr-only">Google Maps 链接</label>
                                    <input
                                        id="maps-link"
                                        name="maps-link"
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
                                        活动日期
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 font-medium text-slate-700 font-bold"
                                        value={eventDate}
                                        onChange={e => setEventDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 mb-1.5 flex items-center gap-1">
                                        <span className="material-icons-round text-[13px] text-violet-500">schedule</span>
                                        活动时间
                                    </label>
                                    <input
                                        type="time"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 font-medium text-slate-700 font-bold"
                                        value={eventTime}
                                        onChange={e => setEventTime(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* 计费模块 (Billing Module) - Redesigned to match App Style */}
                            <div className="bg-slate-50/50 p-5 rounded-[2rem] border border-slate-100 space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                                    <span className="material-icons-round text-sm">payments</span>
                                    计费详情 (BILLING DETAILS)
                                </h4>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* 第一行：单位 & 数量 */}
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">计费单位</label>
                                        <select
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all appearance-none"
                                            value={billingUnit}
                                            onChange={(e) => {
                                                const unit = e.target.value as 'PAX' | 'SET' | 'PACKET';
                                                setBillingUnit(unit);
                                                if (unit === 'PAX' && billingQuantity > 0) {
                                                    const autoQty = billingQuantity * 2;
                                                    setEquipments(prev => ({
                                                        ...prev,
                                                        '盘子': autoQty, '汤匙': autoQty, '叉子': autoQty, '杯子': autoQty
                                                    }));
                                                }
                                            }}
                                        >
                                            <option value="PAX">PAX</option>
                                            <option value="SET">SET</option>
                                            <option value="PACKET">PACKET</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">数量</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                            value={billingQuantity || ''}
                                            onChange={(e) => {
                                                const qty = parseFloat(e.target.value) || 0;
                                                setBillingQuantity(qty);
                                                if (billingUnit === 'PAX' && qty > 0) {
                                                    const autoQty = qty * 2;
                                                    setEquipments(prev => ({
                                                        ...prev,
                                                        '盘子': autoQty, '汤匙': autoQty, '叉子': autoQty, '杯子': autoQty
                                                    }));
                                                }
                                            }}
                                        />
                                    </div>

                                    {/* 第二行：单价 & 总额 */}
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">单价 (RM)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                            value={billingPricePerUnit || ''}
                                            onChange={(e) => setBillingPricePerUnit(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-red-700 uppercase ml-1">总额 (SUB)</label>
                                        <div className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-black text-red-700">
                                            RM {(billingQuantity * billingPricePerUnit).toFixed(2)}
                                        </div>
                                    </div>

                                    {/* 第三行：定金 & 待收 */}
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-emerald-600 uppercase ml-1">定金 (DEP)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-4 py-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl text-sm font-black text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                            value={paymentReceived || ''}
                                            onChange={e => setPaymentReceived(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-red-500 uppercase ml-1">待收 (DUE)</label>
                                        <div className={`w-full px-4 py-2.5 border rounded-xl text-sm font-black transition-all ${totalAmount - paymentReceived > 0 ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                                            RM {(totalAmount - paymentReceived).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

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

export default CreateOrderPage;
