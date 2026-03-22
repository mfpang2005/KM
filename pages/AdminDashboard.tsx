import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { OrderStatus, UserRole } from '../types';
import FinanceWidget from '../src/components/FinanceWidget';
import { AiSummaryWidget } from '../src/components/AiSummaryWidget';
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
        [OrderStatus.PENDING]: '待处理',
        [OrderStatus.PREPARING]: '准备中',
        [OrderStatus.READY]: '已就绪',
        [OrderStatus.DELIVERING]: '配送中',
        [OrderStatus.COMPLETED]: '已完成',
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-amber-50 text-amber-600 border border-amber-200',
        [OrderStatus.PREPARING]: 'bg-blue-50 text-blue-600 border border-blue-200',
        [OrderStatus.READY]: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
        [OrderStatus.DELIVERING]: 'bg-purple-50 text-purple-600 border border-purple-200',
        [OrderStatus.COMPLETED]: 'bg-green-50 text-green-600 border border-green-200',
        delayed: 'bg-red-50 text-red-600 border border-red-200',
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* 顶部导航栏 - System Overview Mode */}
            <header className="pt-12 pb-8 px-6 bg-white/80 backdrop-blur-3xl border-b border-slate-100 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
                        <span className="material-icons-round text-2xl">dashboard</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Overview</h1>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-0.5 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Real-time Performance & Linkage
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refresh()}
                        className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:shadow-lg transition-all group active:scale-90"
                        title="Manual Refresh"
                    >
                        <span className="material-icons-round text-xl group-hover:rotate-180 transition-transform duration-700">autorenew</span>
                    </button>
                    {userRole === UserRole.SUPER_ADMIN && (
                        <button
                            onClick={() => window.open('http://localhost:5174', '_blank')}
                            className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 active:scale-95 transition-all flex items-center gap-2 group shadow-sm hover:shadow-indigo-500/10"
                        >
                            <span className="material-icons-round text-sm group-hover:rotate-12 transition-transform">shield</span>
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none pt-0.5 hidden md:block">Super Console</span>
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32">
                {/* 1. AI 决策建议 (Linkage with Backend) */}
                <AiSummaryWidget />

                {/* 2. 实时财务指标 */}
                <FinanceWidget user={userRole} />

                {/* 3. 核心统计指标 (Stats Grid) */}
                <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div
                            onClick={() => navigate('/admin/orders')}
                            className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:-translate-y-1 transition-all group active:scale-95"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform">
                                    <span className="material-icons-round text-sm">receipt_long</span>
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today Orders</span>
                            </div>
                            <p className="text-4xl font-black text-slate-800 tracking-tighter">
                                {statsLoading ? '...' : stats?.total_orders || 0}
                            </p>
                        </div>

                        <div
                            onClick={() => navigate('/admin/users')}
                            className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:-translate-y-1 transition-all group active:scale-95"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform">
                                    <span className="material-icons-round text-sm">people</span>
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Users</span>
                            </div>
                            <p className="text-4xl font-black text-slate-800 tracking-tighter">
                                {statsLoading ? '...' : stats?.total_users || 0}
                            </p>
                        </div>
                    </div>

                    <div
                        onClick={() => navigate('/admin/finance')}
                        className="bg-slate-900 p-6 rounded-[2.5rem] border border-white/5 shadow-2xl hover:-translate-y-1 transition-all group active:scale-95 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-[0.05] text-white">
                            <span className="material-icons-round text-7xl">account_balance</span>
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                                    <span className="material-icons-round text-sm">payments</span>
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Revenue (MTD)</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-lg font-black text-indigo-400/80">RM</span>
                                <p className="text-5xl font-black text-white tracking-tighter font-mono-finance">
                                    {statsLoading ? '...' : Number(stats?.total_revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. 快捷功能面板 (Quick Actions) */}
                <div className="bg-white/60 backdrop-blur-md p-8 rounded-[2.5rem] border border-white shadow-xl shadow-indigo-500/5">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        核心快捷功能
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { icon: 'add_shopping_cart', label: '创建订单', color: 'bg-slate-50 text-slate-400 hover:text-primary hover:bg-primary/5', path: '/admin/create-order' },
                            { icon: 'local_shipping', label: '司机调度', color: 'bg-slate-50 text-slate-400 hover:text-blue-500 hover:bg-blue-50', path: '/admin/drivers' },
                            { icon: 'inventory_2', label: '商品管理', color: 'bg-slate-50 text-slate-400 hover:text-orange-500 hover:bg-orange-50', path: '/admin/products' },
                            { icon: 'settings_voice', label: '对讲机', color: 'bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105', path: '/admin/walkie-talkie' }
                        ].map((func, idx) => (
                            <button
                                key={idx}
                                onClick={() => navigate(func.path)}
                                className={`flex flex-col items-center justify-center p-6 rounded-3xl transition-all group active:scale-95 border border-transparent hover:border-white hover:shadow-2xl ${func.color}`}
                            >
                                <span className="material-icons-round text-3xl mb-3 transition-transform group-hover:scale-110">{func.icon}</span>
                                <span className="text-[10px] font-black tracking-widest uppercase">{func.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 5. 订单分布状态图 (Order Status Breakdown) */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none text-slate-400">
                        <span className="material-icons-round text-[120px]">donut_large</span>
                    </div>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3 relative z-10">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                            <span className="material-icons-round text-sm">analytics</span>
                        </div>
                        Orders by Status
                    </h3>
                    <div className="space-y-6 relative z-10">
                        {statsLoading ? (
                            <div className="space-y-6 animate-pulse">
                                {[1, 2, 3].map(i => <div key={i} className="h-4 w-full bg-slate-50 rounded-full"></div>)}
                            </div>
                        ) : Object.entries(stats?.orders_by_status || {}).map(([status, count]) => {
                            const total = stats?.total_orders || 1;
                            const pct = Math.round(((count as number) / total) * 100);
                            return (
                                <div key={status} className="flex items-center gap-4 group">
                                    <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest w-24 text-center ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[status] || status}
                                    </span>
                                    <div className="flex-1 h-2.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                        <div 
                                            className={`h-full progress-${status} rounded-full transition-all duration-1000 relative animate-shimmer`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-black text-slate-800 w-8 text-right font-mono">{count as React.ReactNode}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 6. 最新动态列表 (Recent Activity) */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                                <span className="material-icons-round text-sm">history</span>
                            </div>
                            Recent Activity
                        </h3>
                        <button 
                            onClick={() => navigate('/admin/orders')}
                            className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest"
                        >View All</button>
                    </div>
                    <div className="space-y-4">
                        {statsLoading ? (
                            <div className="space-y-4 animate-pulse">
                                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-50 rounded-2xl"></div>)}
                            </div>
                        ) : !stats?.recent_orders || stats.recent_orders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                                <span className="material-icons-round text-4xl mb-4">radar</span>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">暂无异常动态</p>
                            </div>
                        ) : (
                            stats.recent_orders.map(order => (
                                <div 
                                    key={order.id}
                                    onClick={() => navigate('/admin/orders')}
                                    className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer group active:scale-[0.98] border border-transparent hover:border-slate-100"
                                >
                                    <div className="flex items-center gap-4 min-w-0 pr-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                                            <span className="material-icons-round text-sm">local_mall</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-slate-800 truncate group-hover:text-primary transition-colors">{order.customerName}</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{order.id.slice(-8)} • RM {Number(order.amount).toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[order.status] || order.status}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;

