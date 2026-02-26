import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import { OrderStatus } from '../types';
import type { Order, User, Vehicle, DriverAssignment } from '../types';
import { VehicleService } from '../services/api';

interface DriverWithOrders extends User {
    activeOrders: Order[];
    completedToday: number;
    fleetStatus: 'Available' | 'On Duty' | 'Offline';
    currentVehicle?: Vehicle | null;
}

export const DriversPage: React.FC = () => {
    const [drivers, setDrivers] = useState<DriverWithOrders[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'All' | 'Available' | 'On Duty'>('All');
    const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);

    // Edit Driver State
    const [editingDriver, setEditingDriver] = useState<DriverWithOrders | null>(null);
    const [editForm, setEditForm] = useState<Partial<User>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Vehicle Assignment State
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [assigningVehicleToDriver, setAssigningVehicleToDriver] = useState<DriverWithOrders | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [usersRes, ordersRes, vehiclesData, assignmentsRes] = await Promise.all([
                api.get('/super-admin/users'),
                api.get('/orders'),
                VehicleService.getAll(),
                supabase.from('driver_assignments').select('*').eq('status', 'active')
            ]);

            const allDrivers: User[] = usersRes.data.filter((u: any) => u.role === 'driver');
            const allOrders: Order[] = ordersRes.data;
            const allVehicles: Vehicle[] = vehiclesData;
            const activeAssignments: DriverAssignment[] = assignmentsRes.data || [];

            setOrders(allOrders);
            setVehicles(allVehicles);

            const mappedDrivers: DriverWithOrders[] = allDrivers.map(driver => {
                const driverOrders = allOrders.filter(o => o.driverId === driver.id);
                // Active orders: delivering or ready
                const activeOrders = driverOrders.filter(o => o.status === OrderStatus.DELIVERING || o.status === OrderStatus.READY);

                // Roughly check completed today
                const today = new Date().toISOString().split('T')[0];
                const completedToday = driverOrders.filter(o =>
                    o.status === OrderStatus.COMPLETED &&
                    o.created_at?.startsWith(today)
                ).length;

                let fleetStatus: 'Available' | 'On Duty' | 'Offline' = 'Offline';
                if (!driver.is_disabled) {
                    fleetStatus = activeOrders.length > 0 ? 'On Duty' : 'Available';
                }

                // 关联当前派发的车辆
                const assignment = activeAssignments.find(a => a.driver_id === driver.id);
                const currentVehicle = assignment ? allVehicles.find(v => v.id === assignment.vehicle_id) : null;

                return {
                    ...driver,
                    activeOrders,
                    completedToday,
                    fleetStatus,
                    currentVehicle
                };
            });

            setDrivers(mappedDrivers);
        } catch (error) {
            console.error('Failed to load drivers data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        loadData();

        const channel = supabase
            .channel('drivers-page-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => loadData()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'driver_assignments' },
                () => loadData()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadData]);

    const handleAssignVehicle = async (vehicleId: string) => {
        if (!assigningVehicleToDriver) return;
        setIsAssigning(true);
        try {
            await VehicleService.assignToDriver(assigningVehicleToDriver.id, vehicleId);
            setAssigningVehicleToDriver(null);
            loadData();
        } catch (e: any) {
            console.error('Failed to assign vehicle', e);
            alert(`指派失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigning(false);
        }
    };

    const handleUnassignVehicle = async (driverId: string) => {
        if (!window.confirm('确认解除该司机的车辆绑定？')) return;
        try {
            await VehicleService.unassignDriver(driverId);
            loadData();
        } catch (e) {
            console.error('Failed to unassign', e);
        }
    };


    const pendingOrders = useMemo(() => {
        return orders.filter(o =>
            (o.status === OrderStatus.PENDING || o.status === OrderStatus.PREPARING || o.status === OrderStatus.READY) &&
            !o.driverId &&
            o.type === 'delivery'
        );
    }, [orders]);

    const filteredDrivers = useMemo(() => {
        if (filter === 'All') return drivers;
        return drivers.filter(d => d.fleetStatus === filter);
    }, [drivers, filter]);

    const handleAssign = async (driverId: string) => {
        if (!assigningOrder) return;

        // Prevent assignment if vehicle is not in idle status
        const driver = drivers.find(d => d.id === driverId);
        if (driver?.vehicle_status === 'maintenance' || driver?.vehicle_status === 'occupied') {
            alert(`This vehicle is currently marked as ${driver.vehicle_status}. Please wait or reassign.`);
            return;
        }

        try {
            await api.patch(`/orders/${assigningOrder.id}`, {
                driverId: driverId,
                status: OrderStatus.READY
            });
            setAssigningOrder(null);
            loadData();
        } catch (e) {
            console.error("Failed to assign order", e);
        }
    };

    const handleReassign = async (orderId: string) => {
        if (window.confirm('Are you sure you want to recall this order? It will return to the Pending dispatch queue.')) {
            try {
                await api.patch(`/orders/${orderId}`, {
                    driverId: null,
                    status: OrderStatus.PREPARING
                });
                loadData();
            } catch (e) {
                console.error("Failed to recall", e);
            }
        }
    };

    const handleWhatsApp = (driver: DriverWithOrders) => {
        const phone = driver.phone || '';
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone) {
            alert('This driver does not have a valid phone number.');
            return;
        }

        const currentOrder = driver.activeOrders[0];
        const message = currentOrder
            ? `[金龙餐饮调度 / Central Dispatch] 你好 ${driver.name}, 请确认订单 ${currentOrder.id} (${currentOrder.customerName}) 的配送进度，预计几点到达？`
            : `[金龙餐饮调度 / Central Dispatch] 你好 ${driver.name}, 有新的配送任务准备指派，请回复确认当前位置。`;

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleEditClick = (driver: DriverWithOrders) => {
        setEditingDriver(driver);
        setEditForm({
            name: driver.name || '',
            phone: driver.phone || '',
            vehicle_model: driver.vehicle_model || '',
            vehicle_plate: driver.vehicle_plate || '',
            vehicle_type: driver.vehicle_type || '',
            vehicle_status: driver.vehicle_status || 'idle'
        });
    };

    const handleSaveEdit = async () => {
        if (!editingDriver) return;
        setIsSaving(true);
        try {
            await api.patch(`/super-admin/users/${editingDriver.id}`, editForm);
            setEditingDriver(null);
            loadData();
        } catch (error) {
            console.error('Failed to update driver details', error);
            alert('Failed to update driver profile.');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-32">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Drivers Management / 调度中心</h1>
                    <p className="text-slate-500 text-sm mt-1">Realtime Fleet Tracking & Dispatch Control</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {(['All', 'Available', 'On Duty'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setFilter(t)}
                                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${filter === t ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* Pending Orders Queue (Dispatch Console) */}
            <section className="space-y-3 bg-red-50/50 p-6 rounded-[32px] border border-red-100/50">
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                        <span className="material-icons-round text-[16px]">pending_actions</span>
                        Pending Dispatch ({pendingOrders.length})
                    </h2>
                    {pendingOrders.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>}
                </div>
                {pendingOrders.length > 0 ? (
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x">
                        {pendingOrders.map(order => (
                            <div key={order.id} className="min-w-[280px] snap-start bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] font-black text-primary uppercase mb-1 tracking-widest">Order: {order.id.slice(0, 8)}</p>
                                        <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{order.customerName}</h3>
                                    </div>
                                    <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{order.dueTime}</span>
                                </div>
                                <div className="flex items-start gap-1.5 opacity-60">
                                    <span className="material-icons-round text-[14px] mt-0.5">location_on</span>
                                    <p className="text-xs line-clamp-2 leading-tight font-medium text-slate-600">{order.address}</p>
                                </div>
                                <button
                                    onClick={() => setAssigningOrder(order)}
                                    className={`w-full py-2.5 rounded-xl text-xs font-black uppercase transition-transform active:scale-95 mt-auto ${assigningOrder?.id === order.id ? 'bg-slate-900 text-white shadow-lg' : 'bg-red-50 hover:bg-red-100 text-red-600'}`}
                                >
                                    {assigningOrder?.id === order.id ? 'Select Driver Below 👇' : 'Assign / 指派'}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-8 bg-white/50 rounded-2xl border border-red-100/50 border-dashed">
                        <span className="material-icons-round text-4xl text-red-300 mb-2">dashboard_customize</span>
                        <p className="text-sm font-bold text-red-400 uppercase tracking-widest">No pending deliveries</p>
                        <p className="text-xs text-red-300 mt-1">New delivery orders will appear here for dispatch</p>
                    </div>
                )}
            </section>

            {/* Drivers List */}
            <section className="space-y-3">
                <div className="px-2">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Fleet Status / 车队状态</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8 gap-6">
                    {filteredDrivers.length === 0 ? (
                        <div className="col-span-1 lg:col-span-2 bg-white p-12 rounded-[32px] border border-slate-100 flex flex-col items-center justify-center text-slate-400 animate-in fade-in">
                            <span className="material-icons-round text-6xl mb-4 opacity-20">directions_bike</span>
                            <p className="text-sm font-bold uppercase tracking-widest">No drivers in this view</p>
                        </div>
                    ) : (
                        filteredDrivers.map((driver) => {
                            const isBusy = driver.fleetStatus === 'On Duty';
                            const isOffline = driver.fleetStatus === 'Offline';

                            return (
                                <div key={driver.id} className={`bg-white rounded-[32px] border transition-all duration-300 flex flex-col sm:overflow-hidden ${assigningOrder && !isOffline ? 'ring-2 ring-primary ring-offset-4 shadow-xl' : 'border-slate-100 shadow-sm hover:-translate-y-1 hover:shadow-md'}`}>
                                    <div className="p-6 md:p-8 flex flex-col sm:flex-row gap-5 relative group">
                                        <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditClick(driver)}
                                                className="w-10 h-10 bg-white/80 backdrop-blur shadow-sm border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center transition-colors">
                                                <span className="material-icons-round text-[18px]">edit</span>
                                            </button>
                                        </div>

                                        <div className="flex-1 min-w-0 flex items-start gap-5">
                                            <div className="relative shrink-0">
                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center border-2 border-slate-50 shadow-inner overflow-hidden">
                                                    {driver.avatar_url ? (
                                                        <img src={driver.avatar_url} alt={driver.name || 'Driver'} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="material-icons-round text-3xl text-slate-400">directions_bike</span>
                                                    )}
                                                </div>
                                                <div className={`absolute -bottom-2 -right-2 w-7 h-7 rounded-xl border-4 border-white shadow-sm flex items-center justify-center ${isBusy ? 'bg-orange-500' : isOffline ? 'bg-slate-300' : 'bg-green-500'
                                                    }`}>
                                                    <span className="material-icons-round text-white text-[14px]">
                                                        {isBusy ? 'local_shipping' : isOffline ? 'power_settings_new' : 'check'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between pr-8">
                                                    <h3 className="text-lg font-black text-slate-800 truncate">{driver.name || 'Unnamed Driver'}</h3>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase shrink-0 ml-2">Today: <span className="text-primary">{driver.completedToday}</span> Done</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">
                                                        {driver.currentVehicle ? `${driver.currentVehicle.plate_no} (${driver.currentVehicle.model || 'Unknown'})` : 'No Vehicle Assigned'}
                                                    </p>
                                                    {driver.currentVehicle ? (
                                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-green-100 text-green-700 cursor-pointer hover:bg-red-100 hover:text-red-700 transition-colors`} onClick={() => handleUnassignVehicle(driver.id)} title="点击解绑">
                                                            已绑定 [解绑]
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setAssigningVehicleToDriver(driver); }}
                                                            className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors`}>
                                                            安排车辆
                                                        </button>
                                                    )}
                                                </div>

                                                {!isBusy && !isOffline && (
                                                    <div className="mt-3 flex items-center gap-1.5 bg-green-50 w-max px-3 py-1 rounded-lg">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                        <span className="text-[10px] font-black text-green-600 uppercase">Available / 司机空闲待命</span>
                                                    </div>
                                                )}
                                                {isOffline && (
                                                    <div className="mt-3 flex items-center gap-1.5 bg-slate-50 w-max px-3 py-1 rounded-lg">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                        <span className="text-[10px] font-black text-slate-500 uppercase">Offline / 司机离线</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex sm:flex-col gap-2 shrink-0 mt-4 sm:mt-0 items-end justify-center">
                                            {assigningOrder ? (
                                                <button
                                                    disabled={isOffline || driver.vehicle_status === 'maintenance' || driver.vehicle_status === 'occupied'}
                                                    onClick={() => handleAssign(driver.id)}
                                                    className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-md active:scale-95 ${isOffline || driver.vehicle_status === 'maintenance' || driver.vehicle_status === 'occupied' ? 'bg-slate-100 text-slate-400 cursor-not-allowed hidden' : 'bg-slate-900 text-white hover:bg-slate-800 w-full h-full'
                                                        }`}
                                                >
                                                    Dispatch<br />To Driver
                                                </button>
                                            ) : (
                                                <div className="flex gap-2 w-full justify-end">
                                                    <button onClick={() => window.location.href = `tel:${driver.phone}`} className="w-10 h-10 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-[14px] flex items-center justify-center transition-colors">
                                                        <span className="material-icons-round text-[18px]">phone</span>
                                                    </button>
                                                    <button onClick={() => handleWhatsApp(driver)} className="w-10 h-10 bg-green-50 hover:bg-green-100 text-green-600 rounded-[14px] flex items-center justify-center transition-colors">
                                                        <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" className="w-[18px] h-[18px] opacity-80" alt="WA" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {isBusy && (
                                        <div className="bg-slate-50/80 p-5 md:p-6 flex-1 border-t border-slate-100">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <span className="material-icons-round text-[14px] text-orange-400">route</span>
                                                Active Deliveries ({driver.activeOrders.length})
                                            </h4>
                                            <div className="space-y-3">
                                                {driver.activeOrders.map(order => (
                                                    <div key={order.id} className="bg-white p-4 rounded-2xl border border-orange-100/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase">{order.status === OrderStatus.DELIVERING ? 'On Route' : 'Preparing'}</span>
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase">ID: {order.id.slice(0, 8)}</span>
                                                            </div>
                                                            <p className="font-bold text-slate-800 text-sm mb-1">{order.customerName}</p>
                                                            <div className="flex items-start gap-1">
                                                                <span className="material-icons-round text-[12px] text-slate-400 mt-0.5">place</span>
                                                                <p className="text-[11px] font-medium text-slate-500 line-clamp-2">{order.address}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-row md:flex-col gap-2 shrink-0">
                                                            <a
                                                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase hover:bg-blue-100 transition-colors"
                                                            >
                                                                <span className="material-icons-round text-[14px]">navigation</span> Map
                                                            </a>
                                                            <button
                                                                onClick={() => handleReassign(order.id)}
                                                                className="flex-1 md:flex-none px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-colors"
                                                            >
                                                                Recall / 退回
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            {/* Edit Driver & Vehicle Modal */}
            {editingDriver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <h2 className="text-lg font-bold text-slate-800">Edit Profile & Vehicle</h2>
                            <button
                                onClick={() => setEditingDriver(null)}
                                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"
                            >
                                <span className="material-icons-round text-[18px]">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto no-scrollbar space-y-6">
                            {/* Personal Details */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="material-icons-round text-[14px]">person</span> Driver Details
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 ml-1">Driver Name</label>
                                        <input
                                            type="text"
                                            value={editForm.name || ''}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-sm font-medium transition-all"
                                            placeholder="e.g. Ali Bin Abu"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 ml-1">Phone Number</label>
                                        <input
                                            type="text"
                                            value={editForm.phone || ''}
                                            onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-sm font-medium transition-all"
                                            placeholder="e.g. +60123456789"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Vehicle Details */}
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="material-icons-round text-[14px]">local_shipping</span> Vehicle Info
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 ml-1">Vehicle Status</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { val: 'idle', label: '空闲 (Idle)' },
                                                { val: 'maintenance', label: '维修 (Maint)' },
                                                { val: 'occupied', label: '占用 (Occup)' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.val}
                                                    onClick={() => setEditForm({ ...editForm, vehicle_status: opt.val })}
                                                    className={`py-2 px-2 rounded-xl text-[11px] font-black border transition-all ${editForm.vehicle_status === opt.val
                                                        ? 'bg-slate-800 text-white border-slate-800 shadow-md transform scale-[1.02]'
                                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                        }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1 ml-1">Vehicle Model</label>
                                        <input
                                            type="text"
                                            value={editForm.vehicle_model || ''}
                                            onChange={e => setEditForm({ ...editForm, vehicle_model: e.target.value })}
                                            className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-sm font-medium transition-all"
                                            placeholder="e.g. Toyota Hiace"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1 ml-1">Plate Number</label>
                                            <input
                                                type="text"
                                                value={editForm.vehicle_plate || ''}
                                                onChange={e => setEditForm({ ...editForm, vehicle_plate: e.target.value })}
                                                className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-sm font-medium transition-all uppercase"
                                                placeholder="e.g. VNZ 1234"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1 ml-1">Type</label>
                                            <input
                                                type="text"
                                                value={editForm.vehicle_type || ''}
                                                onChange={e => setEditForm({ ...editForm, vehicle_type: e.target.value })}
                                                className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-sm font-medium transition-all"
                                                placeholder="e.g. 冷链运输"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 flex gap-3 shrink-0">
                            <button
                                onClick={() => setEditingDriver(null)}
                                className="flex-1 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSaving}
                                className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 text-sm flex items-center justify-center disabled:opacity-70 disabled:pointer-events-none"
                            >
                                {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Vehicle Modal */}
            {assigningVehicleToDriver && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                            <h2 className="text-lg font-black text-slate-800">指派车辆给 {assigningVehicleToDriver.name || '司机'}</h2>
                            <button
                                onClick={() => setAssigningVehicleToDriver(null)}
                                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors shadow-sm"
                            >
                                <span className="material-icons-round text-[18px]">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto no-scrollbar space-y-4">
                            {vehicles.map(v => {
                                const isAvailable = v.status === 'available';
                                const roadTaxWarning = (() => {
                                    if (!v.road_tax_expiry) return false;
                                    const diff = new Date(v.road_tax_expiry).getTime() - new Date().getTime();
                                    return diff < 0 || (diff / (1000 * 3600 * 24)) <= 30;
                                })();

                                return (
                                    <div key={v.id} className={`p-4 rounded-2xl border flex items-center justify-between ${isAvailable ? 'border-slate-200 hover:border-slate-300 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-black text-slate-800 tracking-tight text-lg">{v.plate_no}</h4>
                                                {v.status === 'busy' && <span className="text-[9px] px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md font-bold">占用中</span>}
                                                {v.status === 'repair' && <span className="text-[9px] px-2 py-0.5 bg-red-100 text-red-600 rounded-md font-bold">维修中</span>}
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium">{v.model || '未记录车型'} • {v.type || '-'}</p>
                                            {roadTaxWarning && (
                                                <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
                                                    <span className="material-icons-round text-[12px]">warning</span> 路税即将到期或已过期
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            disabled={!isAvailable || isAssigning}
                                            onClick={() => handleAssignVehicle(v.id)}
                                            className={`px-4 py-2 text-sm font-black uppercase rounded-xl transition-all ${isAvailable ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                        >
                                            选择
                                        </button>
                                    </div>
                                );
                            })}
                            {vehicles.length === 0 && (
                                <div className="text-center py-8 text-slate-400 font-bold text-sm">
                                    暂无已登记的车辆，请先前往车辆面板添加。
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriversPage;
