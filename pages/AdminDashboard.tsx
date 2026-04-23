import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { OrderStatus, UserRole } from '../types';
import FinanceWidget from '../src/components/FinanceWidget';
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
        [OrderStatus.PREPARING]: 'KITCHEN PROCESS',
        [OrderStatus.READY]: 'DISTRIBUTION',
        [OrderStatus.DELIVERING]: 'DELIVERING',
        [OrderStatus.COMPLETED]: 'COMPLETED',
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
        <div className="flex flex-col h-full bg-background-beige">
            {/* 顶部导航栏 - System Overview Mode */}
            <header className="pt-12 pb-8 px-6 bg-white/40 backdrop-blur-3xl border-b border-primary/5 sticky top-0 z-30">
                <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20 mb-1">
                        <span className="material-icons-round text-3xl">dashboard</span>
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-black text-primary tracking-tight italic uppercase">Kim Long System Overview</h1>
                        <p className="text-[10px] text-primary-light/40 font-black uppercase tracking-[0.4em] mt-1">Administrative Intelligence</p>
                    </div>
                </div>
                
                {/* 浮动操作按钮 - 保持功能但不破坏居中感 */}
                <div className="absolute top-12 right-6 flex items-center gap-2">
                    <button
                        onClick={() => refresh()}
                        className="p-3 bg-white/60 border border-primary/5 rounded-2xl text-primary-light hover:text-primary transition-all active:scale-90"
                        title="Manual Refresh"
                    >
                        <span className="material-icons-round text-xl">autorenew</span>
                    </button>
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

            <main className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32">

                {/* 2. 实时财务指标 */}
                <FinanceWidget user={userRole} />

                {/* 3. 核心统计指标 (Stats Grid) - 同步后台逻辑 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div
                            onClick={() => navigate('/admin/orders')}
                            className="bg-white p-5 rounded-3xl border border-primary/5 shadow-xl shadow-primary/5 hover:-translate-y-1 transition-all group active:scale-95 flex flex-col items-center text-center"
                        >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-warm text-white flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform mb-3">
                                <span className="material-icons-round text-sm">receipt_long</span>
                            </div>
                            <span className="text-[10px] font-black text-primary-light/40 uppercase tracking-widest mb-2">Today Orders</span>
                            <p className="text-3xl font-black text-primary tracking-tighter">
                                {statsLoading ? '...' : stats?.today_orders || 0}
                            </p>
                        </div>

                        <div
                            onClick={() => navigate('/admin/finance')}
                            className="bg-white p-5 rounded-3xl border border-primary/5 shadow-xl shadow-primary/5 hover:-translate-y-1 transition-all group active:scale-95 flex flex-col items-center text-center"
                        >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-gold to-orange-400 text-white flex items-center justify-center shadow-lg shadow-accent-gold/20 group-hover:scale-110 transition-transform mb-3">
                                <span className="material-icons-round text-sm">payments</span>
                            </div>
                            <span className="text-[10px] font-black text-primary-light/40 uppercase tracking-widest mb-2">Monthly Revenue</span>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-xs font-bold text-accent-gold">RM</span>
                                <p className="text-2xl font-black text-primary tracking-tighter">
                                    {statsLoading ? '...' : Number(stats?.month_revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        onClick={() => navigate('/admin/finance')}
                        className="bg-white p-6 rounded-3xl border border-primary/5 shadow-xl shadow-primary/5 hover:-translate-y-1 transition-all group active:scale-95 relative overflow-hidden flex flex-col items-center text-center"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-[0.05] text-primary">
                            <span className="material-icons-round text-7xl">account_balance_wallet</span>
                        </div>
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-warm to-primary-light text-white flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform mb-3">
                                <span className="material-icons-round text-sm">pending_actions</span>
                            </div>
                            <span className="text-[10px] font-black text-primary-light/40 uppercase tracking-widest mb-2">Total Unpaid</span>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-xs font-bold text-primary-warm">RM</span>
                                <p className="text-4xl font-black text-primary tracking-tighter">
                                    {statsLoading ? '...' : Number(stats?.total_unpaid || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. 快捷功能面板 (Quick Actions) - 同步后台设置 */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-primary/5 shadow-xl shadow-primary/5 relative overflow-hidden">
                    <h3 className="text-[10px] font-black text-primary-light/40 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/5 text-primary flex items-center justify-center shadow-inner">
                            <span className="material-icons-round text-sm">bolt</span>
                        </div>
                        Quick Actions
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { icon: 'add_shopping_cart', label: 'Create Order', color: 'bg-primary/5 text-primary-light hover:text-primary hover:bg-primary/10', path: '/admin/create-order' },
                            { icon: 'local_shipping', label: 'Assign Driver', color: 'bg-primary/5 text-primary-light hover:text-primary hover:bg-primary/10', path: '/admin/drivers' },
                            { icon: 'inventory_2', label: 'Manage Products', color: 'bg-primary/5 text-primary-light hover:text-primary hover:bg-primary/10', path: '/admin/products' },
                            { icon: 'settings_voice', label: 'Walkie-Talkie', color: 'bg-gradient-to-br from-primary to-primary-warm text-white shadow-lg shadow-primary/20 hover:scale-105', path: '/admin/walkie-talkie' }
                        ].map((func, idx) => (
                            <button
                                key={idx}
                                onClick={() => navigate(func.path)}
                                className={`flex flex-col items-center justify-center p-6 rounded-3xl transition-all group active:scale-95 border border-transparent ${func.color}`}
                            >
                                <span className={`material-icons-round text-3xl mb-3 transition-transform group-hover:scale-110 ${!func.color.includes('gradient') ? 'text-primary-light/40 group-hover:text-primary' : ''}`}>{func.icon}</span>
                                <span className="text-[10px] font-black tracking-widest uppercase">{func.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 5. 订单分布状态图 (Order Status Breakdown) - 同步后台渐变条 */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-primary/5 shadow-xl shadow-primary/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none text-primary">
                        <span className="material-icons-round text-[120px]">donut_large</span>
                    </div>
                    <h3 className="text-[10px] font-black text-primary-light/40 uppercase tracking-[0.3em] mb-8 flex items-center gap-3 relative z-10">
                        <div className="w-8 h-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
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
                                <div key={status} className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50/50 p-2 -m-2 rounded-2xl transition-all">
                                    <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest min-w-[80px] whitespace-nowrap text-center transition-transform group-hover:scale-105 ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[status] || status}
                                    </span>
                                    <div className="flex-1 h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                                        <div 
                                            className={`h-full progress-${status} rounded-full transition-all duration-1000 relative overflow-hidden`}
                                            style={{ width: `${pct}%` }}
                                        >
                                            <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black text-slate-800 w-8 text-right font-mono group-hover:text-red-500 transition-colors">{count as React.ReactNode}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 6. 最新动态列表 (Recent Activity) - 同步后台简约列表 */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-primary/5 shadow-xl shadow-primary/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.02] select-none pointer-events-none text-primary">
                        <span className="material-icons-round text-[120px]">schedule</span>
                    </div>
                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <h3 className="text-[10px] font-black text-primary-light/40 uppercase tracking-[0.3em] flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-accent-gold/10 flex items-center justify-center text-accent-gold shadow-inner">
                                <span className="material-icons-round text-sm">schedule</span>
                            </div>
                            Recent Activity
                        </h3>
                        <button 
                            onClick={() => navigate('/admin/orders')}
                            className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest"
                        >View All</button>
                    </div>
                    <div className="space-y-4 relative z-10">
                        {statsLoading ? (
                            <div className="space-y-4 animate-pulse">
                                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-50 rounded-2xl"></div>)}
                            </div>
                        ) : !stats?.recent_orders || stats.recent_orders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                                <div className="w-20 h-20 rounded-full border border-slate-100 flex items-center justify-center animate-pulse mb-4">
                                     <span className="material-icons-round text-3xl opacity-20">radar</span>
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">系统监控中：暂无异常动态</p>
                            </div>
                        ) : (
                            stats.recent_orders.map(order => (
                                <div 
                                    key={order.id}
                                    onClick={() => navigate('/admin/orders')}
                                    className="flex items-center justify-between p-4 rounded-2xl hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all cursor-pointer group active:scale-[0.98] border border-transparent hover:border-slate-100"
                                >
                                    <div className="flex items-center gap-4 min-w-0 pr-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-red-50 group-hover:text-red-500 border border-slate-100 transition-all">
                                            <span className="material-icons-round text-sm">local_mall</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-slate-800 truncate group-hover:text-red-600 transition-colors uppercaseTracking-widest">{order.customerName}</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 truncate">{order.id} • <span className="text-slate-600 font-black font-mono">RM {Number(order.amount).toFixed(2)}</span></p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
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

