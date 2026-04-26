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
    "汤匙 OTU Spoon", "叉子 OTU Fork", "盘子 OTU Plate", "杯子 OTU Cup", 
    "垃圾袋 Garbage Bag", "白钢网 S/L Net", "食物夹子 Serving Tong", "红烧桶 Plastic Sauce",
    "白钢高盖 Chafing High Lid", "篮子 Plastic Basket", "铁脚架 Chafing Rack", "装酱碗 Sauce Bowl"
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
    const [customEquipments, setCustomEquipments] = useState<string[]>([]);
    const [isAddingCustom, setIsAddingCustom] = useState(false);
    const [newCustomName, setNewCustomName] = useState('');
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isCartExpanded, setIsCartExpanded] = useState(false);
    const [isReceiptExpanded, setIsReceiptExpanded] = useState(false);
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
    
    // Billing and Financials
    const [billingUnit, setBillingUnit] = useState('PAX');
    const [billingQty, setBillingQty] = useState<number>(0);
    const [billingPrice, setBillingPrice] = useState<number>(0);
    const [deposit, setDeposit] = useState<number>(0);

    const billingSubtotal = useMemo(() => billingQty * billingPrice, [billingQty, billingPrice]);
    const balanceDue = useMemo(() => billingSubtotal - deposit, [billingSubtotal, deposit]);

    useEffect(() => {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const rand = Math.floor(100 + Math.random() * 900);
        setGeneratedOrderId(`KM-${yy}/${mm}/${dd}/${rand}`);

        ProductService.getAll()
            .then(data => setApiProducts(data.map(mapApiProduct)))
            .catch(err => console.error('Failed to load products', err))
            .finally(() => setProductsLoading(false));
    }, []);

    // PAX Auto-locking logic
    useEffect(() => {
        if (billingUnit === 'PAX' && billingQty > 0) {
            const autoQty = billingQty * 2;
            const lockedItems = ['盘子 OTU Plate', '汤匙 OTU Spoon', '叉子 OTU Fork', '杯子 OTU Cup'];
            setEquipmentQuantities(prev => {
                const next = { ...prev };
                lockedItems.forEach(item => {
                    next[item] = autoQty;
                });
                return next;
            });
        }
    }, [billingUnit, billingQty]);

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

    const handleAddCustomEquipment = () => {
        const name = newCustomName.trim();
        if (name && !EQUIPMENTS_LIST.includes(name) && !customEquipments.includes(name)) {
            setCustomEquipments(prev => [...prev, name]);
            setEquipmentQuantities(prev => ({ ...prev, [name]: 0 }));
            setNewCustomName('');
            setIsAddingCustom(false);
        }
    };

    const handleFinalConfirm = async () => {
        if (!customerName || !customerPhone || !address || billingQty <= 0 || billingPrice <= 0) {
            alert('请填写必填项 (*)：姓名、电话、活动地址、计费数量及单价');
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
                dueTime: (eventDate && eventTime) 
                    ? new Date(`${eventDate}T${eventTime}:00`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                eventDate,
                eventTime,
                mapsLink,
                remarks,
                billingUnit: billingUnit as any,
                billingQuantity: billingQty,
                billingPricePerUnit: billingPrice,
                deposit: deposit,
                amount: billingSubtotal,
                balance: balanceDue,
                type: address ? 'delivery' : 'takeaway',
                paymentMethod: PaymentMethod.CASH,
                driverId: undefined,
                equipments: Object.keys(activeEquipments).length > 0 ? activeEquipments : undefined
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
        const activeEquipments = Object.fromEntries(
            Object.entries(equipmentQuantities).filter(([_, qty]) => (qty as number) > 0)
        ) as Record<string, number>;

        return (
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:items-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in print:bg-white print:p-0 print:items-start print:justify-start">
                <style>{`
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    @media print {
                        body * { visibility: hidden; }
                        #printable-order-wrapper, #printable-order-wrapper * { visibility: visible; }
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
                        .no-print-area, .no-print-area * { display: none !important; }
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
                        
                        <button
                            onClick={() => navigate('/admin')}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-black/50 transition-colors z-10 no-print-area"
                        >
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
                            <div className="text-center pb-6 border-b-2 border-slate-800 flex flex-col items-center mt-6 print:mt-0">
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
                                <p className="text-xs print:text-[10px] text-blue-600 font-black tracking-widest mt-4 uppercase bg-blue-50 px-3 py-1 rounded-md">CUSTOMER BILL</p>
                            </div>

                            <div className="flex flex-col md:flex-row justify-between gap-6 print:gap-4 pb-4">
                                <div className="flex-1 space-y-2">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Billed To</h3>
                                    <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-sm print:text-xs">
                                        <span className="text-slate-500 font-medium">Name:</span>
                                        <span className="font-bold text-slate-900">{customerName || '-'}</span>

                                        <span className="text-slate-500 font-medium">Phone:</span>
                                        <span className="font-bold text-slate-900 font-mono">{customerPhone || '-'}</span>

                                        <span className="text-slate-500 font-medium">Address:</span>
                                        <span className="font-bold text-slate-900 leading-snug">{address || 'Self Pickup'}</span>
                                    </div>
                                </div>

                                <div className="flex gap-4 sm:justify-end">
                                    <div className="space-y-2 flex-grow sm:flex-grow-0 min-w-[200px]">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 text-right">Order Details</h3>
                                        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm print:text-xs text-right">
                                            <span className="text-slate-500 font-medium">Order Ref:</span>
                                            <span className="font-black text-slate-900 font-mono">{generatedOrderId}</span>

                                            <span className="text-slate-500 font-medium">Created:</span>
                                            <span className="font-bold text-slate-700">{new Date().toLocaleString('en-MY', { hour12: false })}</span>

                                            <span className="text-slate-500 font-medium">Event Time:</span>
                                            <span className="font-bold text-slate-900">{eventDate} {eventTime}</span>
                                        </div>
                                    </div>

                                    <div className="shrink-0 pt-1">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(generatedOrderId)}&bgcolor=ffffff&color=0f172a&margin=0`}
                                            alt="Order QR Code"
                                            className="w-16 h-16 border border-slate-200 p-1"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Billing Details</h3>
                                <table className="w-full text-sm print:text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b-2 border-slate-800">
                                            <th className="text-left py-2 font-black text-slate-700 uppercase tracking-wider">Unit</th>
                                            <th className="text-center py-2 font-black text-slate-700 uppercase tracking-wider w-16">Qty</th>
                                            <th className="text-right py-2 font-black text-slate-700 uppercase tracking-wider w-24">Unit Price</th>
                                            <th className="text-right py-2 font-black text-slate-700 uppercase tracking-wider w-24">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        <tr className="group">
                                            <td className="py-3 pr-2 font-bold text-slate-900">{billingUnit}</td>
                                            <td className="py-3 px-2 text-center align-top font-black text-slate-900">{billingQty}</td>
                                            <td className="py-3 px-2 text-right text-slate-600 font-mono align-top">RM {billingPrice.toFixed(2)}</td>
                                            <td className="py-3 pl-2 text-right font-black text-slate-900 font-mono align-top">RM {billingSubtotal.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="pt-2">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Items Breakdown</h3>
                                <table className="w-full text-sm print:text-[10px] border-collapse">
                                    <tbody className="divide-y divide-slate-100">
                                        {cart.map((item, idx) => (
                                            <tr key={idx} className="group">
                                                <td className="py-1.5 pr-2">
                                                    <span className="font-bold text-slate-800">{item.name}</span>
                                                    {item.code && <span className="text-[9px] text-slate-400 font-mono ml-2">[{item.code}]</span>}
                                                    {item.note && <p className="text-[9px] text-slate-400 italic mt-0.5">Note: {item.note}</p>}
                                                </td>
                                                <td className="py-1.5 px-2 text-center text-slate-600 font-bold">x{item.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {Object.keys(activeEquipments).length > 0 && (
                                <div className="pt-2">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Equipments / Materials</h3>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {Object.entries(activeEquipments).map(([name, qty]) => (
                                            <span key={name} className="text-sm print:text-[10px] font-bold text-slate-700 flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                                                {name}
                                                <span className="text-slate-500 font-normal ml-1">× {qty}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-6 border-t border-slate-200 mt-6 page-break-avoid">
                                <div className="flex-1 space-y-3 w-full sm:w-auto">
                                    <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm print:text-xs">
                                        <span className="text-slate-500 font-medium">Payment:</span>
                                        <span className="font-bold text-slate-900 uppercase">Cash</span>
                                    </div>

                                    {remarks && (
                                        <div className="mt-4 p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50/50">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-1">Remarks</span>
                                            <p className="text-sm print:text-xs font-medium text-slate-800">{remarks}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="w-full sm:w-64 shrink-0">
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                            <span>Subtotal</span>
                                            <span className="font-mono">RM {billingSubtotal.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                            <span>Deposit</span>
                                            <span className="font-mono">RM {deposit.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm print:text-xs text-slate-600">
                                            <span>Tax (0%)</span>
                                            <span className="font-mono">RM 0.00</span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                                            <span className="text-sm print:text-xs font-black text-slate-900 uppercase tracking-wider">Balance Due</span>
                                            <span className="text-xl print:text-lg font-black text-red-600 font-mono">RM {balanceDue.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center mt-6 text-[10px] text-slate-400 space-y-1">
                                <p>Thank you for choosing Kim Long.</p>
                                <p>This is a computer-generated document. No signature is required.</p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4 no-print-area p-8 border-t border-slate-50 bg-slate-50/50">
                            <button
                                onClick={() => {
                                    const message = `*KIM LONG SMART CATERING - 订单确认*\n` +
                                        `--------------------------------\n` +
                                        `*订单编号:* ${generatedOrderId}\n` +
                                        `*客户姓名:* ${customerName}\n` +
                                        `*配送日期:* ${eventDate} ${eventTime}\n\n` +
                                        `*订单明细:*\n` +
                                        cart.map(item => `• ${item.name} x ${item.quantity} (RM ${item.price.toFixed(2)})`).join('\n') +
                                        `\n\n` +
                                        `*应付总额:* RM ${billingSubtotal.toFixed(2)}\n` +
                                        `*已付定金:* RM ${deposit.toFixed(2)}\n` +
                                        `*待收余额:* *RM ${balanceDue.toFixed(2)}*\n` +
                                        `--------------------------------\n` +
                                        `感谢您的支持！如有疑问请联系我们。`;
                                    
                                    const encodedMessage = encodeURIComponent(message);
                                    const phoneNumber = customerPhone.replace(/\D/g, '');
                                    const formattedPhone = phoneNumber.startsWith('6') ? phoneNumber : `6${phoneNumber}`;
                                    window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank');
                                }}
                                className="flex-1 bg-[#25D366] text-white py-4 rounded-[20px] font-black text-sm uppercase tracking-widest shadow-xl shadow-green-200 hover:shadow-green-300 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .004 5.412.001 12.049a11.82 11.82 0 001.592 5.96L0 24l6.12-1.605a11.777 11.777 0 005.927 1.588h.005c6.637 0 12.05-5.414 12.053-12.05a11.83 11.83 0 00-3.526-8.511z"/>
                                </svg>
                                WhatsApp 发送账单
                            </button>
                            <button 
                                onClick={() => navigate('/admin')} 
                                className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-[20px] font-black text-sm uppercase tracking-widest hover:bg-slate-50 transition-colors"
                            >
                                返回仪表板
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#FDFDFD] relative overflow-hidden">
            <header className="sticky top-0 z-[100] bg-white/70 backdrop-blur-xl border-b border-slate-100/50 px-6 py-3 lg:py-4">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between relative">
                    {/* 左侧：日期 */}
                    <div className="flex-1 hidden md:flex justify-start">
                        <div className="flex items-center px-4 py-2 bg-slate-50 rounded-full border border-slate-100 gap-3">
                            <span className="material-icons-round text-slate-400 text-sm">event</span>
                            <span className="text-xs font-bold text-slate-600">{new Date().toLocaleDateString()}</span>
                        </div>
                    </div>

                    {/* 中间：标题 (绝对居中方案) */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center text-center">
                        <h1 className="text-xl font-bold text-slate-900 leading-tight">创建新订单</h1>
                        <p className="text-[9px] font-black text-primary/40 uppercase tracking-[0.2em] leading-none mt-1">Create New Order</p>
                    </div>

                    {/* 右侧：占位或功能按钮 */}
                    <div className="flex-1 flex justify-end">
                        <div className="w-10 h-10"></div> {/* 维持布局平衡的占位符 */}
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 lg:px-8 pt-2 pb-6 lg:pt-4 lg:pb-10">
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12">
                    {/* 左侧：选购区域 (Dishes & Materials) */}
                    <div className="lg:col-span-7 xl:col-span-8 space-y-12">
                        {/* 客户资料 - Ultra Compact Grid Version */}
                        <section className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
                            {/* Card Header with Order ID */}
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-50">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                                    <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">客户资料 Customer Info</h2>
                                </div>
                                <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg flex items-center gap-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Order ID:</span>
                                    <span className="text-[10px] font-black text-primary font-mono tracking-wider">{generatedOrderId}</span>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-5">
                                {/* 第一行：基础资料 (更紧凑的 3列布局) */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                    <div className="md:col-span-4 relative">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">客户姓名 *</label>
                                        <div className="relative">
                                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs">person</span>
                                            <input className="w-full pl-8 pr-3 py-2 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-[11px] font-bold outline-none" placeholder="Name" value={customerName} onChange={e => setCustomerName(e.target.value)} onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)} />
                                            {showSuggestions && (
                                                <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-40 overflow-y-auto py-1">
                                                    {customerSuggestions.map(c => (
                                                        <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between group">
                                                            <div><p className="text-[10px] font-black text-slate-800">{c.name}</p><p className="text-[8px] text-slate-400 font-bold">{c.phone}</p></div>
                                                            <span className="material-icons-round text-primary/30 text-sm">history</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">联系电话 *</label>
                                        <div className="relative">
                                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs">phone</span>
                                            <input className="w-full pl-8 pr-3 py-2 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-[11px] font-bold outline-none font-mono" placeholder="Phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="md:col-span-5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">活动日期 & 时间</label>
                                        <div className="flex items-center bg-slate-50/50 border border-slate-100 rounded-xl px-3 py-2 focus-within:border-primary/30 transition-all group">
                                            <div className="flex items-center flex-1 min-w-0">
                                                <span className="material-icons-round text-slate-300 text-xs mr-2">calendar_today</span>
                                                <input 
                                                    type="date" 
                                                    className="bg-transparent text-[11px] font-bold outline-none w-full" 
                                                    value={eventDate} 
                                                    onChange={e => setEventDate(e.target.value)} 
                                                />
                                            </div>
                                            <div className="w-[1px] h-4 bg-slate-200 mx-2"></div>
                                            <div className="flex items-center flex-1 min-w-0">
                                                <input 
                                                    type="time" 
                                                    className="bg-transparent text-[11px] font-bold outline-none w-full text-right pr-1" 
                                                    value={eventTime} 
                                                    onChange={e => setEventTime(e.target.value)} 
                                                />
                                                <span className="material-icons-round text-slate-300 text-xs ml-1">schedule</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 第二行：地址与备注 (复合布局) */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                    <div className="md:col-span-5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">活动地址 *</label>
                                        <div className="relative">
                                            <span className="material-icons-round absolute left-3 top-3 text-slate-300 text-xs">place</span>
                                            <textarea className="w-full pl-8 pr-3 py-2 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-[11px] font-bold outline-none h-[38px] resize-none" placeholder="Detailed Address..." value={address} onChange={e => setAddress(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">地图链接 (Optional)</label>
                                        <div className="relative">
                                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs">map</span>
                                            <input className="w-full pl-8 pr-3 py-2.5 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-[11px] font-bold outline-none" placeholder="Google Maps Link" value={mapsLink} onChange={e => setMapsLink(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="md:col-span-4">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 block">整单备注 (Remarks)</label>
                                        <div className="relative">
                                            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs">notes</span>
                                            <input className="w-full pl-8 pr-3 py-2.5 bg-slate-50/50 border border-slate-100 focus:border-primary/30 rounded-xl text-[11px] font-bold outline-none" placeholder="Special requirements..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                {/* 第三行：账单详情与财务 (核心网格) */}
                                <div className="bg-slate-50/50 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-6 gap-4">
                                    <div className="md:col-span-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">计费单位</label>
                                        <select className="w-full px-2 py-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" value={billingUnit} onChange={e => setBillingUnit(e.target.value)}>
                                            <option value="PAX">PAX</option><option value="SET">SET</option><option value="TRIP">TRIP</option><option value="ITEM">ITEM</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">数量</label>
                                        <input type="number" className="w-full px-2 py-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" value={billingQty || ''} onChange={e => setBillingQty(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">单价 (RM)</label>
                                        <input type="number" step="0.01" className="w-full px-2 py-2 bg-white border border-slate-100 rounded-lg text-[11px] font-black outline-none" value={billingPrice || ''} onChange={e => setBillingPrice(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1 text-primary">总额 (Sub)</label>
                                        <div className="px-2 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] font-black text-primary">RM {billingSubtotal.toFixed(2)}</div>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1 text-emerald-600">定金 (Dep)</label>
                                        <input type="number" step="0.01" className="w-full px-2 py-2 bg-emerald-50/50 border border-emerald-100 rounded-lg text-[11px] font-black text-emerald-700 outline-none" value={deposit || ''} onChange={e => setDeposit(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1 text-red-500">待收 (Due)</label>
                                        <div className={`px-2 py-2 border rounded-lg text-[11px] font-black ${balanceDue > 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>RM {balanceDue.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </section>

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

                                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
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
                                        <div key={p.id} className="group bg-white rounded-2xl overflow-hidden border border-slate-100/60 shadow-sm hover:shadow-md transition-all duration-300 active:scale-95 relative flex flex-col">
                                            {p.img && (
                                                <div className="aspect-square overflow-hidden relative">
                                                    <div className="absolute top-2 left-2 z-10">
                                                        <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-md text-[7px] text-white rounded-md font-black uppercase tracking-widest border border-white/10">{p.code}</span>
                                                    </div>
                                                    <img src={p.img} className="w-full h-full object-cover" alt={p.name} />
                                                </div>
                                            )}
                                            <div className="p-2.5 flex-1 flex flex-col gap-2">
                                                {!p.img && <span className="w-fit px-1.5 py-0.5 bg-slate-100 text-[7px] text-slate-400 rounded-md font-black uppercase tracking-widest mb-1">{p.code}</span>}
                                                <h3 className="text-[10px] font-black text-slate-800 leading-tight h-8 overflow-hidden line-clamp-2">{p.name}</h3>
                                                <div className="flex justify-between items-center mt-auto">
                                                    <div className="flex flex-col">
                                                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Price</span>
                                                        <span className="text-xs font-black text-primary">RM {p.price.toFixed(2)}</span>
                                                    </div>
                                                    <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 active:scale-90 transition-all flex items-center justify-center">
                                                        <span className="material-icons-round text-sm">add_shopping_cart</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* 包含设备及物品 */}
                        <section className="bg-white rounded-[40px] p-8 shadow-[0_8px_40px_rgb(0,0,0,0.03)] border border-slate-100">
                            <div className="flex items-center gap-3 mb-8">
                                <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-sm">
                                    <span className="material-icons-round text-lg">handyman</span>
                                </span>
                                <div>
                                    <h2 className="text-base font-black uppercase tracking-widest text-slate-800">包含设备及物品</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Equipment & Items</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
                                    {[...EQUIPMENTS_LIST, ...customEquipments].map(eq => {
                                        const isLocked = billingUnit === 'PAX' && billingQty > 0 && ['盘子 OTU Plate', '汤匙 OTU Spoon', '叉子 OTU Fork', '杯子 OTU Cup'].includes(eq);
                                        return (
                                            <div key={eq} className={`flex flex-col justify-between p-2.5 rounded-2xl border transition-all duration-300 ${equipmentQuantities[eq] > 0 ? 'bg-blue-50/40 border-blue-100/50 ring-2 ring-blue-100/20' : 'bg-slate-50/40 border-slate-50 hover:bg-white hover:border-slate-100'}`}>
                                                <span className="text-[9px] font-black text-slate-700 mb-2 line-clamp-2 leading-tight" title={eq}>{eq}</span>
                                                <div className="flex items-center justify-between gap-1">
                                                    <button
                                                        onClick={() => updateEquipmentQty(eq, -1)}
                                                        className="w-7 h-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all disabled:opacity-30 shadow-sm"
                                                        disabled={!equipmentQuantities[eq] || isLocked}
                                                    >
                                                        <span className="material-icons-round text-[14px]">remove</span>
                                                    </button>
                                                    <div className="flex flex-col items-center">
                                                        <span className={`text-xs font-black min-w-[12px] text-center ${isLocked ? 'text-blue-600' : 'text-slate-900'}`}>{equipmentQuantities[eq] || 0}</span>
                                                        {isLocked && <span className="text-[5px] font-bold text-blue-400 italic scale-90 whitespace-nowrap">PAX x 2</span>}
                                                    </div>
                                                    <button
                                                        onClick={() => updateEquipmentQty(eq, 1)}
                                                        className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-30 disabled:grayscale"
                                                        disabled={isLocked}
                                                    >
                                                        <span className="material-icons-round text-[14px]">add</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* Add Custom Button */}
                                    {isAddingCustom ? (
                                        <div className="flex flex-col justify-center p-2.5 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/20 space-y-2">
                                            <input 
                                                autoFocus
                                                type="text" 
                                                className="w-full bg-white border border-slate-100 rounded-lg px-2 py-1.5 text-[9px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="名称..."
                                                value={newCustomName}
                                                onChange={e => setNewCustomName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddCustomEquipment()}
                                            />
                                            <div className="flex gap-1.5">
                                                <button onClick={handleAddCustomEquipment} className="flex-1 py-1 bg-blue-500 text-white rounded-md text-[8px] font-black uppercase">确定</button>
                                                <button onClick={() => setIsAddingCustom(false)} className="px-2 py-1 bg-slate-100 text-slate-500 rounded-md text-[8px] font-black uppercase">取消</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => setIsAddingCustom(true)}
                                            className="flex flex-col items-center justify-center p-2.5 rounded-2xl border-2 border-dashed border-slate-100 text-slate-300 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50/30 transition-all group min-h-[80px]"
                                        >
                                            <span className="material-icons-round text-xl mb-1 group-hover:scale-110 transition-transform">add_circle_outline</span>
                                            <span className="text-[9px] font-black uppercase tracking-tighter">添加自定义</span>
                                        </button>
                                    )}
                                </div>
                        </section>
                    </div>

                    {/* 右侧：配置区域 (Customer & Receipt) - Sticky */}
                    <div className="lg:col-span-5 xl:col-span-4">
                        <div className="lg:sticky lg:top-32 space-y-8">

                            {/* 订单明细 - Receipt Style (Collapsible) */}
                            <section className="bg-white rounded-[40px] shadow-[0_30px_60px_rgb(0,0,0,0.08)] border border-slate-100 flex flex-col relative overflow-hidden transition-all duration-500">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 to-primary"></div>
                                
                                {/* Header - Clickable Toggle */}
                                <div 
                                    onClick={() => setIsReceiptExpanded(!isReceiptExpanded)}
                                    className="p-7 border-b border-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-sm font-black text-slate-900 border-l-4 border-primary pl-4">订单明细</h3>
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mt-1">Receipt Preview</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight">{cart.length} 项</span>
                                        <span className={`material-icons-round text-slate-300 transition-transform duration-300 ${isReceiptExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                    </div>
                                </div>
                                
                                {/* Collapsible Content */}
                                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isReceiptExpanded ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="overflow-y-auto no-scrollbar px-6 py-6 space-y-5 border-b border-slate-50">
                                        {cart.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-slate-200">
                                                <span className="material-icons-round text-5xl mb-3 opacity-20">shopping_bag</span>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">购物车为空</p>
                                            </div>
                                        ) : cart.map(item => (
                                            <div key={item.id} className="group flex flex-col gap-3 pb-5 border-b border-slate-50 last:border-0 last:pb-0">
                                                <div className="flex gap-4">
                                                    {item.img && <img src={item.img} className="w-11 h-11 rounded-[14px] object-cover shadow-sm shrink-0 ring-1 ring-slate-100" alt={item.name} />}
                                                    <div className="flex-1 flex flex-col justify-between min-w-0">
                                                        <div className="flex justify-between items-start gap-3">
                                                            <h4 className="text-[11px] font-black text-slate-800 line-clamp-1 leading-none pt-1">{item.name}</h4>
                                                            <div className="flex items-center gap-2.5 scale-90 origin-right">
                                                                <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }} className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-white active:scale-95 transition-all shadow-sm"><span className="material-icons-round text-[12px]">remove</span></button>
                                                                <input type="number" className="w-7 bg-transparent border-none text-[11px] font-black text-center outline-none p-0" value={item.quantity} onChange={(e) => setManualQuantity(item.id, e.target.value)} />
                                                                <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }} className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center active:scale-95 transition-all shadow-md"><span className="material-icons-round text-[12px]">add</span></button>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-between gap-4 mt-2">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[10px] font-black text-primary">RM</span>
                                                                    <input type="number" step="0.01" className="w-14 bg-white border-b border-slate-100 text-[11px] font-black text-primary outline-none focus:border-primary" value={item.price || ''} onChange={(e) => updatePrice(item.id, e.target.value)} />
                                                                </div>
                                                            </div>
                                                            <input type="text" placeholder="项备注..." className="flex-1 h-6 bg-slate-50 px-2 rounded-lg text-[9px] font-bold text-slate-500 outline-none border border-transparent focus:border-primary/20 transition-all placeholder:text-slate-200" value={item.note || ''} onChange={(e) => updateItemNote(item.id, e.target.value)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                {/* Footer (Always Visible) - Unified Action Button */}
                                <div className="p-6 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100">
                                    <button
                                        onClick={handleFinalConfirm}
                                        disabled={cart.length === 0 || isSubmitting}
                                        className={`w-full py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.1em] shadow-2xl transition-all active:scale-[0.97] flex items-center justify-center gap-3 ${cart.length > 0 && !isSubmitting ? 'bg-primary text-white shadow-primary/30 hover:shadow-primary/40' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                    >
                                        {isSubmitting ? '处理中...' : (
                                            <>
                                                确认下单 — RM {billingSubtotal.toFixed(2)}
                                                <span className="material-icons-round text-lg">rocket_launch</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </main>

        </div>
    );
};

export default OrderCreate;
