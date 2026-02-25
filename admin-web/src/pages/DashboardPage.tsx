import React, { useEffect, useState } from 'react';
import { SuperAdminService } from '../services/api';
import type { StatsOverview } from '../types';

export const DashboardPage: React.FC = () => {
    const [stats, setStats] = useState<StatsOverview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const data = await SuperAdminService.getStats();
                setStats(data);
            } catch (error) {
                console.error("Failed to fetch stats", error);
            } finally {
                setLoading(false);
            }
        };
        loadStats();
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
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-icons-round text-2xl">receipt_long</span>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Orders</p>
                        <p className="text-3xl font-black text-slate-800">{stats?.total_orders || 0}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                        <span className="material-icons-round text-2xl">payments</span>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Revenue</p>
                        <p className="text-3xl font-black text-green-600">
                            <span className="text-sm">RM</span> {(stats?.total_revenue || 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <span className="material-icons-round text-2xl">people</span>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Users</p>
                        <p className="text-3xl font-black text-blue-600">{stats?.total_users || 0}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="material-icons-round text-slate-400">pie_chart</span>
                        Orders by Status
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(stats?.orders_by_status || {}).map(([status, count]) => {
                            const total = stats?.total_orders || 1;
                            const pct = Math.round(((count as number) / total) * 100);
                            return (
                                <div key={status} className="flex items-center gap-4">
                                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold w-24 text-center ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[status] || status}
                                    </span>
                                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }}></div>
                                    </div>
                                    <span className="text-sm font-bold text-slate-600 w-12 text-right">{count as React.ReactNode}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="material-icons-round text-slate-400">schedule</span>
                        Recent Orders
                    </h3>
                    {stats?.recent_orders && stats.recent_orders.length > 0 ? (
                        <div className="space-y-3">
                            {stats.recent_orders.map(order => (
                                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{order.customerName}</p>
                                        <p className="text-xs text-slate-500 font-mono">{order.id} · {order.amount} RM</p>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                        {statusLabels[order.status] || order.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">No recent orders found.</p>
                    )}
                </div>
            </div>
        </div>
    );
};
