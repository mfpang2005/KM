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

    const { daily, monthly } = summary;

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
            {/* Daily Revenue & Monthly Overview */}
            <div className="md:col-span-6 bg-white py-6 px-8 rounded-[32px] shadow-[0_8px_30px_rgba(37,99,235,0.04)] border border-blue-50 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] select-none pointer-events-none text-blue-600 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-icons-round text-[90px] leading-none">account_balance_wallet</span>
                </div>
                <div className="relative z-10">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-2">Today's Revenue</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-black text-blue-400/80 font-sans">RM</span>
                        <h2 className="text-5xl font-black text-slate-800 tracking-tighter font-mono leading-none">
                            {daily.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                        {daily > 0 && <span className="trend-label px-2 py-0.5 rounded-lg bg-green-50 text-green-500 text-[10px] font-black flex items-center gap-0.5 shrink-0 ml-1">↑ 8.4%</span>}
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-[11px] font-bold text-blue-600 bg-blue-50/50 w-fit px-3 py-1 rounded-full border border-blue-100/50">
                        <span className="material-icons-round text-sm">trending_up</span>
                        <span>Live Syncing</span>
                    </div>
                </div>
            </div>

            <div className="md:col-span-6 bg-white py-6 px-8 rounded-[32px] shadow-[0_8px_30px_rgba(37,99,235,0.04)] border border-blue-50 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] select-none pointer-events-none text-indigo-600 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-icons-round text-[90px] leading-none">insights</span>
                </div>
                <div className="relative z-10">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-2">Month to Date</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-black text-indigo-400/80 font-sans">RM</span>
                        <h2 className="text-5xl font-black text-slate-800 tracking-tighter font-mono leading-none">
                            {monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h2>
                        {monthly > 0 && <span className="trend-label px-2 py-0.5 rounded-lg bg-green-50 text-green-500 text-[10px] font-black flex items-center gap-0.5 shrink-0 ml-1">↑ 12.1%</span>}
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-[11px] font-bold text-indigo-600 bg-indigo-50/50 w-fit px-3 py-1 rounded-full border border-indigo-100/50">
                        <span className="material-icons-round text-sm">calendar_month</span>
                        <span className="uppercase tracking-widest">Active Billing</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
