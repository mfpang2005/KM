import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { OrderStatus, UserRole } from '../types';
import FinanceWidget from '../src/components/FinanceWidget';
import PullToRefresh from '../src/components/PullToRefresh';
import { useStats } from '../src/hooks/useStats';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { stats, loading: statsLoading, refresh } = useStats();
    const [userRole, setUserRole] = useState<UserRole | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const role = session.user.user_metadata?.role as UserRole | undefined;
                setUserRole(role ?? UserRole.ADMIN);
            }
        });
    }, []);

    const statusLabels: Record<string, string> = {
        [OrderStatus.PENDING]: 'PENDING',
        [OrderStatus.PREPARING]: 'KITCHEN',
        [OrderStatus.READY]: 'READY',
        [OrderStatus.DELIVERING]: 'DELIVER',
        [OrderStatus.COMPLETED]: 'COMPLETED',
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-amber-400/10 text-amber-600 border border-amber-200/50 shadow-[inset_0_1px_1px_rgba(251,191,36,0.1)]',
        [OrderStatus.PREPARING]: 'bg-sky-400/10 text-sky-600 border border-sky-200/50 shadow-[inset_0_1px_1px_rgba(56,189,248,0.1)]',
        [OrderStatus.READY]: 'bg-emerald-400/10 text-emerald-600 border border-emerald-200/50 shadow-[inset_0_1px_1px_rgba(52,211,153,0.1)]',
        [OrderStatus.DELIVERING]: 'bg-violet-400/10 text-violet-600 border border-violet-200/50 shadow-[inset_0_1px_1px_rgba(167,139,250,0.1)]',
        [OrderStatus.COMPLETED]: 'bg-green-400/10 text-green-600 border border-green-200/50 shadow-[inset_0_1px_1px_rgba(74,222,128,0.1)]',
    };

    return (
        <div className="flex flex-col h-full bg-background-beige">
            {/* 顶部导航栏 - System Overview Mode (Compact) */}
            <header className="pt-8 pb-4 px-6 bg-white/40 backdrop-blur-3xl border-b border-primary/5 sticky top-0 z-30">
                <div className="max-w-4xl mx-auto flex flex-col items-center gap-2">
                    <div className="text-center">
                        <h2 className="text-sm font-black text-primary uppercase tracking-[0.4em] mb-1">金龙管理总汇</h2>
                        <h1 className="text-2xl font-black text-primary tracking-tight uppercase leading-none opacity-80">Kim Long System Overview</h1>
                        <p className="text-[9px] text-primary-light/40 font-black uppercase tracking-[0.3em] mt-2">Administrative Intelligence</p>
                    </div>
                </div>
                
                {/* 浮动操作按钮 */}
                <div className="absolute top-8 right-6 flex items-center gap-2">
                    {userRole === UserRole.SUPER_ADMIN && (
                        <button
                            onClick={() => window.open('http://localhost:5174', '_blank')}
                            className="p-3 rounded-2xl bg-primary/5 text-primary border border-primary/10 active:scale-95 transition-all shadow-sm"
                        >
                            <span className="material-icons-round text-sm">shield</span>
                        </button>
                    )}
                </div>
            </header>

            <PullToRefresh onRefresh={async () => { await refresh(); }}>
                <main className="flex-1 overflow-y-auto p-2 no-scrollbar pb-32">

                    {/* 2 & 3. 核心指标总汇 (No Container Mode) */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                <span className="material-icons-round text-xs">insights</span>
                            </div>
                            <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">核心指标总汇</h3>
                        </div>

                        <FinanceWidget user={userRole} />

                        {/* 核心统计指标网格 - No Cards */}
                        <div className="grid grid-cols-2 divide-x divide-primary/5">
                            <div
                                onClick={() => navigate('/admin/orders')}
                                className="py-2 flex flex-col items-center justify-center text-center"
                            >
                                <span className="text-[8px] font-black text-primary-light/40 uppercase tracking-widest mb-1">Today Orders</span>
                                <p className="text-3xl font-black text-primary tracking-tighter">
                                    {statsLoading ? '...' : stats?.today_orders || 0}
                                </p>
                            </div>

                            <div
                                onClick={() => navigate('/admin/finance')}
                                className="py-2 flex flex-col items-center justify-center text-center"
                            >
                                <span className="text-[8px] font-black text-primary-light/40 uppercase tracking-widest mb-1">Monthly Revenue</span>
                                <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-[10px] font-bold text-accent-gold">RM</span>
                                    <p className="text-xl font-black text-primary tracking-tighter">
                                        {statsLoading ? '...' : Number(stats?.month_revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div
                            onClick={() => navigate('/admin/finance')}
                            className="py-4 border-y border-primary/5 relative overflow-hidden flex flex-col items-center justify-center text-center"
                        >
                            <div className="relative z-10 flex flex-col items-center">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                    <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest">Total Unpaid 未收账目</span>
                                </div>
                                <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-xs font-bold text-amber-600/60 uppercase">RM</span>
                                    <p className="text-4xl font-black text-amber-900 tracking-tighter leading-none">
                                        {statsLoading ? '...' : Number(stats?.total_unpaid || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-8"></div>

                    {/* 4. 快捷功能面板 (Quick Actions - Clean No Container) */}
                    <div className="space-y-4">
                        <h3 className="text-[9px] font-black text-primary-light/40 uppercase tracking-[0.3em] flex items-center gap-2 px-2">
                            <span className="material-icons-round text-[10px]">bolt</span>
                            Quick Actions
                        </h3>
                        <div className="grid grid-cols-4 gap-4 px-2">
                            {[
                                { icon: 'add_shopping_cart', label: 'Create', color: 'bg-white text-primary shadow-sm', path: '/admin/create-order' },
                                { icon: 'local_shipping', label: 'Drivers', color: 'bg-white text-primary shadow-sm', path: '/admin/drivers' },
                                { icon: 'calendar_today', label: 'Events', color: 'bg-white text-primary shadow-sm', path: '/admin/calendar' },
                                { icon: 'settings_voice', label: 'Walkie', color: 'bg-primary text-white shadow-lg', path: '/admin/walkie-talkie' }
                            ].map((func, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => navigate(func.path)}
                                    className={`flex flex-col items-center justify-center aspect-square rounded-2xl transition-all active:scale-95 group ${func.color}`}
                                >
                                    <span className={`material-icons-round text-xl`}>{func.icon}</span>
                                    <span className="text-[7px] font-black uppercase mt-1 opacity-40">{func.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-10"></div>

                    {/* 5. 订单分布状态图 (Order Status Breakdown - Clean Mode) */}
                    <div className="space-y-6 px-2">
                        <h3 className="text-[9px] font-black text-primary-light/40 uppercase tracking-[0.3em] flex items-center gap-2">
                            <span className="material-icons-round text-xs text-primary">analytics</span>
                            Orders by Status
                        </h3>
                        <div className="space-y-4">
                            {statsLoading ? (
                                <div className="space-y-4 animate-pulse">
                                    {[1, 2, 3].map(i => <div key={i} className="h-3 w-full bg-slate-50 rounded-full"></div>)}
                                </div>
                            ) : Object.entries(stats?.orders_by_status || {}).map(([status, count]) => {
                                const total = stats?.total_orders || 1;
                                const pct = Math.round(((count as number) / total) * 100);
                                return (
                                    <div key={status} className="flex items-center gap-3 group cursor-pointer hover:bg-slate-50/50 p-1.5 -m-1.5 rounded-xl transition-all">
                                        <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest min-w-[70px] whitespace-nowrap text-center transition-transform group-hover:scale-105 ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                                            {statusLabels[status] || status}
                                        </span>
                                        <div className="flex-1 h-2 bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                                            <div 
                                                className={`h-full progress-${status} rounded-full transition-all duration-1000 relative overflow-hidden`}
                                                style={{ width: `${pct}%` }}
                                            >
                                                <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                            </div>
                                        </div>
                                        <span className="text-xs font-black text-slate-800 w-6 text-right font-mono group-hover:text-red-500 transition-colors">{count as React.ReactNode}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-10"></div>

                    {/* 6. 最新动态列表 (Recent Activity - Clean Mode) */}
                    <div className="space-y-6 px-2 pt-6 border-t border-primary/5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[9px] font-black text-primary-light/40 uppercase tracking-[0.3em] flex items-center gap-2">
                                <span className="material-icons-round text-xs text-accent-gold">schedule</span>
                                Recent Activity
                            </h3>
                            <button 
                                onClick={() => navigate('/admin/orders')}
                                className="text-[9px] font-black text-primary hover:underline uppercase tracking-widest"
                            >View All</button>
                        </div>
                        <div className="space-y-3">
                            {statsLoading ? (
                                <div className="space-y-2 animate-pulse">
                                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded-2xl"></div>)}
                                </div>
                            ) : !stats?.recent_orders || stats.recent_orders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                                    <div className="w-16 h-16 rounded-full border border-slate-100 flex items-center justify-center animate-pulse mb-3">
                                         <span className="material-icons-round text-2xl opacity-20">radar</span>
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">系统监控中：暂无异常动态</p>
                                </div>
                            ) : (
                                stats.recent_orders.map(order => (
                                    <div 
                                    key={order.id}
                                    onClick={() => navigate('/admin/orders')}
                                    className="flex items-center justify-between py-1.5 border-b border-primary/5 hover:bg-white/40 transition-all cursor-pointer group active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-red-500 border border-slate-100 transition-all shrink-0">
                                            <span className="material-icons-round text-[10px]">local_mall</span>
                                        </div>
                                        <p className="text-[10px] font-black text-slate-800 truncate tracking-tighter">
                                            ID: <span className="text-primary">{order.order_number || order.id.slice(-6)}</span> • RM {Number(order.amount).toFixed(2)}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-tighter shrink-0 ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[order.status] || order.status}
                                    </span>
                                </div>
                                ))
                            )}
                        </div>
                    </div>
                </main>
            </PullToRefresh>
        </div>
    );
};

export default AdminDashboard;
