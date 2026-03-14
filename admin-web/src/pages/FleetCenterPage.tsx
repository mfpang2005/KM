import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FleetService, VehicleService, api } from '../services/api';
import type { User, Vehicle, DriverAssignment, Order } from '../types';
import { OrderStatus } from '../types';

interface FleetDriver extends User {
    activeAssignment?: DriverAssignment & { vehicle: Vehicle };
    activeOrders: Order[];
    completedToday: number;
}

export const FleetCenterPage: React.FC = () => {
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [fleetData, vehiclesData, ordersRes] = await Promise.all([
                FleetService.getFleetStatus(),
                VehicleService.getAll(),
                api.get('/orders')
            ]);

            const allOrders: Order[] = ordersRes.data;
            const today = new Date().toISOString().split('T')[0];

            const mappedDrivers: FleetDriver[] = fleetData.map((d: any) => {
                const driverOrders = allOrders.filter(o => o.driverId === d.id);
                const activeAssignment = d.assignments?.find((a: any) => a.status === 'active');
                
                return {
                    ...d,
                    activeAssignment,
                    activeOrders: driverOrders.filter(o => o.status === OrderStatus.DELIVERING || o.status === OrderStatus.READY),
                    completedToday: driverOrders.filter(o => 
                        o.status === OrderStatus.COMPLETED && o.created_at?.startsWith(today)
                    ).length
                };
            });

            setDrivers(mappedDrivers);
            setVehicles(vehiclesData);
        } catch (error) {
            console.error('Failed to load fleet data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const channels = [
            supabase.channel('fleet-assignments').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_assignments' }, () => loadData()).subscribe(),
            supabase.channel('fleet-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData()).subscribe(),
            supabase.channel('fleet-vehicles').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => loadData()).subscribe()
        ];
        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [loadData]);

    const stats = useMemo(() => ({
        activeDrivers: drivers.filter(d => d.activeOrders.length > 0).length,
        availableVehicles: vehicles.filter(v => v.status === 'available').length
    }), [drivers, vehicles]);

    const handleAssignVehicle = async (vehicleId: string) => {
        if (!assigningVehicleTo) return;
        setIsAssigning(true);
        try {
            await VehicleService.assignToDriver(assigningVehicleTo.id, vehicleId);
            setAssigningVehicleTo(null);
            loadData();
        } catch (e: any) {
            alert(`指派失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigning(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-slate-900 rounded-full"></div></div>;

    return (
        <div className="min-h-full pt-10 pb-20 space-y-10 animate-in fade-in duration-500">
            {/* Header / Stats Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter">车队中心 <span className="text-blue-600">Fleet Center</span></h1>
                    <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-[0.3em]">Realtime Driver & Vehicle Operations</p>
                </div>
                
                <div className="flex gap-4">
                    <div className="bg-white/40 backdrop-blur-xl border border-white/40 p-5 rounded-[2rem] shadow-xl shadow-blue-500/5 flex items-center gap-4 min-w-[200px]">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                            <span className="material-icons-round text-2xl">person_pin</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">在线司机</p>
                            <p className="text-2xl font-black text-slate-800 font-mono tracking-tighter">{stats.activeDrivers}</p>
                        </div>
                    </div>
                    <div className="bg-white/40 backdrop-blur-xl border border-white/40 p-5 rounded-[2rem] shadow-xl shadow-purple-500/5 flex items-center gap-4 min-w-[200px]">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600">
                            <span className="material-icons-round text-2xl">local_shipping</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">空闲车辆</p>
                            <p className="text-2xl font-black text-slate-800 font-mono tracking-tighter">{stats.availableVehicles}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fleet List */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {drivers.map(driver => (
                    <div key={driver.id} className="group relative bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden transition-all hover:translate-y-[-4px] hover:shadow-blue-500/10">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] rounded-full group-hover:bg-blue-500/20 transition-all"></div>
                        
                        <div className="relative flex flex-col md:flex-row gap-8 items-start">
                            {/* Driver Identity */}
                            <div className="flex items-center gap-5 shrink-0">
                                <div className="relative">
                                    <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 overflow-hidden">
                                        {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="material-icons-round text-4xl">person</span>}
                                    </div>
                                    <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-2xl border-4 border-slate-900 flex items-center justify-center shadow-lg ${driver.activeOrders.length > 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                        <span className="material-icons-round text-white text-[16px]">{driver.activeOrders.length > 0 ? 'bolt' : 'power_settings_new'}</span>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight">{driver.name}</h3>
                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1">{driver.phone || 'No Phone'}</p>
                                </div>
                            </div>

                            {/* Status & Vehicle Info (Join Data) */}
                            <div className="flex-1 space-y-4 w-full">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">当前车辆</p>
                                        <p className="text-sm font-black text-white font-mono tracking-wider">
                                            {driver.activeAssignment?.vehicle ? driver.activeAssignment.vehicle.plate_no : '---'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400 truncate">{driver.activeAssignment?.vehicle?.model || '未绑定车辆'}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">今日任务</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xl font-black text-white font-mono leading-none">{driver.completedToday}</span>
                                            <span className="text-[9px] font-bold text-slate-500 uppercase">Deliveries</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {driver.activeOrders.length > 0 ? (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> 配送中 Delivering
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-500/20">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 空闲 Available
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setAssigningVehicleTo(driver)}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase transition-all"
                                        >
                                            Assign Vehicle
                                        </button>
                                        <button className="w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl flex items-center justify-center transition-all">
                                            <span className="material-icons-round text-[18px]">more_horiz</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Assign Vehicle Modal */}
            {assigningVehicleTo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in zoom-in-95 duration-200">
                    <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-slate-100">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900">派车指令 <span className="text-blue-600">Dispatch</span></h2>
                                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Assigning to: {assigningVehicleTo.name}</p>
                            </div>
                            <button onClick={() => setAssigningVehicleTo(null)} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto no-scrollbar space-y-3">
                            {vehicles.filter(v => v.status === 'available').map(v => (
                                <div key={v.id} className="p-6 rounded-[2rem] border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all flex items-center justify-between group">
                                    <div className="flex items-center gap-5">
                                        <div className="w-14 h-14 rounded-2xl bg-blue-500 group-hover:rotate-6 transition-transform flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                            <span className="material-icons-round text-2xl">local_shipping</span>
                                        </div>
                                        <div>
                                            <p className="text-lg font-black text-slate-900 font-mono tracking-wider">{v.plate_no}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{v.model} • {v.type}</p>
                                        </div>
                                    </div>
                                    <button 
                                        disabled={isAssigning}
                                        onClick={() => handleAssignVehicle(v.id)}
                                        className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                                    >
                                        Execute
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
