import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalStats } from '../hooks/useGlobalStats';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    showStats?: boolean;
}

/**
 * Unified Page Header with Sticky & Compact Mode
 * Transitions at 80px scroll depth
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, showStats = true }) => {
    const { stats } = useGlobalStats();
    const [isCompact, setIsCompact] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Find the main scrollable container (the one in AdminLayout)
        const findScrollContainer = () => {
            let el = document.querySelector('main .overflow-y-auto');
            if (!el) el = document.querySelector('.overflow-y-auto'); // Fallback
            return el;
        };

        const scrollContainer = findScrollContainer();
        if (!scrollContainer) return;

        const handleScroll = () => {
            const scroll = scrollContainer.scrollTop;
            if (scroll > 80) {
                setIsCompact(true);
            } else if (scroll < 60) {
                setIsCompact(false);
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    const handleStatClick = (type: 'revenue' | 'orders' | 'unpaid') => {
        switch (type) {
            case 'revenue':
                navigate('/finance?filter=paid');
                break;
            case 'unpaid':
                navigate('/finance?filter=unpaid');
                break;
            case 'orders':
                navigate('/orders?date=today');
                break;
        }
    };

    return (
        <header
            className={`sticky top-[-1px] z-[80] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] mb-8
                ${isCompact
                    ? 'py-2 px-6 bg-slate-900/90 backdrop-blur-xl shadow-2xl border-b border-white/10 rounded-b-[24px] -mx-10 translate-y-2'
                    : 'py-2 px-0 bg-transparent'
                }`}
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <div className="transition-all duration-500">
                        <h1 className={`font-black tracking-tight transition-all duration-500 ${isCompact ? 'text-sm text-white' : 'text-3xl text-slate-800'}`}>
                            {title}
                        </h1>
                        <div className={`overflow-hidden transition-all duration-500 ${isCompact ? 'max-h-0 opacity-0' : 'max-h-10 opacity-100 mt-1'}`}>
                            {subtitle && (
                                <p className="text-slate-500 text-sm">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Compact Stats Bar - Slimmer & Darker for Premium Feel */}
                    {showStats && (
                        <div className={`flex items-center gap-4 transition-all duration-500 ${isCompact ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                            <div className="h-4 w-px bg-white/20" />

                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleStatClick('revenue')}>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">Today:</span>
                                    <span className="text-xs font-black text-emerald-400 font-mono-finance">RM {stats.todayRevenue.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleStatClick('unpaid')}>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-red-400 transition-colors">Unpaid:</span>
                                    <span className="text-xs font-black text-red-500 font-mono-finance">RM {stats.totalUnpaidBalance.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => handleStatClick('orders')}>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-400 transition-colors">Orders:</span>
                                    <span className="text-xs font-black text-blue-400">{stats.todayOrdersCount}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={`flex items-center gap-3 transition-all duration-500 ${isCompact ? 'scale-90 origin-right' : 'scale-100'}`}>
                    {actions}
                </div>
            </div>

            {/* Expanded Stats View with Slide-up Logic */}
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                ${isCompact
                    ? 'opacity-0 pointer-events-none translate-y-[-20px] max-h-0 mt-0 overflow-hidden'
                    : 'opacity-100 mt-8 max-h-[500px] translate-y-0'
                }`}
            >
                {showStats && (
                    <>
                        <div
                            onClick={() => handleStatClick('revenue')}
                            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <span className="material-icons-round text-2xl">monetization_on</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today Revenue</p>
                                    <span className="material-icons-round text-[14px] text-slate-300 group-hover:text-primary transition-colors">arrow_outward</span>
                                </div>
                                <p className="text-2xl font-black text-slate-800 font-mono">RM {stats.todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>

                        <div
                            onClick={() => handleStatClick('orders')}
                            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <span className="material-icons-round text-2xl">receipt_long</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today Orders</p>
                                    <span className="material-icons-round text-[14px] text-slate-300 group-hover:text-primary transition-colors">arrow_outward</span>
                                </div>
                                <p className="text-2xl font-black text-slate-800">{stats.todayOrdersCount}</p>
                            </div>
                        </div>

                    </>
                )}
            </div>
        </header>
    );
};
