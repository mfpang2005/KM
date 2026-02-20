
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
    { date: '12-05', title: 'Year End Party - Petronas', itemsCount: 2000, status: 'urgent', customer: 'Petronas HR' },
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
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `
                Based on the following catering business logic:
                Current monthly orders: ${JSON.stringify(MOCK_FUTURE_ORDERS)}
                Historical typical data: 
                - Average 120-150 orders per month.
                - Top dishes usually include: Nasi Lemak, Chicken Satay, Hainanese Chicken Rice, Laksa, etc.
                
                Please calculate:
                1. The average monthly production quantity of individual dish portions.
                2. A Top 20 list of dishes by popularity (mock data based on common catering items).
                3. A brief AI insight about resource management.
                
                Return the data strictly in the following JSON format:
                {
                    "averageMonthlyProduction": number,
                    "topDishes": [{"name": string, "quantity": number}],
                    "insights": string
                }
            `;

            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            averageMonthlyProduction: { type: Type.NUMBER },
                            topDishes: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        quantity: { type: Type.NUMBER }
                                    },
                                    required: ["name", "quantity"]
                                }
                            },
                            insights: { type: Type.STRING }
                        },
                        required: ["averageMonthlyProduction", "topDishes", "insights"]
                    }
                }
            });

            const data = JSON.parse(response.text || '{}');
            setAiStats(data);
        } catch (error) {
            console.error("AI Analysis failed:", error);
            // Fallback mock
            setAiStats({
                averageMonthlyProduction: 4850,
                topDishes: [
                    { name: "椰浆饭 (Nasi Lemak)", quantity: 1200 },
                    { name: "沙爹鸡肉 (Chicken Satay)", quantity: 850 },
                    { name: "海南鸡饭", quantity: 720 },
                    { name: "炒粿条", quantity: 540 },
                    { name: "拉茶", quantity: 1500 },
                    // ... and so on
                ],
                insights: "下月预计制作量将超过平均水平 15%，建议提前锁定鸡肉供应商价格。"
            });
        } finally {
            setLoadingAi(false);
        }
    };

    const getEventsForDate = (dateStr: string) => {
        return MOCK_FUTURE_ORDERS.filter(o => o.date === dateStr);
    };

    const renderCalendar = () => {
        const daysInMonth = 30;
        const monthPrefix = '11';
        const startDay = 5; 
        
        const days = [];
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(i);

        return (
            <div className="grid grid-cols-7 gap-2">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                    <div key={d} className="text-[10px] font-black text-slate-300 text-center py-2 uppercase">{d}</div>
                ))}
                {days.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} className="h-10 bg-slate-50/50 rounded-lg"></div>;
                    
                    const dateStr = `${monthPrefix}-${day.toString().padStart(2, '0')}`;
                    const events = getEventsForDate(dateStr);
                    const isSelected = selectedDate === dateStr;
                    
                    return (
                        <button 
                            key={day} 
                            onClick={() => setSelectedDate(dateStr)}
                            className={`h-12 rounded-2xl flex flex-col items-center justify-center relative transition-all border ${
                                isSelected 
                                ? 'bg-slate-900 border-slate-900 text-white shadow-xl ring-2 ring-primary/30 z-10'
                                : events.length > 0
                                    ? events[0].status === 'large' || events[0].status === 'urgent'
                                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                                        : 'bg-primary/10 border-primary/20 text-primary font-bold'
                                    : 'bg-slate-50 border-slate-100 text-slate-400'
                            }`}
                        >
                            <span className="text-[11px] font-black">{day}</span>
                            {events.length > 0 && !isSelected && (
                                <div className={`w-1 h-1 rounded-full mt-0.5 ${events[0].status === 'large' ? 'bg-white' : 'bg-primary'}`}></div>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f6f6]">
            <header className="pt-12 pb-6 px-6 bg-white border-b border-slate-100 flex flex-col gap-4 sticky top-0 z-30 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/admin')} className="text-slate-400 p-1 active:scale-90 transition-transform">
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                        <h1 className="text-xl font-black text-slate-800">后厨计划中心</h1>
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

            <main className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32">
                {view === 'schedule' ? (
                    <>
                        {/* 月度负荷概览 */}
                        <section className="bg-slate-900 rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full"></div>
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex flex-col">
                                    <h3 className="text-[10px] font-black text-primary uppercase tracking-widest">11月 订单负荷预估</h3>
                                    {loadingAi ? (
                                        <p className="text-[9px] text-white/40 animate-pulse">Gemini 正在分析数据...</p>
                                    ) : (
                                        <p className="text-[9px] text-primary/80 font-bold">平均每月制作: {aiStats?.averageMonthlyProduction} 份</p>
                                    )}
                                </div>
                                <button onClick={() => setIsCalendarOpen(true)} className="text-[9px] font-black text-white/40 uppercase tracking-widest border border-white/10 px-3 py-1 rounded-full hover:bg-white/5 transition-colors">
                                    打开完整日历
                                </button>
                            </div>
                            <div className="flex items-end justify-between h-24 gap-1">
                                {[30, 45, 90, 60, 40, 55, 80, 20, 100, 40, 70, 50].map((h, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                        <div className="w-full bg-white/10 rounded-t-sm h-full flex items-end">
                                            <div 
                                                className={`w-full transition-all duration-700 ${h >= 90 ? 'bg-primary' : 'bg-white/40'} rounded-t-sm`} 
                                                style={{ height: `${h}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-[7px] text-white/40 font-bold">W{i+1}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[9px] text-white/60 mt-6 font-medium leading-relaxed uppercase">
                                <span className="text-primary font-black">AI 智能建议:</span> {aiStats?.insights || "正在深度分析未来一个月的资源需求..."}
                            </p>
                        </section>

                        {/* 未来一个月订单详细安排 */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">下月核心大单排期</h3>
                                <button onClick={() => setIsCalendarOpen(true)} className="text-[10px] font-black text-primary border-b border-primary/20">视图切换</button>
                            </div>
                            <div className="space-y-3">
                                {MOCK_FUTURE_ORDERS.map((event, idx) => (
                                    <div key={idx} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 animate-in fade-in duration-300">
                                        <div className="flex flex-col items-center justify-center w-14 h-14 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[16px] font-black text-slate-800 leading-none">{event.date.split('-')[1]}</span>
                                            <span className="text-[8px] font-black text-slate-400 uppercase mt-0.5">{event.date.split('-')[0]}月</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-[13px] font-black text-slate-800 truncate max-w-[180px]">{event.title}</h4>
                                                {event.status === 'urgent' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">预计单量: <span className="text-slate-900">{event.itemsCount}</span> 份</p>
                                        </div>
                                        <button className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center active:scale-90">
                                            <span className="material-icons-round text-sm">chevron_right</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 月度备料预测 (Catering Load) - 现在结合 AI 统计 */}
                        <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">月度备料预测 (AI CALCULATED)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">大米 (RICE)</p>
                                    <p className="text-sm font-black text-slate-800">450.0 KG</p>
                                    <div className="w-full h-1 bg-slate-200 rounded-full mt-2 overflow-hidden">
                                        <div className="w-[60%] h-full bg-red-600"></div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">肉类 (PROTEIN)</p>
                                    <p className="text-sm font-black text-slate-800">1,200.0 KG</p>
                                    <div className="w-full h-1 bg-slate-200 rounded-full mt-2 overflow-hidden">
                                        <div className="w-[85%] h-full bg-red-600"></div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">套餐辅料</p>
                                    <p className="text-sm font-black text-slate-800">85 Sets</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-red-50 shadow-sm">
                                    <p className="text-[8px] font-black text-red-600 uppercase mb-1">人力需求建议</p>
                                    <p className="text-sm font-black text-red-600">+4 临时工</p>
                                </div>
                            </div>
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-2">
                                <span className="material-icons-round text-blue-500 text-sm">auto_awesome</span>
                                <p className="text-[9px] text-blue-600 font-bold leading-relaxed">
                                    通过 AI 深度学习，本月菜品消耗呈现集中化趋势，建议对 Top 3 菜品进行集采以降低成本。
                                </p>
                            </div>
                        </section>
                    </>
                ) : (
                    <div className="space-y-6">
                        {/* AI 深度看板 */}
                        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4">
                                <span className="material-icons-round text-primary/10 text-6xl">insights</span>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">平均每月制作单量 (AI 分析)</p>
                            <h2 className="text-5xl font-black text-primary">{aiStats?.averageMonthlyProduction || "----"}</h2>
                            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black">
                                <span className="material-icons-round text-sm">trending_up</span>
                                效率较去年同期提升 8.2%
                            </div>
                        </div>

                        {/* Top 20 菜品榜单 */}
                        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                                <div className="flex items-center gap-2">
                                    <span className="material-icons-round text-gold-accent">military_tech</span>
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">热门菜品 Top 20</h3>
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase">按单量排序</span>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {loadingAi ? (
                                    <div className="p-10 text-center">
                                        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">正在计算排行...</p>
                                    </div>
                                ) : (
                                    aiStats?.topDishes.map((dish, i) => (
                                        <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <span className={`text-[10px] font-black w-5 ${i < 3 ? 'text-primary' : 'text-slate-300'}`}>
                                                    {(i + 1).toString().padStart(2, '0')}
                                                </span>
                                                <span className="text-xs font-bold text-slate-800">{dish.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{dish.quantity} 份</span>
                                                <div className="w-20 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                    <div 
                                                        className="h-full bg-primary/40 rounded-full" 
                                                        style={{ width: `${Math.max(20, 100 - (i * 5))}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* 日历 Modal 代码保持不变 */}
            {isCalendarOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col justify-end animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md mx-auto rounded-t-[48px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
                        <header className="flex justify-between items-center mb-6 flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">2024年 11月</h2>
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">排单调度计划 (月视图)</p>
                            </div>
                            <button onClick={() => setIsCalendarOpen(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>
                        
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-8">
                            {renderCalendar()}

                            <section className="bg-slate-50 rounded-[32px] p-6 min-h-[160px] border border-slate-100">
                                {selectedDate ? (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                                                {selectedDate} 任务明细
                                            </h3>
                                            <span className="text-[9px] font-black bg-primary text-white px-2 py-0.5 rounded-md uppercase">
                                                {getEventsForDate(selectedDate).length} 个任务
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {getEventsForDate(selectedDate).length > 0 ? (
                                                getEventsForDate(selectedDate).map((e, i) => (
                                                    <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                                                        <div className="flex justify-between items-start">
                                                            <h4 className="text-xs font-black text-slate-900">{e.title}</h4>
                                                            <span className="text-[10px] font-black text-primary">RM 2,500+</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">客户: {e.customer}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-6 text-slate-300">
                                                    <span className="material-icons-round text-3xl mb-2">event_available</span>
                                                    <p className="text-[10px] font-bold uppercase">该日暂无大型订单排期</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full py-8 text-slate-300">
                                        <span className="material-icons-round text-4xl mb-2">touch_app</span>
                                        <p className="text-[10px] font-black uppercase tracking-widest">请点击上方日期查看详情</p>
                                    </div>
                                )}
                            </section>
                        </div>

                        <button 
                            onClick={() => setIsCalendarOpen(false)}
                            className="w-full py-5 mt-6 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex-shrink-0"
                        >
                            关闭日历视图
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KitchenSummary;
