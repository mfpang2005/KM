import React, { useState, useEffect } from 'react';
import { SuperAdminService } from '../services/api';

/**
 * AI 智能经营简报组件 (手机端适配版)
 * - 与后台 Super Admin 逻辑同步
 * - 提供实时的经营洞察与摘要
 */
export const AiSummaryWidget: React.FC = () => {
    const [summary, setSummary] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSummary = async () => {
        setLoading(true);
        try {
            const data = await SuperAdminService.getAiSummary();
            setSummary(typeof data === 'string' ? data : (data as any).summary || 'AI 暂时无法提供分析。');
            setError(null);
        } catch (err: any) {
            console.error('[AiSummaryWidget] Error:', err);
            setError('无法获取 AI 分析摘要');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSummary();
    }, []);

    if (loading) {
        return (
            <div className="bg-white/50 backdrop-blur-sm p-6 rounded-[2.5rem] border border-slate-100 shadow-sm animate-pulse mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-slate-200"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded"></div>
                </div>
                <div className="space-y-2">
                    <div className="h-3 w-full bg-slate-100 rounded"></div>
                    <div className="h-3 w-5/6 bg-slate-100 rounded"></div>
                </div>
            </div>
        );
    }

    if (error) return null;

    return (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50/30 p-6 rounded-[2.5rem] border border-blue-100 shadow-xl shadow-blue-500/5 mb-6 relative overflow-hidden group">
            {/* Background Decoration */}
            <div className="absolute -right-6 -bottom-6 opacity-[0.05] group-hover:scale-110 transition-transform duration-700">
                <span className="material-icons-round text-[120px] text-indigo-600">auto_awesome</span>
            </div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 animate-pulse">
                            <span className="material-icons-round text-xl">auto_awesome</span>
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 tracking-tight">AI 智能经营简报</h3>
                            <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mt-0.5">Real-time Insight</p>
                        </div>
                    </div>
                    <button 
                        onClick={loadSummary}
                        className="p-2 hover:bg-white/50 rounded-xl transition-colors text-indigo-400 hover:text-indigo-600 active:scale-90"
                    >
                        <span className="material-icons-round text-sm">refresh</span>
                    </button>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-5 rounded-2xl border border-white/60 text-slate-700 leading-relaxed text-sm font-medium shadow-inner italic">
                    {summary.split('\n').map((line, i) => (
                        <p key={i} className={i > 0 ? 'mt-2' : ''}>
                            {line}
                        </p>
                    ))}
                </div>
                
                <div className="mt-4 flex items-center gap-2 text-[10px] font-black text-indigo-400/80 uppercase tracking-widest px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    AI Analysis Linked
                </div>
            </div>
        </div>
    );
};
