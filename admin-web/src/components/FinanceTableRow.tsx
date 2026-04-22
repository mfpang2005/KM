import React from 'react';
import type { Order } from '../types';

interface FinanceTableRowProps {
    order: Order;
    onUpdateField: (orderId: string, field: string, value: any) => void;
    getPaymentIcon: (method: string) => string;
    onViewPhoto: (url: string) => void;
    expandedOrderId: string | null;
    setExpandedOrderId: (id: string | null) => void;
}

export const FinanceTableRow: React.FC<FinanceTableRowProps> = React.memo(({ 
    order, 
    onUpdateField, 
    getPaymentIcon,
    onViewPhoto,
    expandedOrderId,
    setExpandedOrderId
}) => {
    const balance = (order.amount || 0) - (order.payment_received || 0);
    const isPaid = (order.paymentStatus || 'unpaid').toLowerCase() === 'paid';

    return (
        <>
            <tr className={`hover:bg-indigo-50/30 transition-all duration-300 group relative ${!isPaid && balance > 0 ? 'bg-red-50/5' : ''}`}>
            <td className="px-5 py-4 align-middle font-mono-finance text-[12px] text-indigo-600 font-bold tracking-tight relative">
                <button 
                    onClick={() => {
                        window.location.href = `/orders?highlightOrder=${order.id}`;
                    }}
                    title="View in Order Status"
                    className="text-indigo-600 font-bold font-mono-finance hover:underline decoration-2 underline-offset-4 flex items-center gap-1.5 group/btn whitespace-nowrap"
                >
                    {order.order_number || order.id}
                    <span className="material-icons-round text-[16px] opacity-0 group-hover/btn:opacity-100 transition-opacity">open_in_new</span>
                </button>
            </td>
            <td className="px-5 py-4 align-middle font-mono-finance text-[11px] text-slate-600 font-bold bg-slate-50/20 whitespace-nowrap">
                {order.dueTime ? new Date(order.dueTime).toLocaleDateString('en-GB') : (order.eventDate || '-')}
            </td>
            <td className="px-8 py-4 align-middle text-center">
                <p className="text-[13px] font-bold text-slate-800 tracking-tight">{order.customerName || 'Walk-in'}</p>
                <p className="text-[11px] text-slate-400 mt-1">{order.customerPhone || '-'}</p>
            </td>
            <td className="px-5 py-4 align-middle">
                <div className="flex items-center justify-center">
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all shadow-sm
                        ${order.paymentMethod === 'cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                          order.paymentMethod === 'bank_transfer' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                          order.paymentMethod === 'ewallet' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                          'bg-slate-50 text-slate-600 border-slate-200'}`}
                    >
                        <span className="material-icons-round text-[14px] shrink-0 opacity-70">{getPaymentIcon(order.paymentMethod || 'cash')}</span>
                        <select
                            value={order.paymentMethod || 'cash'}
                            onChange={(e) => onUpdateField(order.id, 'paymentMethod', e.target.value)}
                            className="bg-transparent border-none p-0 pr-4 text-[10px] font-bold uppercase tracking-wider cursor-pointer focus:ring-0 outline-none appearance-none bg-no-repeat bg-right"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundPosition: 'right -2px center' }}
                        >
                            <option value="cash" className="bg-white text-slate-900">Cash</option>
                            <option value="bank_transfer" className="bg-white text-slate-900">Bank Transfer</option>
                            <option value="ewallet" className="bg-white text-slate-900">E-Wallet</option>
                            <option value="cheque" className="bg-white text-slate-900">Cheque</option>
                        </select>
                    </div>
                </div>
            </td>
            <td className="px-5 py-4 align-middle font-mono-finance text-[12px] font-bold text-slate-800 whitespace-nowrap">
                <span className="text-[10px] text-slate-400 mr-1.5">RM</span>
                {(order.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
            <td className="px-5 py-4 align-middle">
                <div className="flex items-center justify-center">
                    <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">RM</span>
                        <input
                            key={`${order.id}-${order.payment_received}`}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className="w-24 pl-8 pr-2 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[12px] font-mono-finance font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-500 transition-all outline-none shadow-inner text-right"
                            defaultValue={order.payment_received || 0}
                            onBlur={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                if (val !== (order.payment_received || 0)) {
                                    onUpdateField(order.id, 'payment_received', val);
                                }
                            }}
                        />
                    </div>
                </div>
            </td>
            <td className={`px-5 py-4 align-middle font-mono-finance text-[12px] font-bold whitespace-nowrap ${balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                <span className={`text-[10px] mr-1.5 ${balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>RM</span>
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
            <td className="px-5 py-4 align-middle min-w-[120px]">
                <select
                    value={order.paymentStatus || 'unpaid'}
                    onChange={(e) => onUpdateField(order.id, 'paymentStatus', e.target.value)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all uppercase tracking-wider block text-center w-full appearance-none cursor-pointer outline-none shadow-sm bg-no-repeat bg-right
                        ${isPaid
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' 
                            : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 4px center' }}
                >
                    <option value="paid" className="bg-white text-slate-900">PAID</option>
                    <option value="unpaid" className="bg-white text-slate-900">UNPAID</option>
                </select>
            </td>
            <td className="px-5 py-4 align-middle">
                {order.delivery_photos && order.delivery_photos.length > 0 ? (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExpandedOrderId(expandedOrderId === order.id ? null : order.id);
                        }}
                        className={`flex items-center justify-center gap-2 text-[10px] font-bold px-3 py-2 rounded-xl transition-all uppercase tracking-wider ${expandedOrderId === order.id
                            ? 'bg-indigo-600 text-white shadow-lg'
                            : 'bg-slate-100 text-slate-500 hover:bg-white hover:text-indigo-600 hover:shadow-md'
                            }`}
                    >
                        <span className="material-icons-round text-[16px]">photo_library</span>
                        <span>{order.delivery_photos.length}</span>
                    </button>
                ) : (
                    <span className="text-[11px] font-bold text-slate-200 tracking-widest">—</span>
                )}
            </td>
            <td className="px-6 py-3 align-middle">
                <input
                    type="text"
                    defaultValue={order.remark || ''}
                    onBlur={(e) => onUpdateField(order.id, 'remark', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 transition-all outline-none text-[10px] text-slate-600 py-1"
                    placeholder="Add remark..."
                />
            </td>
        </tr>
        {expandedOrderId === order.id && order.delivery_photos && order.delivery_photos.length > 0 && (
            <tr className="animate-in slide-in-from-top-4 duration-500">
                <td colSpan={11} className="pb-8 bg-indigo-50/20 px-8">
                    <div className="pt-4 border-t border-indigo-100/50 flex flex-col items-start">
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-start gap-2 pl-2">
                            <span className="material-icons-round text-[14px]">verified_user</span>
                            Delivery Evidence — {order.delivery_photos.length} Verified Records
                        </p>
                        <div className="flex flex-wrap justify-start gap-4 pl-2">
                            {order.delivery_photos?.map((url: string, idx: number) => (
                                <button
                                    key={idx}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onViewPhoto(url);
                                    }}
                                    className="group relative w-32 h-32 rounded-3xl overflow-hidden shadow-xl hover:scale-105 transition-all duration-500 hover:shadow-indigo-500/20 bg-white p-1 ring-1 ring-slate-100"
                                >
                                    <div className="w-full h-full rounded-[20px] overflow-hidden">
                                        <img src={url} alt={`proof-${idx}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    </div>
                                    <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                                            <span className="material-icons-round text-indigo-600">zoom_in</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </td>
            </tr>
        )}
        </>
    );
}, (prevProps, nextProps) => {
    // Only re-render if the order data OR expanded state has actually changed
    return prevProps.order === nextProps.order && prevProps.expandedOrderId === nextProps.expandedOrderId;
});
