import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProductService, AdminOrderService } from '../services/api';
import { supabase } from '../lib/supabase';
import { OrderStatus, PaymentMethod } from '../types';
import type { Product, OrderCreate } from '../types';

/** 购物车项目 */
interface CartItem {
    product: Product;
    quantity: number;
    note: string;
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
    const [payment, setPayment] = useState<string>(PaymentMethod.CASH);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmedOrder, setConfirmedOrder] = useState<{ orderId: string; orderRef: string; total: number } | null>(null);
    const orderRef = useRef(generateOrderRef());

    // 加载产品
    useEffect(() => {
        ProductService.getAll()
            .then(setProducts)
            .catch(err => console.error('Failed to load products', err))
            .finally(() => setProductsLoading(false));
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
            const payload: OrderCreate = {
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                address: address.trim() || '到店自取',
                items: cart.map(i => ({
                    id: i.product.id,
                    quantity: i.quantity,
                    note: i.note || undefined,
                } as { id: string; quantity: number })),
                status: OrderStatus.PENDING,
                dueTime: new Date(Date.now() + 60 * 60 * 1000)
                    .toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit' }),
                amount: totalAmount,
                type: address.trim() ? 'delivery' : 'takeaway',
                paymentMethod: payment as PaymentMethod,
            };

            const order = await AdminOrderService.create(payload);
            setConfirmedOrder({ orderId: order.id, orderRef: orderRef.current, total: totalAmount });
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
        setPayment(PaymentMethod.CASH);
        setConfirmedOrder(null);
        orderRef.current = generateOrderRef();
    };

    // ─── 订单确认成功界面 ──────────────────────────────────────────────────
    if (confirmedOrder) {
        return (
            <div className="max-w-xl mx-auto animate-in fade-in duration-500">
                <div className="bg-white rounded-[32px] shadow-xl border border-green-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-white text-center">
                        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons-round text-4xl">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-black">订单已创建</h2>
                        <p className="text-green-100 text-sm mt-1 font-bold uppercase tracking-widest">Order Confirmed</p>
                    </div>

                    <div className="p-8 space-y-6">
                        {/* 订单号 */}
                        <div className="text-center">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">订单参考号</p>
                            <p className="text-3xl font-black text-slate-900 tracking-tight">{confirmedOrder.orderRef}</p>
                            <p className="text-xs text-slate-400 mt-1 font-mono">{confirmedOrder.orderId}</p>
                        </div>

                        {/* 条形码 */}
                        <div className="flex flex-col items-center gap-2 bg-slate-50 rounded-2xl p-4">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">扫描条码</p>
                            <img
                                src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${confirmedOrder.orderRef}&scale=3&rotate=N&includetext=true`}
                                alt="Order Barcode"
                                className="h-16 w-auto"
                            />
                        </div>

                        {/* 总额 */}
                        <div className="flex justify-between items-center py-4 border-t border-slate-100">
                            <span className="text-slate-600 font-bold">应付总额</span>
                            <span className="text-2xl font-black text-primary">RM {confirmedOrder.total.toFixed(2)}</span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => window.print()}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
                            >
                                <span className="material-icons-round text-[18px]">print</span>
                                打印
                            </button>
                            <button
                                onClick={handleReset}
                                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all"
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
