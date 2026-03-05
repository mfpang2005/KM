import React from 'react';
import { useFinanceSummary } from '../hooks/useFinanceSummary';

export const FinanceWidget: React.FC = () => {
    const { summary, loading, error } = useFinanceSummary();

    if (loading && !summary) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-40 bg-white rounded-[32px] border border-slate-100 shadow-sm"></div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-100 p-6 rounded-3xl mb-8 flex items-center gap-4 text-red-600">
                <span className="material-icons-round">error_outline</span>
                <p className="text-sm font-medium">Finance data currently unavailable: {error}</p>
            </div>
        );
    }

    if (!summary || !summary.showFinance) return null;

    const { daily, monthly, monthlyGoal } = summary;
    const progress = monthlyGoal > 0 ? Math.min((monthly / monthlyGoal) * 100, 100) : 0;
    const isGoalReached = monthly >= monthlyGoal && monthlyGoal > 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
            {/* Daily Revenue Card */}
            <div className="md:col-span-4 bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(37,99,235,0.04)] border border-blue-50 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none text-blue-600 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-icons-round text-[120px] leading-none">account_balance_wallet</span>
                </div>
                <div className="relative z-10">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-2">Today's Revenue</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-lg font-black text-blue-400/80">RM</span>
                        <h2 className="text-4xl font-black text-slate-800 tracking-tighter">
                            {daily.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-blue-600 bg-blue-50/50 w-fit px-3 py-1 rounded-full border border-blue-100/50">
                        <span className="material-icons-round text-sm">trending_up</span>
                        <span>Live Syncing</span>
                    </div>
                </div>
            </div>

            {/* Monthly Progress Card */}
            <div className="md:col-span-8 bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(37,99,235,0.04)] border border-blue-50 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none text-indigo-600 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-icons-round text-[120px] leading-none">insights</span>
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1">
                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-2">Monthly Performance</p>
                        <div className="flex items-baseline gap-1 mb-6">
                            <span className="text-lg font-black text-indigo-400/80">RM</span>
                            <h2 className="text-4xl font-black text-slate-800 tracking-tighter">
                                {monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </h2>
                            {monthlyGoal > 0 && (
                                <span className="text-slate-400 font-bold ml-2">/ RM {monthlyGoal.toLocaleString()}</span>
                            )}
                        </div>

                        {/* Progress Bar */}
                        <div className="relative w-full">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Revenue Goal</span>
                                <span className="text-xs font-black text-indigo-600">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-4 bg-slate-50 border border-slate-100 rounded-full overflow-hidden shadow-inner p-1">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden ${isGoalReached ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                                        }`}
                                    style={{ width: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`shrink-0 w-24 h-24 rounded-3xl flex flex-col items-center justify-center gap-1 border-2 transition-all duration-500 ${isGoalReached
                            ? 'bg-green-50 border-green-200 text-green-600 scale-110 shadow-lg shadow-green-200/50'
                            : 'bg-indigo-50 border-indigo-100 text-indigo-400'
                        }`}>
                        <span className="material-icons-round text-3xl">
                            {isGoalReached ? 'auto_awesome' : 'flag'}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-tighter text-center px-2">
                            {isGoalReached ? 'GOAL MET' : 'TARGET'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
