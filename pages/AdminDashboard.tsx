import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderService } from '../src/services/api';
import { Order, OrderStatus } from '../types';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        try {
            const data = await OrderService.getAll();
            setOrders(data);
        } catch (error) {
            console.error("Dashboard data load failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const timer = setInterval(loadData, 10000);
        return () => clearInterval(timer);
    }, []);

    const stats = useMemo(() => {
        const today = new Date().toLocaleDateString();
        // For demo/simplicity, we consider all fetched orders as "Current"
        const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
        const latestOrders = [...orders].reverse().slice(0, 3);
        return {
            totalAmount,
            count: orders.length,
            latestOrders
        };
    }, [orders]);

    const statusLabels: Record<string, string> = {
        [OrderStatus.PENDING]: '待处理',
        [OrderStatus.PREPARING]: '准备中',
        [OrderStatus.READY]: '待取餐',
        [OrderStatus.DELIVERING]: '配送中',
        [OrderStatus.COMPLETED]: '已完成',
    };

    const statusColors: Record<string, string> = {
        [OrderStatus.PENDING]: 'text-slate-400',
        [OrderStatus.PREPARING]: 'text-blue-500',
        [OrderStatus.READY]: 'text-purple-500',
        [OrderStatus.DELIVERING]: 'text-yellow-600',
        [OrderStatus.COMPLETED]: 'text-green-500',
    };

    return (
        <div className="flex flex-col h-full bg-background-light">
            <header className="pt-12 pb-6 px-6 bg-white border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">管理员控制台</h1>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} (吉隆坡)</p>
                </div>
                <button
                    onClick={() => navigate('/admin/notifications')}
                    className="relative p-2 rounded-full bg-slate-50 border border-slate-100 active:scale-90 transition-transform"
                >
                    <span className="material-icons-round text-slate-600">notifications_none</span>
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full"></span>
                </button>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                    <div
                        onClick={() => navigate('/admin/orders')}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 h-24 flex flex-col justify-between cursor-pointer active:scale-95 transition-transform"
                    >
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">当日订单总数</p>
                        <div className="flex items-baseline justify-between">
                            <span className="text-3xl font-bold text-slate-900">{stats.count}</span>
                            <span className="text-[10px] text-green-500 font-bold">更新中</span>
                        </div>
                    </div>
                    <div
                        onClick={() => navigate('/admin/finance')}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 h-24 flex flex-col justify-between cursor-pointer active:scale-95 transition-transform"
                    >
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">累计营收</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xs font-bold text-primary/60">RM</span>
                            <span className="text-3xl font-bold text-primary">{stats.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">核心功能</h3>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { icon: 'list_alt', label: '订单管理', color: 'bg-primary/5 text-primary', path: '/admin/orders' },
                            { icon: 'inventory_2', label: '商品管理', color: 'bg-orange-50 text-orange-600', path: '/admin/products' },
                            { icon: 'local_shipping', label: '司机调度', color: 'bg-blue-50 text-blue-600', path: '/admin/drivers' },
                            { icon: 'kitchen', label: '后厨汇总', color: 'bg-green-50 text-green-600', path: '/admin/kitchen-summary' }
                        ].map((func, idx) => (
                            <button
                                key={idx}
                                onClick={() => navigate(func.path)}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90 ${func.color}`}>
                                    <span className="material-icons-round">{func.icon}</span>
                                </div>
                                <span className="text-[10px] font-medium text-slate-600">{func.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                    <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">最新订单</h3>
                        <button
                            onClick={() => navigate('/admin/orders')}
                            className="text-[10px] text-primary font-bold active:opacity-60"
                        >查看全部</button>
                    </div>
                    <div className="p-4 space-y-4">
                        {isLoading ? (
                            <p className="text-center text-[10px] text-slate-300">加载中...</p>
                        ) : stats.latestOrders.length === 0 ? (
                            <p className="text-center text-[10px] text-slate-300">暂无订单</p>
                        ) : (
                            stats.latestOrders.map(order => (
                                <div
                                    key={order.id}
                                    onClick={() => navigate('/admin/orders')}
                                    className="flex items-center gap-3 cursor-pointer active:bg-slate-50 rounded-lg transition-colors p-1"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                        <span className="material-icons-round text-slate-400 text-sm">receipt</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <h4 className="text-xs font-bold text-slate-900">{order.customerName}</h4>
                                            <span className={`text-[10px] font-bold ${statusColors[order.status]}`}>
                                                {statusLabels[order.status]}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 truncate">
                                            {order.items.map(i => `${i.name} x${i.quantity}`).join(', ')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div
                    onClick={() => navigate('/admin/create-order')}
                    className="bg-slate-900 rounded-2xl p-4 flex items-center justify-between text-white cursor-pointer hover:bg-slate-800 transition-all group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10">
                            <span className="material-icons-round">add_shopping_cart</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-sm">创建新订单</h3>
                            <p className="text-[10px] text-slate-400">指派司机并管理物流</p>
                        </div>
                    </div>
                    <span className="material-icons-round text-slate-400 group-hover:translate-x-1 transition-transform">chevron_right</span>
                </div>
            </main>
        </div >
    );
};

export default AdminDashboard;
