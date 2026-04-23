import React, { useState } from 'react';
import { useFinanceSummary } from '../hooks/useFinanceSummary';
import { UserRole } from '../../types';

interface FinanceWidgetProps {
    user: UserRole | null;
}

/**
 * 极简财务看板卡片组件
 * - 显示今日总收入 (Today Revenue) - 可点击展开订单明细
 * - 仅 admin 和 super_admin 角色可见
 * - 通过 Supabase Realtime 实时更新
 */
const FinanceWidget: React.FC<FinanceWidgetProps> = ({ user }) => {
    const { daily, showFinance, loading, todayOrders } = useFinanceSummary();
    const [isExpanded, setIsExpanded] = useState(false);

    // 权限检查
    const isAllowed = user === UserRole.ADMIN || user === UserRole.SUPER_ADMIN;
    if (!isAllowed || !showFinance) return null;

    return (
        <div className="flex flex-col gap-6 p-1">
            {/* 1. 顶部核心卡片：今日总收入 (Premium Gradient & Glassmorphism) */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="group relative cursor-pointer overflow-hidden rounded-[2.5rem] p-7 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/20 active:scale-[0.98] bg-gradient-to-br from-primary via-primary-warm to-primary shadow-xl"
            >
                {/* 装饰性背景 */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-white/20 transition-all duration-700" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary-light/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />

                <div className="relative flex justify-between items-start mb-6">
                    <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner mb-2">
                            <span className="material-icons-round text-white text-2xl">account_balance_wallet</span>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] text-white/60 font-black uppercase tracking-[0.2em]">Today Revenue</p>
                            <h2 className="text-white font-black tracking-tight text-xl italic uppercase">今日总收入</h2>
                        </div>
                    </div>
                    <div className={`w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 transition-transform duration-500 ${isExpanded ? 'rotate-180 bg-white/30' : ''}`}>
                        <span className="material-icons-round text-white">expand_more</span>
                    </div>
                </div>

                <div className="relative mb-2">
                    {loading ? (
                        <div className="h-16 w-48 bg-white/10 rounded-2xl relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                        </div>
                    ) : (
                        <div className="flex items-baseline justify-center gap-2">
                            <span className="text-xl font-bold text-white/40">RM</span>
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
                        <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-white/40"></span>
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
        </div>
    );
};

export default FinanceWidget;
