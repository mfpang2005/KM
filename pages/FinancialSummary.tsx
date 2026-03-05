
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SuperAdminService } from '../src/services/api';
import { useEffect } from 'react';
import PullToRefresh from '../src/components/PullToRefresh';

interface FinancialData {
    grossSales: number;
    discounts: number;
    tax: number;
    netSales: number;
    collections: { method: string; amount: number; count: number }[];
    categorySales: { category: string; amount: number }[];
    hourlySales: { hour: string; amount: number }[];
}

const INITIAL_FINANCE: FinancialData = {
    grossSales: 0,
    discounts: 0,
    tax: 0,
    netSales: 0,
    collections: [],
    categorySales: [],
    hourlySales: []
};

const FinancialSummary: React.FC = () => {
    const navigate = useNavigate();
    const [timeRange, setTimeRange] = useState<'today' | 'month' | 'all'>('today');
    const [paymentStatus, setPaymentStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [finance, setFinance] = useState<FinancialData>(INITIAL_FINANCE);
    const [loading, setLoading] = useState(true);

    const loadFinance = async () => {
        try {
            setLoading(true);
            const data = await SuperAdminService.getFinancials(timeRange, paymentStatus);
            setFinance(data);
        } catch (error) {
            console.error('Failed to load financials:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFinance();
    }, [timeRange, paymentStatus]);

    const handlePrint = () => {
        window.print();
    };

    if (loading && finance.grossSales === 0) {
        return (
            <div className="flex flex-col h-full bg-slate-900 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-200">
            {/* 打印专用模板 (仅在打印时可见) */}
            <div className="hidden print:block fixed inset-0 bg-white text-black p-10 z-[9999]">
                <div className="max-w-2xl mx-auto border-4 border-black p-8">
                    <div className="text-center border-b-4 border-black pb-6 mb-6">
                        <h1 className="text-3xl font-black uppercase">KIM LONG CATERING</h1>
                        <p className="text-sm font-bold tracking-[0.3em] mt-1 uppercase">Daily Business Closing Report</p>
                        <p className="text-xs mt-2">Date: {new Date().toLocaleDateString()} | Printed By: Admin_001</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div className="space-y-2">
                            <h4 className="font-black text-xs uppercase border-b-2 border-black pb-1">Sales Summary</h4>
                            <div className="flex justify-between text-sm"><span>Gross Sales:</span> <span>RM {finance.grossSales.toFixed(2)}</span></div>
                            <div className="flex justify-between text-sm"><span>Discounts:</span> <span>- RM {finance.discounts.toFixed(2)}</span></div>
                            <div className="flex justify-between text-sm"><span>Tax (SST 6%):</span> <span>RM {finance.tax.toFixed(2)}</span></div>
                            <div className="flex justify-between text-base font-black border-t-2 border-black pt-1"><span>NET SALES:</span> <span>RM {finance.netSales.toFixed(2)}</span></div>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-black text-xs uppercase border-b-2 border-black pb-1">Collection Summary</h4>
                            {finance.collections.map(c => (
                                <div key={c.method} className="flex justify-between text-sm">
                                    <span>{c.method} ({c.count}):</span>
                                    <span>RM {c.amount.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t-2 border-black pt-6">
                        <h4 className="font-black text-xs uppercase mb-4">Category Breakdown</h4>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-black">
                                    <th className="text-left py-1">Category</th>
                                    <th className="text-right py-1">Contribution</th>
                                    <th className="text-right py-1">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {finance.categorySales.map(cat => (
                                    <tr key={cat.category} className="border-b border-slate-100">
                                        <td className="py-2">{cat.category}</td>
                                        <td className="text-right py-2">{finance.netSales > 0 ? ((cat.amount / finance.netSales) * 100).toFixed(1) : 0}%</td>
                                        <td className="text-right py-2 font-bold">RM {cat.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-12 pt-8 border-t-4 border-black flex justify-between items-end">
                        <div className="text-center w-32 border-t border-black pt-2 text-[10px] font-bold">Manager Signature</div>
                        <div className="text-center w-32 border-t border-black pt-2 text-[10px] font-bold">Auditor Signature</div>
                        <div className="text-right">
                            <p className="text-[8px] font-bold uppercase opacity-50">KIM LONG SMART POS SYSTEM v2.5</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* UI 交互部分 */}
            <header className="bg-slate-900 pt-12 pb-6 px-6 sticky top-0 z-20 border-b border-white/5 no-print">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => navigate('/admin')} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-slate-400">
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                    <div className="text-center">
                        <h1 className="text-gold-accent font-black text-lg tracking-tight uppercase">财务汇总中心</h1>
                        <p className="text-slate-500 text-[8px] font-bold tracking-[0.4em] uppercase">POS Financial Intelligence</p>
                    </div>
                    <button onClick={handlePrint} className="w-10 h-10 bg-primary/20 text-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/10 active:scale-90">
                        <span className="material-icons-round">download_for_offline</span>
                    </button>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
                        {['today', 'month', 'all'].map((t) => (
                            <button
                                key={t}
                                onClick={() => setTimeRange(t as any)}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${timeRange === t ? 'bg-primary text-white shadow-xl' : 'text-slate-500'}`}
                            >
                                {t === 'today' ? '今日结算' : t === 'month' ? '这月' : '全部'}
                            </button>
                        ))}
                    </div>
                    <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
                        {['all', 'paid', 'unpaid'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setPaymentStatus(status as any)}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${paymentStatus === status ? 'bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)]' : 'text-slate-500'}`}
                            >
                                {status === 'all' ? '全部状态' : status === 'paid' ? '已收 (PAID)' : '未收 (UNPAID)'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden relative no-print bg-slate-900 pb-32">
                <PullToRefresh onRefresh={loadFinance}>
                    <div className="p-4 space-y-6 min-h-full">
                        {/* 核心 KPI 网格 */}
                        <section className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800 p-5 rounded-[32px] border border-white/5 shadow-xl col-span-2 relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 opacity-5">
                                    <span className="material-icons-round text-9xl">payments</span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">今日实收净额 (Net Collected)</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-black text-white tracking-tighter">RM {finance.netSales.toLocaleString()}</span>
                                    <span className="text-green-500 text-xs font-bold">+0%</span>
                                </div>
                                <div className="mt-4 flex gap-4">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-bold text-slate-500 uppercase">毛销售额</span>
                                        <span className="text-xs font-black text-slate-300">RM {finance.grossSales.toFixed(2)}</span>
                                    </div>
                                    <div className="flex flex-col border-l border-white/10 pl-4">
                                        <span className="text-[8px] font-bold text-slate-500 uppercase">折扣 & 冲正</span>
                                        <span className="text-xs font-black text-red-400">-RM {finance.discounts.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-800/50 p-5 rounded-[32px] border border-white/5">
                                <p className="text-[9px] font-black text-slate-500 uppercase mb-2">订单总量</p>
                                <h4 className="text-2xl font-black text-white">128 <span className="text-[10px] font-bold text-slate-400">单</span></h4>
                            </div>
                            <div className="bg-slate-800/50 p-5 rounded-[32px] border border-white/5">
                                <p className="text-[9px] font-black text-slate-500 uppercase mb-2">客单价 (AOV)</p>
                                <h4 className="text-2xl font-black text-white">RM 103</h4>
                            </div>
                        </section>

                        {/* 支付方式分布 */}
                        <section className="bg-white/5 p-6 rounded-[40px] border border-white/5">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">支付渠道分布 (Channel Mix)</h3>
                            <div className="space-y-4">
                                {finance.collections.length === 0 && <p className="text-xs text-slate-500 text-center py-4">暂无收款记录</p>}
                                {finance.collections.map(c => (
                                    <div key={c.method} className="space-y-1.5">
                                        <div className="flex justify-between text-[11px] font-bold">
                                            <span className="text-slate-300">{c.method}</span>
                                            <span className="text-white">RM {c.amount.toFixed(2)}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gold-accent shadow-[0_0_10px_rgba(212,175,55,0.4)] rounded-full transition-all duration-1000"
                                                style={{ width: `${finance.netSales > 0 ? (c.amount / finance.netSales) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 时段销售看板 */}
                        <section className="bg-slate-800 p-6 rounded-[40px] border border-white/5">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">时段销售压力分析</h3>
                                <span className="text-[9px] font-black bg-primary text-white px-2 py-0.5 rounded uppercase">Peak: 12PM</span>
                            </div>
                            <div className="flex items-end justify-between h-32 gap-1.5 px-2">
                                {finance.hourlySales.map((h, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                                        <div className="w-full bg-white/5 rounded-t-xl h-full flex items-end overflow-hidden">
                                            <div
                                                className={`w-full transition-all duration-1000 ${h.amount > 3000 ? 'bg-primary' : 'bg-gold-accent/40'} group-hover:bg-primary shadow-lg`}
                                                style={{ height: `${(h.amount / 4500) * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-500 group-hover:text-white transition-colors">{h.hour}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 菜品类目占比 */}
                        <section className="bg-white/5 p-6 rounded-[40px] border border-white/5">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">类目营收占比 (Product Mix)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {finance.categorySales.map(cat => (
                                    <div key={cat.category} className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase truncate">{cat.category}</p>
                                        <p className="text-sm font-black text-white mt-1">RM {cat.amount.toFixed(2)}</p>
                                        <p className="text-[8px] font-bold text-gold-accent mt-0.5">占比 {finance.netSales > 0 ? ((cat.amount / finance.netSales) * 100).toFixed(1) : 0}%</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* AI 深度洞察 */}
                        <section className="p-6 bg-gold-accent/10 border border-gold-accent/20 rounded-[40px] flex items-start gap-4">
                            <div className="w-10 h-10 bg-gold-accent/20 rounded-2xl flex items-center justify-center text-gold-accent shrink-0">
                                <span className="material-icons-round">auto_awesome</span>
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-xs font-black text-gold-accent uppercase tracking-widest">Gemini 财务分析建议</h4>
                                <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
                                    今日午间（12PM-1PM）营收占全天 58%，但饮料转化率仅为 14%，建议在午餐时段推出“套餐升级加购”活动。此外，配送费支出环比增长 8%，需关注物流成本控制。
                                </p>
                            </div>
                        </section>
                    </div>
                </PullToRefresh>
            </main>
        </div>
    );
};

export default FinancialSummary;
