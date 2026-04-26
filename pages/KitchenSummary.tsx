
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleGenAI, Type } from "@google/genai";

interface MonthlyEvent {
    date: string; // format: MM-DD
    title: string;
    itemsCount: number;
    status: 'urgent' | 'normal' | 'large';
    customer?: string;
}

interface AiStats {
    averageMonthlyProduction: number;
    topDishes: { name: string; quantity: number }[];
    insights: string;
}

const MOCK_FUTURE_ORDERS: MonthlyEvent[] = [
    { date: '11-05', title: 'AIA Annual Dinner (500 pax)', itemsCount: 1500, status: 'large', customer: 'AIA Corporate' },
    { date: '11-12', title: 'Wedding Reception - Lee Family', itemsCount: 350, status: 'normal', customer: 'Lee Kong Wei' },
    { date: '11-20', title: 'Standard Chartered HQ Lunch', itemsCount: 120, status: 'normal', customer: 'SCB Group' },
    { date: '11-28', title: 'Grand Opening - Pavilion Bukit Jalil', itemsCount: 800, status: 'large', customer: 'Pavilion Mgt' },
];

const KitchenSummary: React.FC = () => {
    const navigate = useNavigate();
    const [view, setView] = useState<'stats' | 'schedule'>('schedule');
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [aiStats, setAiStats] = useState<AiStats | null>(null);
    const [loadingAi, setLoadingAi] = useState(false);

    useEffect(() => {
        fetchAiInsights();
    }, []);

    const fetchAiInsights = async () => {
        setLoadingAi(true);
        try {
            // Simplified for logic
            setAiStats({
                averageMonthlyProduction: 4850,
                topDishes: [
                    { name: "椰浆饭 (Nasi Lemak)", quantity: 1200 },
                    { name: "沙爹鸡肉 (Chicken Satay)", quantity: 850 },
                ],
                insights: "下月预计制作量将超过平均水平 15%，建议提前锁定鸡肉供应商价格。"
            });
        } finally {
            setLoadingAi(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#FDFBF7]">
            {/* 顶栏 (SHRINKED & ALIGNED) */}
            <header className="pt-12 pb-4 px-6 bg-white flex flex-col gap-4 sticky top-0 z-30 border-b border-slate-100/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/super-admin')} className="text-slate-400 active:scale-90 transition-transform">
                            <span className="material-icons-round text-xl">arrow_back</span>
                        </button>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight">后厨计划中心</h1>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                            onClick={() => setView('schedule')}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'schedule' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                        >
                            月度安排
                        </button>
                        <button 
                            onClick={() => setView('stats')}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${view === 'stats' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                        >
                            AI 统计
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
                {view === 'schedule' ? (
                    <>
                        {/* 11月 订单负荷预估 - KITCHEN APP STYLE */}
                        <section className="bg-[#1A1B2E] rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-[12px] font-black text-red-500 uppercase tracking-widest">11月 订单负荷预估</h3>
                                        <p className="text-[10px] text-red-500/60 font-bold">平均每月制作: 4850 份</p>
                                    </div>
                                    <button className="text-[9px] font-black text-white/30 uppercase tracking-widest border border-white/10 px-4 py-1.5 rounded-full">
                                        打开完整日历
                                    </button>
                                </div>

                                {/* Bar Chart */}
                                <div className="flex items-end justify-between h-28 gap-1.5 px-2">
                                    {[20, 30, 45, 60, 40, 50, 70, 30, 100, 40, 60, 50].map((h, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                            <div className="w-full bg-white/5 rounded-t-sm h-full flex items-end">
                                                <div 
                                                    className={`w-full transition-all duration-700 ${h >= 80 ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-white/20'} rounded-t-sm`} 
                                                    style={{ height: `${h}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[8px] text-white/30 font-black">W{i+1}</span>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[10px] text-white/80 mt-8 font-bold leading-relaxed">
                                    <span className="text-red-500 font-black">AI 智能建议:</span> 下月预计制作量将超过平均水平 15%，建议提前锁定鸡肉供应商价格。
                                </p>
                            </div>
                        </section>

                        {/* 下月核心大单排期 */}
                        <section className="space-y-4 pt-2">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">下月核心大单排期</h3>
                                <button className="text-[10px] font-black text-red-800 border-b border-red-800/20 uppercase tracking-tighter">视图切换</button>
                            </div>
                            <div className="space-y-3">
                                {MOCK_FUTURE_ORDERS.map((event, idx) => (
                                    <div key={idx} className="bg-white p-5 rounded-[40px] border border-slate-100 shadow-sm flex items-center gap-5 transition-all active:scale-[0.98]">
                                        <div className="flex flex-col items-center justify-center w-16 h-16 bg-slate-50 rounded-full border border-slate-100/50 shrink-0">
                                            <span className="text-[20px] font-black text-slate-900 leading-none">{event.date.split('-')[1]}</span>
                                            <span className="text-[10px] font-black text-slate-400 uppercase mt-1">{event.date.split('-')[0]}月</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[15px] font-black text-slate-800 truncate">{event.title}</h4>
                                            <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                                                预计单量: <span className="text-slate-900">{event.itemsCount} 份</span>
                                            </p>
                                        </div>
                                        <button className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center shrink-0">
                                            <span className="material-icons-round text-xl">chevron_right</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                ) : (
                    <div className="space-y-6">
                        {/* AI Stats Tab Content */}
                        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">平均每月制作单量 (AI 分析)</p>
                            <h2 className="text-5xl font-black text-red-900">{aiStats?.averageMonthlyProduction || "----"}</h2>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default KitchenSummary;
