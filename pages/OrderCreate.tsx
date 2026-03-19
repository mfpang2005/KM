import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService, ProductService, CustomerService, type Customer } from '../src/services/api';
import { OrderStatus, OrderCreate as OrderCreateType, PaymentMethod } from '../types';
import type { Product as ApiProduct } from '../types';

// NOTE: Product 接口直接复用后端 API 类型，img 字段对应 image_url
interface LocalProduct {
    id: string;
    code: string;
    name: string;
    category: string;
    price: number;
    img: string;
}

interface OrderItem extends LocalProduct {
    quantity: number;
    note?: string;
    originalPrice: number;
}

const EQUIPMENTS_LIST = [
    "设备 (可选数量)", "汤匙", "烤鸡网", "叉子", "垃圾袋",
    "Food Tong", "盘子", "红烧桶", "高盖", "杯子", "篮子", "铁脚架", "装酱碗"
];

const mapApiProduct = (p: ApiProduct): LocalProduct => ({
    id: p?.id || '',
    code: p?.code || 'UNKNOWN',
    name: p?.name || '未命名商品',
    category: p?.category || '其他',
    price: typeof p?.price === 'number' ? p.price : 0,
    img: p?.image_url || '',
});

const OrderCreate: React.FC = () => {
    const navigate = useNavigate();
    const [equipmentQuantities, setEquipmentQuantities] = useState<Record<string, number>>({});
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isCartExpanded, setIsCartExpanded] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generatedOrderId, setGeneratedOrderId] = useState('');
    const [apiProducts, setApiProducts] = useState<LocalProduct[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);

    // Form fields
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [address, setAddress] = useState('');
    const [mapsLink, setMapsLink] = useState('');
    const [remarks, setRemarks] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('');

    // Customer suggestions
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

    useEffect(() => {
        const rand = Math.floor(100000 + Math.random() * 900000);
        setGeneratedOrderId(`KL-${rand}`);

        ProductService.getAll()
            .then(data => setApiProducts(data.map(mapApiProduct)))
            .catch(err => console.error('Failed to load products', err))
            .finally(() => setProductsLoading(false));
    }, []);

    // Customer lookup logic
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

    const CATEGORIES = useMemo(() => {
        if (!apiProducts || !Array.isArray(apiProducts)) return ['全部'];
        const cats = Array.from(new Set(apiProducts.map(p => p.category).filter(Boolean)));
        return ['全部', ...cats];
    }, [apiProducts]);

    const filteredMenu = useMemo(() => {
        if (!apiProducts || !Array.isArray(apiProducts)) return [];
        return apiProducts.filter(p => {
            const matchesCat = activeCategory === '全部' || p.category === activeCategory;
            const name = p.name || '';
            const code = p.code || '';
            const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || code.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [apiProducts, activeCategory, searchQuery]);

    const addToCart = (product: LocalProduct) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1, originalPrice: product.price }];
        });
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

    const setManualQuantity = (id: string, value: string) => {
        const val = parseInt(value) || 0;
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, quantity: val };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const updatePrice = (id: string, newPrice: string) => {
        const price = newPrice === '' ? 0 : parseFloat(newPrice);
        setCart(prev => prev.map(item => 
            item.id === id ? { ...item, price } : item
        ));
    };

    const updateItemNote = (id: string, note: string) => {
        setCart(prev => prev.map(item => 
            item.id === id ? { ...item, note } : item
        ));
    };

    const totalPrice = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);

    const updateEquipmentQty = (name: string, delta: number) => {
        setEquipmentQuantities(prev => ({
            ...prev,
            [name]: Math.max(0, (prev[name] || 0) + delta)
        }));
    };

    const handleFinalConfirm = async () => {
        if (!customerName || !customerPhone || cart.length === 0) {
            alert('请填写客户姓名、电话并选择至少一个菜品');
            return;
        }

        try {
            setIsSubmitting(true);
            const activeEquipments = Object.fromEntries(
                Object.entries(equipmentQuantities).filter(([_, qty]) => (qty as number) > 0)
            ) as Record<string, number>;

            const orderData: OrderCreateType = {
                customerName,
                customerPhone,
                address: address || '到店自取',
                items: cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    note: item.note
                })),
                status: OrderStatus.PENDING,
                dueTime: new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                amount: totalPrice,
                type: address ? 'delivery' : 'takeaway',
                paymentMethod: PaymentMethod.CASH,
                driverId: selectedDriver || undefined,
                equipments: Object.keys(activeEquipments).length > 0 ? activeEquipments : undefined,
                eventDate,
                eventTime,
                mapsLink,
                remarks
            };

            await OrderService.create(orderData);
            setIsConfirming(true);
        } catch (error) {
            console.error("Failed to create order", error);
            alert("提交订单失败，请检查网络或后端状态");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isConfirming) {
        const selectedDriverInfo = selectedDriver === 'ali' ? 'Ali Ahmad' : selectedDriver === 'tan' ? 'Tan Wei' : '未指派';
        const activeEquipments = Object.entries(equipmentQuantities).filter(([_, qty]) => (qty as number) > 0);

        return (
            <div className="flex flex-col h-full bg-slate-50 print-container">
                <header className="pt-12 pb-6 px-6 flex flex-col items-center bg-white border-b border-slate-100 no-print">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-200">
                        <span className="material-icons-round text-white text-3xl">done</span>
                    </div>
                    <h1 className="text-xl font-black text-slate-900">订单已提交</h1>
                </header>

                <main className="flex-1 p-4 md:p-8 overflow-y-auto no-scrollbar pb-32">
                    <div className="max-w-3xl mx-auto bg-white rounded-[40px] shadow-2xl border border-slate-100 p-6 md:p-10 space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-2">
                                <h2 className="text-2xl font-black text-slate-900">金龙餐饮订单</h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">官方确认单 (Customer Bill)</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-black text-slate-900 mb-2">{new Date().toLocaleDateString()}</p>
                                <p className="text-sm font-black text-primary">{generatedOrderId}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-6 border-t border-slate-50">
                            <div>
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">客户姓名</h4>
                                <p className="text-sm font-black text-slate-900">{customerName}</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">联络电话</h4>
                                <p className="text-sm font-black text-slate-900 font-mono tracking-tight">{customerPhone}</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">活动时间</h4>
                                <p className="text-sm font-black text-slate-900">
                                    {eventDate} {eventTime}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">配送地址</h4>
                                <p className="text-xs font-bold text-slate-700 leading-relaxed">{address || '到店自取'}</p>
                                {mapsLink && (
                                    <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black text-red-500 hover:text-red-600 transition-colors mt-1.5 uppercase tracking-widest bg-red-50 px-2 py-0.5 rounded">
                                        <span className="material-icons-round text-xs">place</span>
                                        Google Maps
                                    </a>
                                )}
                            </div>
                            {remarks && (
                                <div className="md:col-span-2 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
                                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">整单备注</h4>
                                    <p className="text-xs font-bold text-amber-900 leading-relaxed">{remarks}</p>
                                </div>
                            )}
                        </div>

                        <div className="pt-6 border-t border-slate-50">
                            <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">菜品明细</h4>
                            <div className="space-y-3">
                                {cart.map(item => (
                                    <div key={item.id} className="flex justify-between items-center py-1">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-slate-300 w-12">{item.code}</span>
                                            <p className="text-xs font-black text-slate-800">{item.name}</p>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <span className="text-xs font-black text-slate-400">x{item.quantity}</span>
                                            <span className="text-sm font-black text-slate-900">RM {(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-8 border-t-2 border-slate-900 border-dashed flex justify-between items-center">
                            <span className="text-4xl font-black text-primary">RM {totalPrice.toFixed(2)}</span>
                            <div className="flex flex-col items-center">
                                <img src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${generatedOrderId}&scale=2&rotate=N&includetext=false`} className="h-10 opacity-60" alt="barcode" />
                                <span className="text-[9px] font-black font-mono text-slate-400 uppercase">{generatedOrderId}</span>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t border-slate-100 flex gap-4 safe-bottom no-print">
                    <button onClick={() => window.print()} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all">打印 PDF</button>
                    <button onClick={() => navigate('/admin')} className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm active:bg-slate-50 transition-all">返回控制台</button>
                </footer>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#FDFDFD] relative overflow-hidden">
            <header className="sticky top-0 z-[100] bg-white/70 backdrop-blur-xl border-b border-slate-100/50 px-6 py-4 lg:py-6">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => navigate('/admin')} 
                            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
                        >
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">创建新订单</h1>
                            <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">{generatedOrderId}</p>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center px-4 py-2 bg-slate-50 rounded-full border border-slate-100 gap-3">
                        <span className="material-icons-round text-slate-400 text-sm">event</span>
                        <span className="text-xs font-bold text-slate-600">{new Date().toLocaleDateString()}</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 lg:px-8 py-6 lg:py-10">
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12">
                    {/* 左侧：选购区域 (Dishes & Materials) */}
                    <div className="lg:col-span-7 xl:col-span-8 space-y-12">
                        {/* 选择菜色 */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shadow-sm">
                                        <span className="material-icons-round text-lg">restaurant</span>
                                    </span>
                                    <div>
                                        <h2 className="text-base font-black uppercase tracking-widest text-slate-800">选择菜色</h2>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Product Selection</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-6">
                                <div className="flex flex-col md:flex-row gap-4">
                                    <div className="flex-1 relative group">
                                        <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-sm group-focus-within:text-primary transition-colors">search</span>
                                        <input
                                            type="text"
                                            className="w-full pl-14 pr-10 py-4.5 bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.02)] rounded-[22px] text-sm font-bold outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all placeholder:text-slate-300"
                                            placeholder="搜寻菜名、简称或编号..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 -mx-2 px-2">
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setActiveCategory(cat)}
                                            className={`px-6 py-3 rounded-2xl text-[11px] font-black transition-all whitespace-nowrap border-2 ${activeCategory === cat ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-slate-400 border-slate-50 hover:border-slate-100 hover:text-slate-600'}`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                                    {productsLoading ? (
                                        <div className="col-span-full py-24 flex flex-col items-center justify-center text-slate-300 gap-4">
                                            <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">初始化菜单 (Loading Products)...</span>
                                        </div>
                                    ) : filteredMenu.length === 0 ? (
                                        <div className="col-span-full py-24 bg-white/50 rounded-[48px] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300">
                                            <span className="material-icons-round text-6xl mb-4 opacity-20">no_food</span>
                                            <p className="font-bold text-xs uppercase tracking-widest text-slate-400">未能找到相关菜品 (No products found)</p>
                                        </div>
                                    ) : filteredMenu.map(p => (
                                        <div key={p.id} className="group bg-white rounded-[32px] overflow-hidden border border-slate-100/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_24px_50px_rgb(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-1.5 relative">
                                            <div className="aspect-[4/3] overflow-hidden relative">
                                                <div className="absolute top-4 left-4 z-10">
                                                    <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md text-[9px] text-white rounded-lg font-black uppercase tracking-widest border border-white/10">{p.code}</span>
                                                </div>
                                                <img src={p.img || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={p.name} />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            </div>
                                            <div className="p-5 space-y-4">
                                                <h3 className="text-sm font-black text-slate-800 leading-tight h-10 overflow-hidden line-clamp-2">{p.name}</h3>
                                                <div className="flex justify-between items-center pt-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Price</span>
                                                        <span className="text-base font-black text-primary">RM {p.price.toFixed(2)}</span>
                                                    </div>
                                                    <button onClick={() => addToCart(p)} className="w-11 h-11 rounded-2xl bg-primary text-white shadow-xl shadow-primary/25 active:scale-90 hover:scale-105 transition-all flex items-center justify-center">
                                                        <span className="material-icons-round">add_shopping_cart</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* 包含设备 / 物资 */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-sm">
                                    <span className="material-icons-round text-lg">handyman</span>
                                </span>
                                <div>
                                    <h2 className="text-base font-black uppercase tracking-widest text-slate-800">包含设备 / 物资</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Equipment & Logistics</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-[40px] p-8 shadow-[0_8px_40px_rgb(0,0,0,0.03)] border border-slate-100">
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                                    {EQUIPMENTS_LIST.map(eq => (
                                        <div key={eq} className={`flex flex-col justify-between p-5 rounded-[28px] border-2 transition-all duration-300 ${equipmentQuantities[eq] > 0 ? 'bg-blue-50/40 border-blue-100/50 ring-2 ring-blue-100/20' : 'bg-slate-50/40 border-slate-50 hover:bg-white hover:border-slate-100'}`}>
                                            <span className="text-xs font-black text-slate-700 mb-4 truncate leading-tight" title={eq}>{eq}</span>
                                            <div className="flex items-center justify-between">
                                                <button
                                                    onClick={() => updateEquipmentQty(eq, -1)}
                                                    className="w-9 h-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all disabled:opacity-30 shadow-sm"
                                                    disabled={!equipmentQuantities[eq]}
                                                >
                                                    <span className="material-icons-round text-sm">remove</span>
                                                </button>
                                                <span className="text-sm font-black w-8 text-center text-slate-900">{equipmentQuantities[eq] || 0}</span>
                                                <button
                                                    onClick={() => updateEquipmentQty(eq, 1)}
                                                    className="w-9 h-9 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all shadow-lg shadow-blue-500/20"
                                                >
                                                    <span className="material-icons-round text-sm">add</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* 右侧：配置区域 (Customer & Receipt) - Sticky */}
                    <div className="lg:col-span-5 xl:col-span-4 space-y-8">
                        <div className="lg:sticky lg:top-32 space-y-8">
                            {/* 客户资料 - Compact */}
                            <section className="bg-white rounded-[40px] p-8 shadow-[0_20px_50px_rgb(0,0,0,0.04)] border border-slate-100 space-y-7">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                        <span className="material-icons-round text-sm">assignment_ind</span>
                                    </span>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">客户信息</h3>
                                </div>
                                
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                                        <div className="space-y-1.5 relative">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1">
                                                <span className="material-icons-round text-[12px]">person</span>姓名
                                            </label>
                                            <div className="relative">
                                                <input
                                                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 focus:border-primary/30 focus:bg-white rounded-xl text-xs font-bold transition-all outline-none"
                                                    placeholder="客户姓名"
                                                    autoComplete="off"
                                                    value={customerName}
                                                    onChange={e => setCustomerName(e.target.value)}
                                                    onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)}
                                                />
                                                {isSearchingCustomers && (
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                        <span className="material-icons-round text-primary animate-spin text-xs">autorenew</span>
                                                    </div>
                                                )}
                                                {showSuggestions && (
                                                    <div className="absolute z-[100] left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-48 overflow-y-auto no-scrollbar py-2">
                                                        {customerSuggestions.map(c => (
                                                            <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                                                                <div>
                                                                    <p className="text-xs font-black text-slate-800">{c.name}</p>
                                                                    <p className="text-[9px] text-slate-400 font-bold">{c.phone}</p>
                                                                </div>
                                                                <span className="material-icons-round text-primary/30 group-hover:text-primary transition-colors text-base">history</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1">
                                                <span className="material-icons-round text-[12px]">phone</span>电话
                                            </label>
                                            <input
                                                className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 focus:border-primary/30 focus:bg-white rounded-xl text-xs font-bold transition-all outline-none font-mono"
                                                placeholder="+60 12..."
                                                autoComplete="off"
                                                value={customerPhone}
                                                onChange={e => setCustomerPhone(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1">
                                                <span className="material-icons-round text-[12px] text-violet-500">event</span>日期
                                            </label>
                                            <input type="date" className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-xs font-bold outline-none" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1">
                                                <span className="material-icons-round text-[12px] text-violet-500">schedule</span>时间
                                            </label>
                                            <input type="time" className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-xs font-bold outline-none" value={eventTime} onChange={e => setEventTime(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1">
                                            <span className="material-icons-round text-[12px] text-red-500">place</span>详细地址
                                        </label>
                                        <div className="space-y-2">
                                            <textarea className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-xs font-bold outline-none min-h-[60px] resize-none" placeholder="配送地址..." value={address} onChange={e => setAddress(e.target.value)} />
                                            <input className="w-full px-4 py-2.5 bg-slate-50/30 border border-slate-100 focus:border-primary/30 rounded-xl text-[10px] font-bold outline-none" placeholder="Google Maps 链接..." value={mapsLink} onChange={e => setMapsLink(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1">
                                            <span className="material-icons-round text-[12px] text-amber-500">notes</span>整单备注
                                        </label>
                                        <input className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-xs font-medium outline-none" placeholder="特殊要求 (Skip spicy, etc)..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                                    </div>
                                </div>
                            </section>

                            {/* 订单明细 - Receipt Style */}
                            <section className="bg-white rounded-[40px] shadow-[0_30px_60px_rgb(0,0,0,0.08)] border border-slate-100 flex flex-col max-h-[calc(100vh-420px)] relative overflow-hidden">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 to-primary"></div>
                                <div className="p-7 border-b border-slate-50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-sm font-black text-slate-900 border-l-4 border-primary pl-4">订单明细</h3>
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mt-1">Receipt Preview</span>
                                    </div>
                                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight">{cart.length} 项</span>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-6 space-y-5">
                                    {cart.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-24 text-slate-200">
                                            <span className="material-icons-round text-5xl mb-3 opacity-20">shopping_bag</span>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">购物车为空</p>
                                        </div>
                                    ) : cart.map(item => (
                                        <div key={item.id} className="group flex flex-col gap-3 pb-5 border-b border-slate-50 last:border-0 last:pb-0">
                                            <div className="flex gap-4">
                                                <img src={item.img} className="w-11 h-11 rounded-[14px] object-cover shadow-sm shrink-0 ring-1 ring-slate-100" alt={item.name} />
                                                <div className="flex-1 flex flex-col justify-between min-w-0">
                                                    <div className="flex justify-between items-start gap-3">
                                                        <h4 className="text-[11px] font-black text-slate-800 line-clamp-1 leading-none pt-1">{item.name}</h4>
                                                        <div className="flex items-center gap-2.5 scale-90 origin-right">
                                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-white active:scale-95 transition-all shadow-sm"><span className="material-icons-round text-[12px]">remove</span></button>
                                                            <input type="number" className="w-7 bg-transparent border-none text-[11px] font-black text-center outline-none p-0" value={item.quantity} onChange={(e) => setManualQuantity(item.id, e.target.value)} />
                                                            <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center active:scale-95 transition-all shadow-md"><span className="material-icons-round text-[12px]">add</span></button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center justify-between gap-4 mt-2">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10px] font-black text-primary">RM</span>
                                                                <input type="number" step="0.01" className="w-14 bg-white border-b border-slate-100 text-[11px] font-black text-primary outline-none focus:border-primary" value={item.price || ''} onChange={(e) => updatePrice(item.id, e.target.value)} />
                                                            </div>
                                                            {item.price !== item.originalPrice && <span className="text-[8px] font-bold text-slate-300">Orig: {item.originalPrice.toFixed(2)}</span>}
                                                        </div>
                                                        <input type="text" placeholder="项备注..." className="flex-1 h-6 bg-slate-50 px-2 rounded-lg text-[9px] font-bold text-slate-500 outline-none border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-200" value={item.note || ''} onChange={(e) => updateItemNote(item.id, e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="p-8 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100 space-y-6">
                                    <div className="flex justify-between items-end">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">应付总额 / Total Bill</span>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-base font-black text-primary">RM</span>
                                                <span className="text-4xl font-black text-primary tracking-tighter leading-none">{totalPrice.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleFinalConfirm}
                                        disabled={cart.length === 0 || isSubmitting}
                                        className={`w-full py-5 rounded-[22px] font-black text-sm uppercase tracking-[0.15em] shadow-2xl transition-all active:scale-[0.97] flex items-center justify-center gap-3 ${cart.length > 0 && !isSubmitting ? 'bg-primary text-white shadow-primary/30 hover:shadow-primary/40' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                    >
                                        {isSubmitting ? '正在处理...' : '发送并确认订单'}
                                        {!isSubmitting && <span className="material-icons-round text-lg">rocket_launch</span>}
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </main>

            <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-[150] safe-bottom transition-all duration-500 ease-in-out ${isCartExpanded ? 'rounded-t-[40px] h-[60vh]' : 'rounded-t-3xl h-24'}`}>
                {isCartExpanded ? (
                    <div className="flex flex-col h-full py-6">
                        <div className="px-6 flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-slate-900">清单 ({cart.length})</h3>
                            <button onClick={() => setIsCartExpanded(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><span className="material-icons-round text-slate-400">expand_more</span></button>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar px-6 space-y-4">
                            {cart.map(item => (
                                <div key={item.id} className="flex flex-col gap-2 bg-slate-50 p-3 rounded-2xl mx-6">
                                    <div className="flex items-center gap-3">
                                        <img src={item.img} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[11px] font-bold text-slate-800 truncate">{item.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="flex items-center bg-white border border-slate-100 rounded-lg px-1.5 py-0.5 shadow-sm w-fit">
                                                    <span className="text-[9px] font-black text-primary mr-0.5">RM</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        className="w-12 bg-transparent border-none text-[10px] font-black text-primary outline-none p-0"
                                                        value={item.price || ''}
                                                        onChange={(e) => updatePrice(item.id, e.target.value)}
                                                    />
                                                </div>
                                                <span className="text-[8px] font-bold text-slate-300">Orig: RM {item.originalPrice.toFixed(2)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2.5 scale-90">
                                            <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm"><span className="material-icons-round text-xs">remove</span></button>
                                            <input 
                                                type="number"
                                                className="w-8 bg-transparent border-none text-xs font-black text-center outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                value={item.quantity}
                                                onChange={(e) => setManualQuantity(item.id, e.target.value)}
                                            />
                                            <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-sm"><span className="material-icons-round text-xs">add</span></button>
                                        </div>
                                    </div>
                                    <input 
                                        type="text"
                                        placeholder="项备注..."
                                        className="w-full h-6 bg-white/50 border border-slate-100 rounded-md px-2 text-[9px] font-medium outline-none"
                                        value={item.note || ''}
                                        onChange={(e) => updateItemNote(item.id, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-slate-50">
                            <button onClick={handleFinalConfirm} disabled={cart.length === 0 || isSubmitting} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest">发送并确认 RM {totalPrice.toFixed(2)}</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between px-6 h-full">
                        <div onClick={() => setIsCartExpanded(true)} className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">查看详情<span className="material-icons-round text-[10px]">expand_less</span></span><span className="text-2xl font-black text-primary leading-none">RM {totalPrice.toFixed(2)}</span></div>
                        <button onClick={handleFinalConfirm} disabled={cart.length === 0 || isSubmitting} className={`px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${cart.length > 0 && !isSubmitting ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-200 text-slate-400'}`}>发送并确认</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrderCreate;
