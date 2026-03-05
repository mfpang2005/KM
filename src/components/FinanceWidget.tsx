import React from 'react';
import { useFinanceSummary } from '../hooks/useFinanceSummary';
import { UserRole } from '../../types';

interface FinanceWidgetProps {
    user: UserRole | null;
}

/**
 * 极简财务看板卡片组件
 * - 显示今日成交和本月总计（含进度条）
 * - 仅 admin 和 super_admin 角色可见
 * - 通过 Supabase Realtime 实时更新，无需手动刷新
 */
const FinanceWidget: React.FC<FinanceWidgetProps> = ({ user }) => {
    const { daily, monthly, monthlyGoal, showFinance, loading } = useFinanceSummary();

    // 权限检查
    const isAllowed = user === UserRole.ADMIN || user === UserRole.SUPER_ADMIN;
    if (!isAllowed || !showFinance) return null;

    const progressPercent = monthlyGoal > 0
        ? Math.min((monthly / monthlyGoal) * 100, 100)
        : 0;

    return (
        <div className="grid grid-cols-2 gap-4">
            {/* 今日成交卡 */}
            <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl shadow-sm flex flex-col justify-between h-24 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-primary/5 rounded-full" />
                <p className="text-[10px] text-primary font-bold uppercase tracking-tight z-10">今日成交</p>
                <div className="flex items-baseline gap-1 z-10">
                    {loading ? (
                        <span className="text-2xl font-bold text-slate-300 animate-pulse">---</span>
                    ) : (
                        <>
                            <span className="text-xs font-bold text-primary/60">RM</span>
                            <span className="text-3xl font-black text-primary leading-none">
                                {daily.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* 本月总计卡 */}
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex flex-col justify-between h-24 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-slate-100/50 rounded-full" />
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight z-10">本月总计</p>
                <div className="flex items-baseline gap-1 z-10">
                    {loading ? (
                        <span className="text-2xl font-bold text-slate-300 animate-pulse">---</span>
                    ) : (
                        <>
                            <span className="text-xs font-bold text-slate-400">RM</span>
                            <span className="text-3xl font-black text-slate-900 leading-none">
                                {monthly.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* 月度目标进度条（仅在设置了目标时显示） */}
            {monthlyGoal > 0 && !loading && (
                <div className="col-span-2 bg-white border border-slate-100 p-3 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">月度目标进度</span>
                        <span className="text-[10px] font-black text-primary">
                            {progressPercent.toFixed(0)}% — 目标 RM {monthlyGoal.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-1000 ease-out rounded-full"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceWidget;
