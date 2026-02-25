import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService, ProductService } from '../src/services/api';
import { OrderStatus, OrderCreate as OrderCreateType, PaymentMethod } from '../types';
import type { Product as ApiProduct } from '../types';

// NOTE: Product 接口直接复用后端 API 类型，img 字段对应 image_url
interface LocalProduct {
    id: string;
    code: string;
    name: string;
    category: string;
    price: number;
    img: string; // 映射自 api Product.image_url
}

interface OrderItem extends LocalProduct {
    quantity: number;
}

const EQUIPMENTS_LIST = ['汤匙', '烤鸡网', '叉子', '垃圾袋', 'Food Tong', '盘子', '红烧桶', '高盖', '杯子', '篮子', '铁脚架', '装酱碗'];

/**
 * 将后端 Product 格式转换为组件内部 LocalProduct 格式
 */
const mapApiProduct = (p: ApiProduct): LocalProduct => ({
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category || '其他',
    price: p.price,
    img: p.image_url || '',
});

const OrderCreate: React.FC = () => {
    const navigate = useNavigate();
    const [equipmentQuantities, setEquipmentQuantities] = useState<Record<string, number>>({});
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isCartExpanded, setIsCartExpanded] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generatedOrderId, setGeneratedOrderId] = useState('');

    // NOTE: 从后端 API 加载真实产品数据，替换原来的 MOCK_PRODUCTS
    const [apiProducts, setApiProducts] = useState<LocalProduct[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);

    // Form fields
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [address, setAddress] = useState('');
    const [mapsLink, setMapsLink] = useState('');

    useEffect(() => {
        const rand = Math.floor(100000 + Math.random() * 900000);
        setGeneratedOrderId(`KL-${rand}`);

        // 加载产品列表
        ProductService.getAll()
            .then(data => setApiProducts(data.map(mapApiProduct)))
            .catch(err => console.error('Failed to load products', err))
            .finally(() => setProductsLoading(false));
    }, []);

    // 从产品数据中动态生成分类列表
    const CATEGORIES = useMemo(() => {
        const cats = Array.from(new Set(apiProducts.map(p => p.category).filter(Boolean)));
        return ['全部', ...cats];
    }, [apiProducts]);

    const filteredMenu = useMemo(() => {
        return apiProducts.filter(p => {
            const matchesCat = activeCategory === '全部' || p.category === activeCategory;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [apiProducts, activeCategory, searchQuery]);

    const addToCart = (product: LocalProduct) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const handleManualInput = () => {
        const product = apiProducts.find(p => p.code.toLowerCase() === manualCode.toLowerCase());
        if (product) {
            addToCart(product);
            setManualCode('');
        } else {
            alert('未找到该编号的商品');
        }
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const totalPrice = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);

    const handleEquipQuantityChange = (name: string, val: string) => {
        const num = parseInt(val) || 0;
        setEquipmentQuantities(prev => ({ ...prev, [name]: num }));
    };

    const handleFinalConfirm = async () => {
        if (!customerName || !customerPhone || cart.length === 0) {
            alert('请填写客户姓名、电话并选择至少一个菜品');
            return;
        }

        try {
            setIsSubmitting(true);

            const orderData: OrderCreateType = {
                customerName,
                customerPhone,
                address: address || '到店自取',
                items: cart.map(item => ({ id: item.id, quantity: item.quantity })),
                status: OrderStatus.PENDING,
                dueTime: new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Default 1h later
                amount: totalPrice,
                type: address ? 'delivery' : 'takeaway',
                paymentMethod: PaymentMethod.CASH, // Could be enhanced to selector
                driverId: selectedDriver || undefined
            };

            await OrderService.create(orderData);
            setIsConfirming(true);
        } catch (error) {
            console.error("Failed to create order", error);
            alert("提交订单失败，请检查网络或后端状态 (Failed to submit order)");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (isConfirming) {
        const selectedDriverInfo = selectedDriver === 'ali' ? 'Ali Ahmad' : selectedDriver === 'tan' ? 'Tan Wei' : '未指派';
        // Fix: Explicitly cast qty as number to handle cases where TS might infer it as unknown during Object.entries iteration
        const activeEquipments = Object.entries(equipmentQuantities).filter(([_, qty]) => (qty as number) > 0);

        return (
            <div className="flex flex-col h-full bg-slate-50 print-container">
                <header className="pt-12 pb-6 px-6 flex flex-col items-center bg-white border-b border-slate-100 no-print">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-200">
                        <span className="material-icons-round text-white text-3xl">done</span>
                    </div>
                    <h1 className="text-xl font-black text-slate-900">订单已提交</h1>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Kim Long Catering</p>
                </header>

                <main className="flex-1 p-4 md:p-8 overflow-y-auto no-scrollbar pb-32">
                    <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 p-6 md:p-10 space-y-8 relative overflow-hidden">
                        {/* Receipt Decoration */}
                        <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>

                        {/* Header Details */}
                        <div className="flex justify-between items-start">
                            <div>
                                <img
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMzHrQc4moOWsVq3U_YgsvRcTuamSNPoDMHKsSB7UwNtA8cKg9YTKt3lMb01sWCRmIOH2Dg_S_8y2tFE00ugUJtBVdFRJnXbluXbjn7O7cXXsG2lgH4gV51VOuf7EFQX-nL1Af25HQCXs0dksYW4eEbYBKRbxyiJd1_Sp6vq5JoWuKC2v1-wH8VpZxp0PdRYqo1hhiNZNavfDGa4y5jA_pMI57a4ttUOXYmTA4oaQP3P0iPdCEa-WdXys5CeVjHzOulEza5mOvWlvv"
                                    className="h-10 mb-4 grayscale"
                                    alt="Logo"
                                />
                                <h2 className="text-2xl font-black text-slate-900">金龙餐饮订单</h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">官方确认单据 (Official Receipt)</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 font-bold uppercase">订单日期</p>
                                <p className="text-xs font-black text-slate-900 mb-2">{new Date().toLocaleDateString()}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">订单编号</p>
                                <p className="text-sm font-black text-primary">{generatedOrderId}</p>
                            </div>
                        </div>

                        {/* Customer & Address Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-50">
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">客户信息 (Customer)</h4>
                                    <p className="text-sm font-black text-slate-900">{customerName}</p>
                                    <p className="text-xs font-bold text-slate-500">{customerPhone}</p>
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">物流指派 (Logistics)</h4>
                                    <p className="text-xs font-black text-slate-800 flex items-center gap-2">
                                        <span className="material-icons-round text-primary text-sm">local_shipping</span>
                                        {selectedDriverInfo}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">配送地址 (Address)</h4>
                                <p className="text-xs font-medium text-slate-700 leading-relaxed mb-2">{address || '到店自取'}</p>
                                {mapsLink && (
                                    <a href={mapsLink} target="_blank" className="text-[10px] font-bold text-primary flex items-center gap-1 no-print">
                                        <span className="material-icons-round text-xs">open_in_new</span> Google Maps 导航
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Order Items Table */}
                        <div className="pt-6 border-t border-slate-50">
                            <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">菜品明细 (Items)</h4>
                            <div className="space-y-3">
                                {cart.map(item => (
                                    <div key={item.id} className="flex justify-between items-center py-1">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-slate-300 w-12">{item.code}</span>
                                            <div>
                                                <p className="text-xs font-black text-slate-800">{item.name}</p>
                                                <p className="text-[9px] text-slate-400 font-bold">RM {item.price.toFixed(2)} / unit</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <span className="text-xs font-black text-slate-400">x{item.quantity}</span>
                                            <span className="text-sm font-black text-slate-900 w-20 text-right">RM {(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Equipments Section */}
                        {activeEquipments.length > 0 && (
                            <div className="pt-6 border-t border-slate-50">
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">包含设备 (Equipments)</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {activeEquipments.map(([name, qty]) => (
                                        <div key={name} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl">
                                            <span className="material-icons-round text-xs text-slate-400">inventory_2</span>
                                            <span className="text-[10px] font-bold text-slate-600 uppercase">{name}</span>
                                            <span className="ml-auto text-xs font-black text-primary">x{qty}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Total & Barcode */}
                        <div className="pt-8 border-t-2 border-slate-900 border-dashed flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex flex-col items-center md:items-start">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">应付总额 (Total Payable)</p>
                                <span className="text-4xl font-black text-primary leading-none">RM {totalPrice.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <img
                                    src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${generatedOrderId}&scale=2&rotate=N&includetext=false`}
                                    className="h-12 w-auto mix-blend-multiply"
                                    alt="Barcode"
                                />
                                <span className="text-[9px] font-black font-mono text-slate-400 uppercase tracking-widest">{generatedOrderId}</span>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t border-slate-100 flex gap-4 safe-bottom no-print">
                    <button
                        onClick={handlePrint}
                        className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 active:scale-95 transition-all"
                    >
                        <span className="material-icons-round text-base">picture_as_pdf</span>
                        打印 PDF
                    </button>
                    <button
                        onClick={() => navigate('/admin')}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:bg-slate-50 transition-all"
                    >
                        返回控制台
                    </button>
                </footer>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-light relative">
            <header className="sticky top-0 z-50 bg-white shadow-sm px-4 pt-12 pb-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <button onClick={() => navigate('/admin')} className="text-primary font-bold flex items-center gap-1">
                        <span className="material-icons-round text-sm text-primary">close</span> 取消
                    </button>
                    <div className="flex flex-col items-center">
                        <h1 className="text-lg font-bold">创建新订单</h1>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{generatedOrderId}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
                        <span className="material-icons-round text-slate-300">more_horiz</span>
                    </div>
                </div>

                <div className="relative">
                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                    <input
                        type="text"
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-medium focus:ring-1 focus:ring-primary/20"
                        placeholder="快速搜寻菜名或编号..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1 active:scale-90"
                        >
                            <span className="material-icons-round text-xs">cancel</span>
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto no-scrollbar pb-48">
                {/* 1. Customer Info */}
                <section className="p-4 space-y-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-1">客户基本信息</h2>
                    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                        <input
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold"
                            placeholder="客户姓名"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                        />
                        <input
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold"
                            placeholder="联系电话 (+60)"
                            value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                        />
                        <textarea
                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold min-h-[60px]"
                            placeholder="配送详细地址..."
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                        <div className="relative">
                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-primary text-sm">link</span>
                            <input
                                className="w-full pl-9 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold"
                                placeholder="输入地址后和google map 链接"
                                value={mapsLink}
                                onChange={e => setMapsLink(e.target.value)}
                            />
                        </div>
                    </div>
                </section>

                {/* 2. Dish Selection */}
                <section className="space-y-3">
                    <div className="px-5 flex items-center justify-between">
                        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">菜色选择</h2>
                        <span className="text-[10px] font-bold text-primary">左滑切换分类</span>
                    </div>

                    <div className="px-4 flex gap-2 overflow-x-auto no-scrollbar">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border ${activeCategory === cat ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-400 border-slate-100'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    <div className="px-4 flex gap-2">
                        <div className="flex-1 relative">
                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">qr_code_scanner</span>
                            <input
                                className="w-full pl-9 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-[10px] font-bold shadow-sm"
                                placeholder="加入手动输入code或barcode选择菜单"
                                value={manualCode}
                                onChange={e => setManualCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleManualInput()}
                            />
                        </div>
                        <button
                            onClick={handleManualInput}
                            className="px-4 bg-slate-800 text-white rounded-2xl text-[10px] font-bold active:scale-95 shadow-sm"
                        >
                            添加
                        </button>
                    </div>

                    <div className="px-4 grid grid-cols-2 gap-3 mt-2">
                        {productsLoading ? (
                            <div className="col-span-2 py-10 flex items-center justify-center text-slate-300">
                                <span className="material-icons-round animate-spin text-3xl mr-2">autorenew</span>
                                <span className="text-sm font-bold">加载菜单中...</span>
                            </div>
                        ) : filteredMenu.length === 0 ? (
                            <div className="col-span-2 py-10 flex flex-col items-center text-slate-300">
                                <span className="material-icons-round text-5xl mb-2">fastfood</span>
                                <p className="text-xs font-bold">此分类暂无菜品</p>
                            </div>
                        ) : filteredMenu.map(p => (
                            <div
                                key={p.id}
                                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 relative"
                            >
                                <div className="absolute top-2 left-2 bg-slate-900/60 backdrop-blur-sm text-[8px] text-white px-2 py-0.5 rounded font-black uppercase z-10">
                                    {p.code}
                                </div>
                                <img src={p.img} className="w-full h-28 object-cover" alt={p.name} />
                                <div className="p-3">
                                    <h3 className="text-[10px] font-bold text-slate-800 truncate mb-2">{p.name}</h3>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-black text-primary">RM {p.price.toFixed(2)}</span>
                                        <button onClick={() => addToCart(p)} className="active:scale-125 transition-transform">
                                            <span className="material-icons-round text-primary text-lg">add_circle</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 3. Equipments Section */}
                <section className="p-4 space-y-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-1">包含设备 (可选数量)</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {EQUIPMENTS_LIST.map((eq) => (
                            <div
                                key={eq}
                                className={`bg-white rounded-2xl p-4 border transition-all flex flex-col gap-3 shadow-sm ${
                                    // Fix: Defensive check against unknown or undefined values when indexing the record
                                    (equipmentQuantities[eq] || 0) > 0 ? 'border-primary/50 bg-primary/5' : 'border-slate-100'
                                    }`}
                            >
                                <span className="text-[10px] font-bold text-slate-700 uppercase">{eq}</span>
                                <div className="relative">
                                    <span className="material-icons-round absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 text-xs">edit</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        className="w-full bg-slate-50 border-none rounded-xl py-2 pl-7 pr-2 text-xs font-bold text-primary focus:ring-1 focus:ring-primary/20"
                                        value={equipmentQuantities[eq] || ''}
                                        onChange={(e) => handleEquipQuantityChange(eq, e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 4. Driver Assignment */}
                <section className="p-4 space-y-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-1">指派配送员选项完善</h2>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                        {[
                            { id: 'ali', name: 'Ali Ahmad', status: '可选', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCr1A0UkYD47bPyjINVhOMMiB-pdO6Vk9GkIst7TGBPcENh6mor-beIE0m-zai1jb8ISvg0dfAHur75hz38kljvdLDYDhZL-2ExznnuKSVz_DC0ZJEAL2uTdFO5HUVg3AYRyECUgerFv4RSqf8DUrKNHpID4Dd5JhD0TnTCZbd2A9ZDW4MCHQT65EjZTHjvSdZf_OqT0CAh_1IQOS7JVmm59EG9tT5QDfeexTdpUkUFKHXXnZwE66rkmWOuJ0Q7WWSPtN1nUcxBxRf' },
                            { id: 'tan', name: 'Tan Wei', status: '附近', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDLlyYiZxjedNYrM_16MJem_-z8phukD8Y0feARWqrmek1SnFPW4HVi7sm7VddsZtD-UU756Kogt_EUqpzfEUqXDDKMI3s2g6IxxLz3NBeqHkMSSCG0Cf-z3HYu02DWkNOFWb-bA9YVclQyaW35kBs0WTXA2ImEqpPqbRazqVCsx-z2c2OHILM7zBpNigWz9_gIcnizGf9SOcVa0elsIXsnl6J_ZOWF6G9MeORyCWaoUvIAua6w0WMg-Z4HRcPizWY5q-0CMfhjjIz8' }
                        ].map((driver) => (
                            <button
                                key={driver.id}
                                onClick={() => setSelectedDriver(driver.id)}
                                className={`min-w-[140px] p-4 rounded-[32px] border transition-all flex flex-col items-center gap-3 relative ${selectedDriver === driver.id ? 'bg-primary/5 border-primary shadow-md' : 'bg-white border-slate-100 shadow-sm'
                                    }`}
                            >
                                <div className="relative">
                                    <img src={driver.img} className="w-16 h-16 rounded-full border-2 border-white shadow-sm object-cover" alt={driver.name} />
                                    <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 border-4 border-white rounded-full"></div>
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-bold text-slate-800">{driver.name}</p>
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${driver.status === '可选' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                        {driver.status}
                                    </span>
                                </div>
                                {selectedDriver === driver.id && (
                                    <div className="absolute top-2 right-4 text-primary">
                                        <span className="material-icons-round text-lg">check_circle</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </section>
            </main>

            {/* Floating Cart / Bottom Action Area */}
            <div className={`fixed bottom-0 left-0 right-0 bg-white shadow-[0_-15px_40px_rgba(0,0,0,0.1)] z-[60] safe-bottom transition-all duration-300 ${isCartExpanded ? 'rounded-t-[40px]' : 'rounded-t-3xl'}`}>
                {isCartExpanded && (
                    <div className="p-6 max-h-[40vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-slate-900">订单详细清单 ({cart.length})</h3>
                            <button onClick={() => setIsCartExpanded(false)} className="text-slate-400 p-2"><span className="material-icons-round">expand_more</span></button>
                        </div>
                        <div className="space-y-4">
                            {cart.map(item => (
                                <div key={item.id} className="flex items-center gap-4">
                                    <img src={item.img} className="w-14 h-14 rounded-2xl object-cover border border-slate-100" />
                                    <div className="flex-1">
                                        <h4 className="text-xs font-bold text-slate-800">{item.name}</h4>
                                        <p className="text-[11px] text-primary font-black">RM {(item.price * item.quantity).toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-3 py-1.5 border border-slate-100">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 active:scale-90"><span className="material-icons-round text-sm">remove</span></button>
                                        <span className="text-sm font-black min-w-[20px] text-center">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-full bg-primary text-white shadow-sm flex items-center justify-center active:scale-90"><span className="material-icons-round text-sm">add</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="p-5 max-w-md mx-auto">
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                            <button
                                onClick={() => setIsCartExpanded(!isCartExpanded)}
                                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1"
                            >
                                订单明细 <span className="material-icons-round text-xs">{isCartExpanded ? 'expand_more' : 'expand_less'}</span>
                            </button>
                            <span className="text-3xl font-black text-primary leading-none tracking-tighter">RM {totalPrice.toFixed(2)}</span>
                        </div>
                        <button
                            onClick={handleFinalConfirm}
                            disabled={cart.length === 0 || isSubmitting}
                            className={`px-12 py-5 rounded-2xl font-bold text-base shadow-xl transition-all active:scale-95 flex items-center gap-2 ${cart.length > 0 && !isSubmitting ? 'bg-primary text-white shadow-primary/30' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                }`}
                        >
                            {isSubmitting ? '正在提交...' : '发送并确认'}
                            {!isSubmitting && <span className="material-icons-round text-sm">send</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderCreate;
