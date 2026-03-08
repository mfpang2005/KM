import React, { useState, useEffect } from 'react';
import { SuperAdminService } from '../services/api';

interface CollectionStats {
    method: string;
    amount: number;
    count: number;
}

interface FinanceData {
    todayRevenue: number;
    periodRevenue: number;
    todayOrderCount: number;
    monthlyGoal: number;
    collections: CollectionStats[];
    categorySales: { category: string; amount: number }[];
    hourlySales: any[];
}

export const FinancePage: React.FC = () => {
    const [range, setRange] = useState<'today' | 'month' | 'all'>('month');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FinanceData | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await SuperAdminService.getFinanceSummary(range);
            setData(result as any);
        } catch (error) {
            console.error('Failed to load finance data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [range]);

    if (loading && !data) {
        return (
            <div className="h-full flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Calculating Ledger...</p>
            </div>
        );
    }

    const goalProgress = data ? Math.min(100, (data.periodRevenue / (data.monthlyGoal || 1)) * 100) : 0;

    const getPaymentIcon = (method: string) => {
        switch (method.toLowerCase()) {
            case 'cash': return 'payments';
            case 'bank_transfer': return 'account_balance';
            case 'ewallet': return 'contactless';
            default: return 'receipt';
        }
    };

    const getPaymentLabel = (method: string) => {
        switch (method.toLowerCase()) {
            case 'cash': return 'Cash';
            case 'bank_transfer': return 'Bank Transfer';
            case 'ewallet': return 'E-Wallet';
            default: return method;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Range Selector Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-sm">
                <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Financial Overview</h3>
                    <p className="text-xs text-slate-500 font-medium">Real-time revenue and tax tracking</p>
                </div>
                <div className="flex bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
                    {(['today', 'month', 'all'] as const).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${range === r
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-white/40'
                                }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label={range === 'today' ? "Today Revenue" : "Period Revenue"}
                    value={data?.periodRevenue || 0}
                    icon="trending_up"
                    color="blue"
                    subtitle={`Total collected for ${range}`}
                />
                <StatCard
                    label="Today Revenue"
                    value={data?.todayRevenue || 0}
                    icon="monetization_on"
                    color="emerald"
                    subtitle="Real-time collection"
                />
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm group hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                            <span className="material-icons-round text-2xl">receipt_long</span>
                        </div>
                        <span className="material-icons-round text-slate-200 group-hover:text-slate-300 transition-colors">keyboard_arrow_right</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Today Orders</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-slate-800 tracking-tighter">{data?.todayOrderCount || 0}</span>
                        </div>
                        <p className="text-[10px] mt-1.5 text-slate-400 font-medium">Completed orders today</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <span className="material-icons-round text-xl">flag</span>
                        </div>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase tracking-wider">Goal</span>
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Progress</p>
                        <div className="flex items-baseline gap-1 mb-3">
                            <span className="text-2xl font-black text-slate-800 tracking-tighter">{goalProgress.toFixed(1)}%</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">of Target</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000 ease-out"
                                style={{ width: `${goalProgress}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Payment Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                        <h4 className="font-black text-slate-800 text-sm uppercase tracking-wider">Payment Collections</h4>
                        <span className="material-icons-round text-slate-300">pie_chart</span>
                    </div>
                    <div className="p-8 flex-1">
                        {!data?.collections || data.collections.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center py-10 opacity-40">
                                <span className="material-icons-round text-4xl mb-2">empty_dashboard</span>
                                <p className="text-xs font-bold uppercase tracking-widest">No data for this range</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {data.collections.map((item, idx) => {
                                    const percent = (item.amount / (data.periodRevenue || 1)) * 100;
                                    return (
                                        <div key={idx} className="group">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                        <span className="material-icons-round">{getPaymentIcon(item.method)}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-800">{getPaymentLabel(item.method)}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{item.count} Transactions</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-slate-800">RM {item.amount.toFixed(2)}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{percent.toFixed(1)}%</p>
                                                </div>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-slate-900 group-hover:bg-indigo-600 transition-all duration-500"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Business Insights (Simplified) */}
                <div className="bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-200 p-8 text-white relative overflow-hidden">
                    <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="relative z-10 h-full flex flex-col">
                        <h4 className="font-black text-sm uppercase tracking-wider mb-6">Business Intelligence</h4>
                        <div className="mb-auto">
                            <p className="text-[10px] text-indigo-200 font-black uppercase tracking-widest mb-1">Period Total Revenue</p>
                            <h2 className="text-4xl font-black tracking-tighter mb-4">RM {(data?.periodRevenue || 0).toFixed(2)}</h2>
                            <p className="text-xs text-indigo-100 font-medium leading-relaxed opacity-80">
                                This reflects the total net collections for the selected period.
                            </p>
                        </div>
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-indigo-200">Revenue to Goal</span>
                                <span className="text-sm font-black">RM {(data ? Math.max(0, data.monthlyGoal - data.periodRevenue) : 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface StatCardProps {
    label: string;
    value: number;
    icon: string;
    color: 'blue' | 'amber' | 'emerald' | 'indigo';
    subtitle: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, subtitle }) => {
    const colorMap = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' }
    };
    const c = colorMap[color];

    return (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-6">
                <div className={`w-12 h-12 rounded-2xl ${c.bg} flex items-center justify-center ${c.text} group-hover:scale-110 transition-transform`}>
                    <span className="material-icons-round text-2xl">{icon}</span>
                </div>
                <span className="material-icons-round text-slate-200 group-hover:text-slate-300 transition-colors">keyboard_arrow_right</span>
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-black text-slate-400">RM</span>
                    <span className="text-2xl font-black text-slate-800 tracking-tighter">{value.toFixed(2)}</span>
                </div>
                <p className="text-[10px] mt-1.5 text-slate-400 font-medium">{subtitle}</p>
            </div>
        </div>
    );
};
