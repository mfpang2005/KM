import React from 'react';
import type { Order } from '../types';

interface FinanceTableRowProps {
    order: Order;
    onUpdateField: (orderId: string, field: string, value: any) => void;
    getPaymentIcon: (method: string) => string;
}

export const FinanceTableRow: React.FC<FinanceTableRowProps> = React.memo(({ 
    order, 
    onUpdateField, 
    getPaymentIcon 
}) => {
    const balance = (order.amount || 0) - (order.payment_received || 0);
    const isPaid = (order.paymentStatus || 'unpaid').toLowerCase() === 'paid';

    return (
        <tr className={`hover:bg-indigo-50/30 transition-all duration-300 group relative ${!isPaid && balance > 0 ? 'bg-red-50/5' : ''}`}>
            <td className="px-4 py-3 align-middle font-mono-finance text-[11px] text-indigo-600 font-bold tracking-tight relative">
                <button 
                    onClick={() => {
                        // Use window.location.href or inject navigate via props if we want to be pure,
                        // but since navigate is common in pages using this component, let's see if we can use a link or window.location.
                        // Actually, I'll use a direct link or look at how other components handle navigation.
                        // In this project, FinancePage uses useNavigate. Let's add navigate to FinanceTableRow props.
                        window.location.href = `/orders?highlightOrder=${order.id}`;
                    }}
                    title="View in Order Status"
                    className="text-indigo-600 font-bold font-mono-finance hover:underline decoration-2 underline-offset-4 flex items-center gap-1 group/btn"
                >
                    {order.order_number || order.id}
                    <span className="material-icons-round text-[14px] opacity-0 group-hover/btn:opacity-100 transition-opacity">open_in_new</span>
                </button>
            </td>
            <td className="px-3 py-3 align-middle font-mono-finance text-[10px] text-slate-400">
                {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : '-'}
            </td>
            <td className="px-3 py-3 align-middle font-mono-finance text-[10px] text-slate-600 font-bold">
                {order.dueTime ? new Date(order.dueTime).toLocaleDateString('en-GB') : (order.eventDate || '-')}
            </td>
            <td className="px-6 py-3 align-middle">
                <p className="text-xs font-bold text-slate-800 tracking-tight">{order.customerName || 'Walk-in'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{order.customerPhone || '-'}</p>
            </td>
            <td className="px-4 py-3 align-middle">
                <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="material-icons-round text-xs">{getPaymentIcon(order.paymentMethod || 'cash')}</span>
                    <select
                        value={order.paymentMethod || 'cash'}
                        onChange={(e) => onUpdateField(order.id, 'paymentMethod', e.target.value)}
                        className="bg-transparent border-none p-0 text-[10px] font-bold uppercase tracking-tighter focus:ring-0 cursor-pointer text-slate-600 hover:text-indigo-600 transition-colors outline-none appearance-none"
                    >
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="ewallet">E-Wallet</option>
                        <option value="cheque">Cheque</option>
                    </select>
                </div>
            </td>
            <td className="px-4 py-3 align-middle text-right font-mono-finance text-[11px] font-bold text-slate-800">
                RM {(order.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 align-middle">
                <div className="flex items-center justify-center">
                    <div className="relative group">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">RM</span>
                        <input
                            key={`${order.id}-${order.payment_received}`}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className="w-28 pl-7 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-mono-finance font-black focus:ring-2 focus:ring-indigo-500/20 focus:bg-white focus:border-indigo-500 transition-all outline-none"
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
            <td className={`px-4 py-3 align-middle text-right font-mono-finance text-[11px] font-black ${balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                RM {balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 align-middle">
                <select
                    value={order.paymentStatus || 'unpaid'}
                    onChange={(e) => onUpdateField(order.id, 'paymentStatus', e.target.value)}
                    className={`text-[9px] font-black px-3 py-1.5 rounded-full border transition-all uppercase tracking-widest block text-center w-full appearance-none cursor-pointer outline-none shadow-sm
                        ${isPaid
                            ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/20' 
                            : 'bg-red-500 text-white border-red-400 shadow-red-500/20'}`}
                >
                    <option value="paid" className="bg-white text-slate-900">PAID</option>
                    <option value="unpaid" className="bg-white text-slate-900">UNPAID</option>
                </select>
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
    );
}, (prevProps, nextProps) => {
    // Only re-render if the order data has actually changed
    return prevProps.order === nextProps.order;
});
