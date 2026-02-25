import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import type { Order, User } from '../types';

interface DriverWithOrders extends User {
    activeOrders: Order[];
}

export const DriversPage: React.FC = () => {
    const [drivers, setDrivers] = useState<DriverWithOrders[]>([]);
    const [loading, setLoading] = useState(true);

    const loadDriversAndOrders = useCallback(async () => {
        try {
            // Fetch all users with role 'driver'
            const usersResponse = await api.get('/super-admin/users');
            const allDrivers: User[] = usersResponse.data.filter((u: any) => u.role === 'driver');

            // Fetch active orders (delivering)
            const ordersResponse = await api.get('/orders?status=delivering');
            const activeOrders: Order[] = ordersResponse.data;

            // Map orders to drivers
            const mappedDrivers: DriverWithOrders[] = allDrivers.map(driver => ({
                ...driver,
                activeOrders: activeOrders.filter(o => o.driverId === driver.id)
            }));

            setDrivers(mappedDrivers);
        } catch (error) {
            console.error('Failed to load drivers data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        loadDriversAndOrders();

        const channel = supabase
            .channel('drivers-page-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    loadDriversAndOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadDriversAndOrders]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Drivers Management</h1>
                    <p className="text-slate-500 text-sm mt-1">Monitor driver status and active deliveries</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadDriversAndOrders} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <span className="material-icons-round text-[18px]">refresh</span>
                        Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8 gap-6">
                {drivers.length === 0 ? (
                    <div className="col-span-1 lg:col-span-2 bg-white p-12 rounded-[32px] border border-slate-100 flex flex-col items-center justify-center text-slate-400">
                        <span className="material-icons-round text-6xl mb-4 opacity-20">directions_bike</span>
                        <p className="text-sm font-bold uppercase tracking-widest">No drivers found</p>
                    </div>
                ) : (
                    drivers.map((driver) => {
                        const isDelivering = driver.activeOrders.length > 0;
                        return (
                            <div key={driver.id} className="bg-white rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-slate-100 overflow-hidden flex flex-col hover:-translate-y-1 transition-transform duration-300">
                                <div className="p-6 md:p-8 flex items-start justify-between border-b border-slate-50 relative overflow-hidden">
                                    <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-20 pointer-events-none ${isDelivering ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
                                    <div className="flex items-center gap-5 relative z-10">
                                        <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center border-2 border-white shadow-md overflow-hidden">
                                            {driver.avatar_url ? (
                                                <img src={driver.avatar_url} alt={driver.name || 'Driver'} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-icons-round text-3xl text-slate-400">directions_bike</span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-slate-800">{driver.name || 'Unnamed Driver'}</h3>
                                            <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                                                <span className="material-icons-round text-[14px]">phone</span>
                                                {driver.phone || 'No phone'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="relative z-10">
                                        {isDelivering ? (
                                            <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                                Delivering ({driver.activeOrders.length})
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                Idle
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 md:p-8 bg-slate-50/50 flex-1 flex flex-col">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Active Deliveries</h4>
                                    <div className="flex-1 space-y-3">
                                        {driver.activeOrders.length === 0 ? (
                                            <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                <span className="material-icons-round text-3xl mb-2">check_circle_outline</span>
                                                <p className="text-xs font-bold">No active orders</p>
                                            </div>
                                        ) : (
                                            driver.activeOrders.map(order => (
                                                <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                                    <div>
                                                        <p className="font-bold text-slate-800 text-sm">{order.customerName}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">{order.id}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-black text-slate-800">RM {order.amount.toFixed(2)}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold mt-0.5 max-w-[120px] truncate" title={order.address}>{order.address || 'No Address'}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
