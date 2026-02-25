import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Order } from '../types';
import { OrderStatus } from '../types';

export const OrdersPage: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const loadOrders = useCallback(async () => {
        try {
            // 这里为了简化，我们直接获取 global orders。可以使用 '/super-admin/orders'
            const response = await api.get(`/super-admin/orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`);
            setOrders(response.data);
        } catch (error) {
            console.error('Failed to load orders', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        setLoading(true);
        loadOrders();
    }, [loadOrders]);

    const handleApprove = async (orderId: string) => {
        try {
            await api.patch(`/super-admin/orders/${orderId}/approve`);
            await loadOrders();
        } catch (error) {
            console.error('Failed to approve order', error);
            alert('Approval failed.');
        }
    };

    const handleRejectDelete = async (orderId: string) => {
        if (!window.confirm(`Delete order ${orderId}?`)) return;
        try {
            await api.delete(`/orders/${orderId}`);
            await loadOrders();
        } catch (error) {
            console.error('Failed to delete order', error);
        }
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'bg-slate-100 text-slate-700',
        [OrderStatus.PREPARING]: 'bg-blue-100 text-blue-700',
        [OrderStatus.READY]: 'bg-purple-100 text-purple-700',
        [OrderStatus.DELIVERING]: 'bg-amber-100 text-amber-700',
        [OrderStatus.COMPLETED]: 'bg-green-100 text-green-700',
    };

    const filteredOrders = orders.filter(o =>
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerPhone.includes(searchQuery)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-xl font-bold text-slate-800">Global Orders</h1>

                <div className="flex items-center gap-3">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                    >
                        <option value="all">All Status</option>
                        <option value={OrderStatus.PENDING}>Pending</option>
                        <option value={OrderStatus.PREPARING}>Preparing</option>
                        <option value={OrderStatus.READY}>Ready</option>
                        <option value={OrderStatus.DELIVERING}>Delivering</option>
                        <option value={OrderStatus.COMPLETED}>Completed</option>
                    </select>

                    <div className="relative w-64">
                        <span className="material-icons-round absolute left-3 top-2.5 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Search orders..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="px-6 py-4">Order ID</th>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Total Amount</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                </td>
                            </tr>
                        ) : filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">No matching orders found.</td>
                            </tr>
                        ) : (
                            filteredOrders.map(order => (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-mono font-bold text-slate-800">{order.id}</p>
                                        <p className="text-xs text-slate-500 uppercase">{order.type}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-800">{order.customerName}</p>
                                        <p className="text-xs text-slate-500">{order.customerPhone}</p>
                                    </td>
                                    <td className="px-6 py-4 font-black text-slate-800">
                                        <span className="text-xs font-bold text-slate-400">RM</span> {order.amount.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusColors[order.status] || 'bg-slate-100 text-slate-600'}`}>
                                            {order.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500">
                                        {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        {order.status === OrderStatus.PENDING && (
                                            <button
                                                onClick={() => handleApprove(order.id)}
                                                className="px-3 py-1.5 bg-primary text-white rounded-lg font-bold text-xs hover:bg-blue-800 transition-colors"
                                            >
                                                Approve
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleRejectDelete(order.id)}
                                            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg font-bold text-xs hover:bg-red-100 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
