import React, { useState } from 'react';
import { useFinanceSummary } from '../hooks/useFinanceSummary';
import { UserRole } from '../../types';

interface FinanceWidgetProps {
    user: UserRole | null;
}

/**
 * 极简财务看板卡片组件
 * - 显示今日总收入 (Today Revenue) - 可点击展开订单明细
 * - 显示今日订单数 (Order Count) & 待收余款 (Pending)
 * - 显示本月累计 (Monthly Total)
 * - 仅 admin 和 super_admin 角色可见
 * - 通过 Supabase Realtime 实时更新
 */
const FinanceWidget: React.FC<FinanceWidgetProps> = ({ user }) => {
    const { daily, monthly, showFinance, loading, dailyOrderCount, pendingAmount, todayOrders } = useFinanceSummary();
    const [isExpanded, setIsExpanded] = useState(false);

    // 权限检查
    const isAllowed = user === UserRole.ADMIN || user === UserRole.SUPER_ADMIN;
    if (!isAllowed || !showFinance) return null;

    return (
        <div className="flex flex-col gap-6 p-1">
            {/* 1. 顶部核心卡片：今日总收入 (Premium Gradient & Glassmorphism) */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="group relative cursor-pointer overflow-hidden rounded-[2.5rem] p-7 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/30 active:scale-[0.98] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 border border-white/20 shadow-xl"
            >
                {/* 装饰性背景 */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-white/20 transition-all duration-700" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-400/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />

                <div className="relative flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                            <span className="material-icons-round text-white text-2xl">account_balance_wallet</span>
                        </div>
                        <div>
                            <p className="text-[10px] text-indigo-100/70 font-black uppercase tracking-[0.2em]">Today Revenue</p>
                            <h2 className="text-white font-black tracking-tight text-xl">今日总收入</h2>
                        </div>
                    </div>
                    <div className={`w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 transition-transform duration-500 ${isExpanded ? 'rotate-180 bg-white/30' : ''}`}>
                        <span className="material-icons-round text-white">expand_more</span>
                    </div>
                </div>

                <div className="relative mb-2">
                    {loading ? (
                        <div className="h-16 w-48 bg-white/10 animate-pulse rounded-2xl" />
                    ) : (
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold text-indigo-100/50">RM</span>
                            <span className="text-6xl font-black text-white tracking-tighter drop-shadow-lg tabular-nums">
                                {Number(daily).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>

                {/* 2. 展开后的订单明细 (Today's Ledger) */}
                <div className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'max-h-[800px] opacity-100 mt-8' : 'max-h-0 opacity-0'}`}>
                    <div className="h-px bg-white/10 w-full mb-6" />
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-indigo-200 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-indigo-400"></span>
                            Today's Ledger 明细
                        </h4>

                        <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 no-scrollbar">
                            {todayOrders.length === 0 ? (
                                <p className="text-sm text-indigo-200/60 py-4 text-center italic">今日暂无订单数据</p>
                            ) : (
                                todayOrders.map((order, idx) => (
                                    <div key={idx} className="group flex justify-between items-center p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/15 transition-all duration-300">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-bold text-white tracking-wide">{order.customerName}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-indigo-200/50 tabular-nums">ID: {String(order.id).slice(-6)}</span>
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter ${order.paymentStatus === 'paid' ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/20' : 'bg-amber-400/20 text-amber-300 border border-amber-400/20'}`}>
                                                    {order.paymentStatus}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-sm font-black text-white tabular-nums">
                                            RM {Number(order.amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. 次级指标：今日订单数 & 待收余款 */}
            <div className={`grid grid-cols-2 gap-4 transition-all duration-500 ${isExpanded ? 'opacity-40 grayscale pointer-events-none scale-95' : 'opacity-100'}`}>
                {/* 订单数卡片 */}
                <div className="bg-indigo-50/40 backdrop-blur-md border border-indigo-100/60 p-6 rounded-[2rem] shadow-lg shadow-indigo-100/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-500 flex flex-col justify-center items-center relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/30" />
                    <p className="text-[10px] text-indigo-700/70 font-black uppercase tracking-widest mb-2">Order Count</p>
                    {loading ? (
                        <span className="h-8 w-16 bg-indigo-100 rounded-lg animate-pulse" />
                    ) : (
                        <p className="text-4xl font-black text-indigo-600 tracking-tight group-hover:scale-110 transition-transform">{dailyOrderCount}</p>
                    )}
                </div>

                {/* 待收余款卡片 */}
                <div className="bg-amber-50/40 backdrop-blur-md border border-amber-100/60 p-6 rounded-[2rem] shadow-lg shadow-amber-100/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-500 flex flex-col justify-center items-center relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/30" />
                    <p className="text-[10px] text-amber-700/70 font-black uppercase tracking-widest mb-2">Pending</p>
                    {loading ? (
                        <span className="h-8 w-24 bg-amber-100 rounded-lg animate-pulse" />
                    ) : (
                        <div className="flex items-baseline gap-1">
                            <span className="text-xs font-bold text-amber-600/50">RM</span>
                            <span className="text-2xl font-black text-amber-600 tabular-nums">
                                {Number(pendingAmount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. 月度汇总卡片 (Glassmorphism Dark) */}
            <div className={`relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-8 shadow-2xl transition-all duration-500 ${isExpanded ? 'opacity-40 grayscale pointer-events-none scale-95' : 'opacity-100'}`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
                <div className="relative flex justify-between items-center h-full">
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mb-3">Monthly Total</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-indigo-400/80 font-bold text-lg">RM</span>
                            <span className="text-4xl font-black text-white tracking-tighter tabular-nums">
                                {Number(monthly).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400">
                        <span className="material-icons-round text-3xl">analytics</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinanceWidget;
