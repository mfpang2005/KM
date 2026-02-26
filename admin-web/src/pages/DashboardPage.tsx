import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SuperAdminService } from '../services/api';
import type { StatsOverview } from '../types';

export const DashboardPage: React.FC = () => {
    const [stats, setStats] = useState<StatsOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const loadStats = async (showLoading = true) => {
            if (showLoading) setLoading(true);
            try {
                const data = await SuperAdminService.getStats();
                setStats(data);
            } catch (error) {
                console.error("Failed to fetch stats", error);
            } finally {
                if (showLoading) setLoading(false);
            }
        };
        loadStats(true);
        const timer = setInterval(() => loadStats(false), 5000);
        return () => clearInterval(timer);
    }, []);

    const statusLabels: Record<string, string> = {
        pending: 'Pending',
        preparing: 'Preparing',
        ready: 'Ready',
        delivering: 'Delivering',
        completed: 'Completed',
    };

    const statusColors: Record<string, string> = {
        pending: 'bg-slate-100 text-slate-600',
        preparing: 'bg-blue-50 text-blue-600',
        ready: 'bg-purple-50 text-purple-600',
        delivering: 'bg-amber-50 text-amber-600',
        completed: 'bg-green-50 text-green-600',
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 flex items-center gap-6 hover:-translate-y-1 transition-all duration-300 group cursor-default">
                    <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-red-500/20 overflow-hidden group-hover:scale-110 transition-transform duration-300">
                        <span className="material-icons-round text-3xl max-w-full truncate">receipt_long</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-1 truncate">Total Orders</p>
                        <p className="text-3xl md:text-4xl font-black text-slate-800 tracking-tighter truncate">{stats?.total_orders || 0}</p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 flex items-center gap-6 hover:-translate-y-1 transition-all duration-300 group cursor-default">
                    <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 overflow-hidden group-hover:scale-110 transition-transform duration-300">
                        <span className="material-icons-round text-3xl max-w-full truncate">payments</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-1 truncate">Total Revenue</p>
                        <p className="text-3xl md:text-4xl font-black text-orange-500 tracking-tighter truncate">
                            <span className="text-sm md:text-lg text-orange-400/80 mr-1">RM</span>
                            {(stats?.total_revenue || 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 flex items-center gap-6 hover:-translate-y-1 transition-all duration-300 group cursor-default">
                    <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 overflow-hidden group-hover:scale-110 transition-transform duration-300">
                        <span className="material-icons-round text-3xl max-w-full truncate">people</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-slate-400 font-extrabold uppercase tracking-[0.2em] mb-1 truncate">Total Users</p>
                        <p className="text-3xl md:text-4xl font-black text-rose-600 tracking-tighter truncate">{stats?.total_users || 0}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 relative overflow-hidden">
                <h3 className="text-base font-black text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-red-100 text-red-500 flex items-center justify-center overflow-hidden">
                        <span className="material-icons-round">bolt</span>
                    </div>
                    <span className="truncate">Quick Actions</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                    <button
                        onClick={() => navigate('/create-order')}
                        className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-red-50 hover:border-red-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10 transition-all group"
                    >
                        <span className="material-icons-round text-3xl text-slate-400 group-hover:text-red-500 mb-3 transition-colors">add_shopping_cart</span>
                        <span className="text-sm font-black text-slate-700 group-hover:text-red-600">Create Order</span>
                    </button>
                    <button
                        onClick={() => navigate('/drivers')}
                        className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-red-50 hover:border-red-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10 transition-all group"
                    >
                        <span className="material-icons-round text-3xl text-slate-400 group-hover:text-red-500 mb-3 transition-colors">local_shipping</span>
                        <span className="text-sm font-black text-slate-700 group-hover:text-red-600">Assign Driver</span>
                    </button>
                    <button
                        onClick={() => navigate('/products')}
                        className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-red-50 hover:border-red-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10 transition-all group"
                    >
                        <span className="material-icons-round text-3xl text-slate-400 group-hover:text-red-500 mb-3 transition-colors">inventory_2</span>
                        <span className="text-sm font-black text-slate-700 group-hover:text-red-600">Manage Products</span>
                    </button>
                    <button
                        onClick={() => navigate('/walkie-talkie')}
                        className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-2xl hover:-translate-y-1 hover:shadow-[0_15px_30px_rgba(220,38,38,0.3)] transition-all group"
                    >
                        <span className="material-icons-round text-3xl mb-3 drop-shadow-md">settings_voice</span>
                        <span className="text-sm font-black drop-shadow-md">Walkie-Talkie</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 md:p-8 rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none text-red-500">
                        <span className="material-icons-round text-[180px] leading-none">pie_chart</span>
                    </div>
                    <h3 className="text-sm md:text-base font-black text-slate-800 mb-8 flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-red-100 text-red-500 flex items-center justify-center overflow-hidden">
                            <span className="material-icons-round">analytics</span>
                        </div>
                        <span className="truncate">Orders by Status</span>
                    </h3>
                    <div className="space-y-5 relative z-10">
                        {Object.entries(stats?.orders_by_status || {}).map(([status, count]) => {
                            const total = stats?.total_orders || 1;
                            const pct = Math.round(((count as number) / total) * 100);
                            return (
                                <div key={status} className="flex items-center gap-5 group">
                                    <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider w-28 text-center transition-transform group-hover:scale-105 ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[status] || status}
                                    </span>
                                    <div className="flex-1 h-4 bg-slate-50 border border-slate-100 rounded-full overflow-hidden shadow-inner">
                                        <div className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all duration-1000 ease-out relative overflow-hidden" style={{ width: `${pct}%` }}>
                                            <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                        </div>
                                    </div>
                                    <span className="text-base font-black text-slate-700 w-12 text-right">{count as React.ReactNode}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white p-6 md:p-8 rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] select-none pointer-events-none text-red-500">
                        <span className="material-icons-round text-[180px] leading-none">schedule</span>
                    </div>
                    <h3 className="text-sm md:text-base font-black text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-100 text-orange-500 flex items-center justify-center overflow-hidden">
                            <span className="material-icons-round">schedule</span>
                        </div>
                        <span className="truncate">Recent Activity</span>
                    </h3>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 no-scrollbar relative z-10">
                        {stats?.recent_orders && stats.recent_orders.length > 0 ? (
                            stats.recent_orders.map(order => (
                                <div key={order.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-red-50/50 hover:shadow-lg hover:shadow-red-500/5 border border-transparent hover:border-red-100 transition-all cursor-default active:scale-[0.98]">
                                    <div className="flex items-center gap-4 min-w-0 pr-2">
                                        <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 overflow-hidden">
                                            <span className="material-icons-round text-lg group-hover:text-red-400 transition-colors">local_mall</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs md:text-sm font-black text-slate-800 truncate">{order.customerName}</p>
                                            <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 truncate">{order.id} • RM {order.amount.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 px-3 py-1.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[order.status] || order.status}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                <span className="material-icons-round text-6xl mb-4 opacity-50">hourglass_empty</span>
                                <p className="text-sm font-bold uppercase tracking-widest">No recent orders found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
