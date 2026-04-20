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

    const { daily, monthly, monthly_sales = [] } = summary;

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
            {/* Daily Revenue - BLUE THEME */}
            <div className="md:col-span-3 bg-gradient-to-br from-blue-50 to-white py-6 px-6 rounded-[32px] shadow-[0_8px_30px_rgba(37,99,235,0.06)] border border-blue-100/50 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300 h-[160px]">
                <div className="absolute top-0 right-0 p-4 opacity-[0.05] select-none pointer-events-none text-blue-600 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-icons-round text-[70px] leading-none">account_balance_wallet</span>
                </div>
                <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                        <p className="text-[10px] text-blue-600/60 font-black uppercase tracking-[0.2em] mb-1">Today's Revenue</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black text-blue-400 font-sans">RM</span>
                            <h2 className="text-5xl font-black text-blue-900 tracking-tighter font-mono leading-none">
                                {Math.floor(daily)}
                            </h2>
                        </div>
                    </div>
                    <div className="mt-auto flex items-center gap-1.5 text-[9px] font-black text-blue-600 bg-blue-100/50 w-fit px-2.5 py-1 rounded-full border border-blue-200/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        <span>LIVE SYNC</span>
                    </div>
                </div>
            </div>

            {/* Monthly Overview - INDIGO THEME */}
            <div className="md:col-span-3 bg-gradient-to-br from-indigo-50 to-white py-6 px-6 rounded-[32px] shadow-[0_8px_30px_rgba(79,70,229,0.06)] border border-indigo-100/50 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300 h-[160px]">
                <div className="absolute top-0 right-0 p-4 opacity-[0.05] select-none pointer-events-none text-indigo-600 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-icons-round text-[70px] leading-none">insights</span>
                </div>
                <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                        <p className="text-[10px] text-indigo-600/60 font-black uppercase tracking-[0.2em] mb-1">Month to Date</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black text-indigo-400 font-sans">RM</span>
                            <h2 className="text-5xl font-black text-indigo-900 tracking-tighter font-mono leading-none">
                                {monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </h2>
                        </div>
                    </div>
                    <div className="mt-auto flex items-center gap-1.5 text-[9px] font-black text-indigo-600 bg-indigo-100/50 w-fit px-2.5 py-1 rounded-full border border-indigo-200/50">
                        <span className="material-icons-round text-xs">calendar_month</span>
                        <span>MTD TOTAL</span>
                    </div>
                </div>
            </div>

            {/* AI SALES GRAPH - SLATE/ACCENT THEME */}
            <div className="md:col-span-6 bg-gradient-to-br from-slate-50 to-white p-6 rounded-[32px] shadow-[0_8px_30px_rgba(15,23,42,0.04)] border border-slate-200/60 relative overflow-hidden flex flex-col gap-4 h-[160px]">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            Annual Sales Track 
                            <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] rounded-md font-bold shadow-sm shadow-blue-500/20">AI OBSERVED</span>
                        </h3>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Avg Monthly</p>
                        <p className="text-sm font-black text-slate-800 line-clamp-1">
                            <span className="text-[10px] text-slate-400 mr-0.5">RM</span>
                            {(monthly_sales.reduce((a, b) => a + b, 0) / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    </div>
                </div>

                <div className="flex-1 w-full relative mt-0 overflow-hidden">
                    <SalesLineChart data={monthly_sales} />
                </div>

                <div className="flex items-center justify-between text-[7px] font-black text-slate-400 uppercase tracking-widest px-2 mt-auto">
                    <span>12M AGO</span>
                    <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100/50">
                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></span>
                        STABLE GROWTH
                    </div>
                    <span>CURRENT</span>
                </div>
            </div>
        </div>
    );
};

const SalesLineChart: React.FC<{ data: number[] }> = ({ data }) => {
    if (!data || data.length === 0) return null;
    
    // Ensure we have 12 points, pad if necessary
    const points = [...Array(12)].map((_, i) => data[i] || 0);
    const max = Math.max(...points, 1000) * 1.2;
    const width = 1000;
    const height = 100;
    
    const svgPoints = points.map((val, i) => {
        const x = (i / 11) * width;
        const y = height - (val / max) * height;
        return `${x},${y}`;
    }).join(' ');

    const areaPoints = `0,${height} ${svgPoints} ${width},${height}`;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Area */}
            <polygon points={areaPoints} fill="url(#chartGradient)" />
            {/* Smooth Line */}
            <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={svgPoints}
                className="drop-shadow-lg"
            />
            {/* Dots */}
            {points.map((val, i) => {
                const x = (i / 11) * width;
                const y = height - (val / max) * height;
                return (
                    <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="6"
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        className="transition-all duration-300 hover:r-8 cursor-pointer"
                    >
                        <title>Month {i+1}: RM {val}</title>
                    </circle>
                );
            })}
        </svg>
    );
};
