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
        const scrollContainer = document.querySelector('.overflow-y-auto');
        if (!scrollContainer) return;

        const handleScroll = () => {
            setIsCompact(scrollContainer.scrollTop > 80);
        };

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    const handleStatClick = (type: 'revenue' | 'orders' | 'unpaid') => {
        switch (type) {
            case 'revenue':
                // Navigate to Finance and scroll to reconciliation
                navigate('/finance?filter=paid');
                setTimeout(() => {
                    const el = document.getElementById('payment-reconciliation');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
                break;
            case 'orders':
                // Navigate to Orders with today filter
                navigate('/orders?date=today');
                break;
            case 'unpaid':
                // Navigate to Finance with unpaid filter
                navigate('/finance?filter=unpaid');
                setTimeout(() => {
                    const el = document.getElementById('payment-reconciliation');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
                break;
        }
    };

    return (
        <header
            className={`sticky top-0 z-30 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] mb-8
                ${isCompact
                    ? 'py-3 px-6 bg-white/95 backdrop-blur-xl shadow-lg border-b border-slate-200/50 rounded-b-[24px] -mx-10'
                    : 'py-2 px-0 bg-transparent'
                }`}
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <div className="transition-all duration-500">
                        <h1 className={`font-black text-slate-800 tracking-tight transition-all duration-500 ${isCompact ? 'text-lg' : 'text-3xl'}`}>
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

                    {/* Compact Stats Bar */}
                    {showStats && (
                        <div className={`flex items-center gap-4 transition-all duration-500 ${isCompact ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                            <div className="h-6 w-px bg-slate-200" />

                            <div className="flex items-center gap-6">
                                <div className="flex flex-col cursor-pointer group" onClick={() => handleStatClick('revenue')}>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors">Today Rev</span>
                                    <span className="text-xs font-black text-emerald-600 font-mono">RM {stats.todayRevenue.toFixed(0)}</span>
                                </div>
                                <div className="flex flex-col cursor-pointer group" onClick={() => handleStatClick('orders')}>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors">Orders</span>
                                    <span className="text-xs font-black text-blue-600">{stats.todayOrdersCount}</span>
                                </div>
                                <div className="flex flex-col cursor-pointer group" onClick={() => handleStatClick('unpaid')}>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors">Unpaid Bill</span>
                                    <span className="text-xs font-black text-rose-600 font-mono">RM {stats.totalUnpaid.toFixed(0)}</span>
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

                        <div
                            onClick={() => handleStatClick('unpaid')}
                            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5 hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center transition-transform group-hover:scale-110">
                                <span className="material-icons-round text-2xl">account_balance_wallet</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Unpaid Balance</p>
                                    <span className="material-icons-round text-[14px] text-slate-300 group-hover:text-primary transition-colors">arrow_outward</span>
                                </div>
                                <p className="text-2xl font-black text-slate-800 font-mono">RM {stats.totalUnpaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </header>
    );
};
