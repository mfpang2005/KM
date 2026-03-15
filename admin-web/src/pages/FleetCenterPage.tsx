import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FleetService, VehicleService, SuperAdminService, api } from '../services/api';
import type { User, Vehicle, DriverAssignment, Order } from '../types';
import { OrderStatus, UserRole } from '../types';

interface FleetDriver extends User {
    activeAssignment?: DriverAssignment & { vehicle: Vehicle };
    activeOrders: Order[];
    completedToday: number;
}

export const FleetCenterPage: React.FC = () => {
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'fleet' | 'inventory'>('fleet');
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Add Driver/Vehicle states
    const [showAddDriver, setShowAddDriver] = useState(false);
    const [showAddVehicle, setShowAddVehicle] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState<Order | null>(null);
    const [isAssigningOrder, setIsAssigningOrder] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [newDriver, setNewDriver] = useState({ email: '', name: '', phone: '', password: '', employee_id: '' });
    const [newVehicle, setNewVehicle] = useState<Partial<Vehicle>>({ 
        plate_no: '', 
        model: '', 
        type: 'Van', 
        status: 'available',
        road_tax_expiry: ''
    });

    const loadData = useCallback(async () => {
        try {
            const [fleetData, vehiclesData, ordersRes] = await Promise.all([
                FleetService.getFleetStatus(),
                VehicleService.getAll(),
                api.get('/orders').catch(() => ({ data: [] })) // Resilient to orders failure
            ]);

            const allOrders: Order[] = ('status' in ordersRes && ordersRes.status === 200) ? (ordersRes.data as Order[]) : (ordersRes.data as Order[] || []);
            const today = new Date().toISOString().split('T')[0];

            // Filter pending orders (READY but no driver assigned)
            const pending = allOrders.filter(o => o.status === OrderStatus.READY && !o.driverId);
            setPendingOrders(pending);

            const mappedDrivers: FleetDriver[] = (fleetData || []).map((d: any) => {
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

            setDrivers(Array.isArray(mappedDrivers) ? mappedDrivers : []);
            setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
            setError(null);
        } catch (error) {
            console.error('Failed to load fleet data', error);
            setError('获取数据失败，请检查网络或刷新重试');
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

    const handleAddDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await SuperAdminService.createInternalUser({
                ...newDriver,
                role: UserRole.DRIVER
            });
            setShowAddDriver(false);
            setNewDriver({ email: '', name: '', phone: '', password: '', employee_id: '' });
            loadData();
        } catch (e: any) {
            alert(`添加司机失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await VehicleService.create(newVehicle);
            setShowAddVehicle(false);
            setNewVehicle({ plate_no: '', model: '', type: 'Van', status: 'available', road_tax_expiry: '' });
            loadData();
        } catch (e: any) {
            alert(`添加车辆失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteVehicle = async (id: string) => {
        if (!window.confirm('确定要删除这辆车吗？')) return;
        try {
            await VehicleService.delete(id);
            loadData();
        } catch (e: any) {
            alert(`删除失败: ${e.response?.data?.detail || e.message}`);
        }
    };

    const handleUpdateVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingVehicle) return;
        setIsSubmitting(true);
        try {
            await VehicleService.update(editingVehicle.id, editingVehicle);
            setEditingVehicle(null);
            loadData();
        } catch (e: any) {
            alert(`更新车辆失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateVehicleStatus = async (vehicleId: string, newStatus: Vehicle['status']) => {
        try {
            await VehicleService.update(vehicleId, { status: newStatus });
            loadData();
        } catch (e: any) {
            alert(`更新状态失败: ${e.response?.data?.detail || e.message}`);
        }
    };

    const handleAssignOrder = async (driverId: string) => {
        if (!selectedOrderForAssignment) return;
        setIsAssigningOrder(true);
        try {
            await api.patch(`/orders/${selectedOrderForAssignment.id}`, { 
                driverId, 
                status: OrderStatus.DELIVERING 
            });
            setSelectedOrderForAssignment(null);
            loadData();
        } catch (e: any) {
            alert(`指派订单失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigningOrder(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-slate-900 rounded-full"></div></div>;

    if (error) return (
        <div className="h-full flex flex-col items-center justify-center gap-4">
            <span className="material-icons-round text-5xl text-red-500">error_outline</span>
            <p className="text-slate-600 font-bold">{error}</p>
            <button 
                onClick={loadData}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all"
            >
                Retry
            </button>
        </div>
    );

    return (
        <div className="min-h-full pt-10 pb-20 space-y-12 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start justify-between gap-8">
                <div className="space-y-6">
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter">车队中心 <span className="text-blue-600">Fleet Center</span></h1>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setShowAddDriver(true)}
                            className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2 shadow-2xl shadow-slate-900/20 active:scale-95"
                        >
                            <span className="material-icons-round text-sm">person_add</span>
                            Add Driver
                        </button>
                        <button 
                            onClick={() => setShowAddVehicle(true)}
                            className="px-6 py-3 bg-white text-slate-900 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-xl shadow-slate-900/5 active:scale-95"
                        >
                            <span className="material-icons-round text-sm">local_shipping</span>
                            Add Vehicle
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="bg-white/80 backdrop-blur-2xl border border-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-900/5 flex items-center gap-5 min-w-[200px]">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-inner">
                            <span className="material-icons-round text-2xl">person_pin</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">在线司机</p>
                            <p className="text-3xl font-black text-slate-800 font-mono italic leading-none">{stats.activeDrivers}</p>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-2xl border border-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-900/5 flex items-center gap-5 min-w-[200px]">
                        <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-500 shadow-inner">
                            <span className="material-icons-round text-2xl">inventory_2</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">空闲车辆</p>
                            <p className="text-3xl font-black text-slate-800 font-mono italic leading-none">{stats.availableVehicles}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-8 border-b border-slate-200/50 pb-2">
                <button 
                    onClick={() => setViewMode('fleet')}
                    className={`relative pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all ${viewMode === 'fleet' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Fleet Status
                    {viewMode === 'fleet' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full animate-in slide-in-from-left duration-300"></div>}
                </button>
                <button 
                    onClick={() => setViewMode('inventory')}
                    className={`relative pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all ${viewMode === 'inventory' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Vehicle Inventory
                    {viewMode === 'inventory' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full animate-in slide-in-from-left duration-300"></div>}
                </button>
            </div>

            {viewMode === 'fleet' ? (
                <>
                    {/* Package Arrangement (待指派订单) */}
                    {pendingOrders.length > 0 && (
                        <div className="space-y-6 animate-in slide-in-from-top-4 duration-700">
                            <div className="flex items-center justify-between px-2">
                                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">待指派订单池 <span className="text-blue-600 ml-2">Package Arrangement</span> ({pendingOrders.length})</h2>
                                <div className="h-px flex-1 mx-8 bg-gradient-to-r from-slate-200 to-transparent"></div>
                            </div>
                            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-4 px-4">
                                {pendingOrders.map(order => (
                                    <div key={order.id} className="min-w-[340px] bg-white border border-slate-100 p-8 rounded-[3rem] shadow-2xl shadow-slate-900/5 hover:border-blue-500/30 transition-all flex flex-col gap-6 group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 blur-3xl -mr-12 -mt-12 group-hover:bg-blue-100/50 transition-all"></div>
                                        <div className="flex justify-between items-start relative">
                                            <div>
                                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                                                    Order #{order.order_number || order.id.slice(0, 8)}
                                                </p>
                                                <h3 className="text-lg font-black text-slate-800 line-clamp-1">{order.customerName}</h3>
                                            </div>
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex flex-col items-center justify-center text-blue-600 border border-blue-100">
                                                <span className="text-[10px] font-black leading-none">{order.dueTime ? new Date(order.dueTime).getHours() : '--'}</span>
                                                <span className="text-[10px] font-black leading-none opacity-50">{order.dueTime ? String(new Date(order.dueTime).getMinutes()).padStart(2, '0') : '--'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 text-slate-500 bg-slate-50/80 p-4 rounded-2xl border border-slate-100/50">
                                            <span className="material-icons-round text-blue-400 text-lg mt-0.5">location_on</span>
                                            <p className="text-[11px] font-bold leading-relaxed line-clamp-2">{order.address}</p>
                                        </div>
                                        <div className="pt-2 flex items-center justify-between">
                                            <span className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-600 text-[10px] font-black uppercase tracking-widest border border-purple-100/50">Ready to Ship</span>
                                            <button 
                                                onClick={() => {
                                                    if (selectedOrderForAssignment?.id === order.id) {
                                                        setSelectedOrderForAssignment(null);
                                                    } else {
                                                        setSelectedOrderForAssignment(order);
                                                        // Scroll to fleet list maybe?
                                                        document.getElementById('fleet-list')?.scrollIntoView({ behavior: 'smooth' });
                                                    }
                                                }}
                                                className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${selectedOrderForAssignment?.id === order.id ? 'text-red-500' : 'text-blue-600 hover:translate-x-1'}`}
                                            >
                                                {selectedOrderForAssignment?.id === order.id ? '取消指派' : '指派任务'} <span className="material-icons-round text-sm">{selectedOrderForAssignment?.id === order.id ? 'close' : 'arrow_forward'}</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fleet List */}
                    <div id="fleet-list" className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        {drivers.map(driver => (
                            <div key={driver.id} className="group relative bg-slate-900 border border-white/5 rounded-[3.5rem] p-10 shadow-2xl overflow-hidden transition-all hover:translate-y-[-8px] hover:shadow-blue-500/20">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full group-hover:bg-blue-500/20 transition-all pointer-events-none"></div>
                                
                                <div className="relative flex flex-col lg:flex-row gap-10 items-start">
                                    {/* Driver Identity */}
                                    <div className="flex flex-row lg:flex-col items-center lg:items-start gap-6 shrink-0">
                                        <div className="relative">
                                            <div className="w-24 h-24 rounded-[2.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-white/20 overflow-hidden shadow-inner">
                                                {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="material-icons-round text-5xl">person</span>}
                                            </div>
                                            <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl border-4 border-slate-900 flex items-center justify-center shadow-2xl ${driver.activeOrders.length > 0 ? 'bg-emerald-500 shadow-emerald-500/40' : 'bg-red-500 shadow-red-500/40'}`}>
                                                <span className="material-icons-round text-white text-[20px]">{driver.activeOrders.length > 0 ? 'bolt' : 'power_settings_new'}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-white tracking-tight">{driver.name}</h3>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="material-icons-round text-blue-400 text-sm">phone</span>
                                                <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest">{driver.phone || 'No Phone'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status & Vehicle Info */}
                                    <div className="flex-1 space-y-8 w-full">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="bg-white/5 rounded-[2rem] p-6 border border-white/5 backdrop-blur-md">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">当前车辆 Vehicle</p>
                                                <p className="text-lg font-black text-white font-mono tracking-[0.2em]">{driver.activeAssignment?.vehicle ? driver.activeAssignment.vehicle.plate_no : '---'}</p>
                                                <p className="text-[11px] font-bold text-slate-400 mt-1 truncate opacity-60 italic">{driver.activeAssignment?.vehicle?.model || '未绑定车辆'}</p>
                                            </div>
                                            <div className="bg-white/5 rounded-[2rem] p-6 border border-white/5 backdrop-blur-md">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">今日任务 Task</p>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-3xl font-black text-white font-mono leading-none tracking-tighter">{driver.completedToday}</span>
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Delivered</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-6">
                                            <div className="flex flex-col gap-2">
                                                {driver.activeOrders.length > 0 ? (
                                                    driver.activeOrders.map(o => (
                                                        <div key={o.id} className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-emerald-500/10 text-emerald-400 text-[11px] font-black uppercase tracking-widest border border-emerald-500/20">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                            {o.customerName.slice(0, 15)}...
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 text-slate-500 text-[11px] font-black uppercase tracking-widest border border-white/5">
                                                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                                                        等待指派 IDLE
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {selectedOrderForAssignment ? (
                                                    <button 
                                                        disabled={isAssigningOrder}
                                                        onClick={() => handleAssignOrder(driver.id)}
                                                        className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl animate-bounce"
                                                    >
                                                        {isAssigningOrder ? 'Processing...' : 'Assign to Me'}
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => setAssigningVehicleTo(driver)}
                                                        className="px-6 py-3 bg-white text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95"
                                                    >
                                                        Assign Vehicle
                                                    </button>
                                                )}
                                                <button className="w-12 h-12 bg-white/5 hover:bg-white/10 text-slate-400 rounded-2xl flex items-center justify-center transition-all border border-white/5">
                                                    <span className="material-icons-round text-xl">more_vert</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                /* Vehicle Inventory View (车辆盘点) */
                <div className="space-y-8 animate-in fade-in duration-700">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">车辆资产库 <span className="text-blue-600 ml-2">Vehicle Inventory</span></h2>
                        <div className="h-px flex-1 mx-10 bg-gradient-to-r from-slate-200 to-transparent"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {vehicles.map(v => (
                            <div key={v.id} className="bg-white border border-slate-100 p-10 rounded-[3.5rem] shadow-2xl shadow-slate-900/5 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 blur-[60px] -mr-16 -mt-16 group-hover:bg-blue-50 transition-all"></div>
                                
                                <div className="flex items-center justify-between mb-8 relative">
                                    <div className="w-16 h-16 rounded-[1.8rem] bg-slate-900 flex items-center justify-center text-white group-hover:bg-blue-600 group-hover:rotate-6 transition-all shadow-xl shadow-slate-900/10 group-hover:shadow-blue-600/20">
                                        <span className="material-icons-round text-3xl">local_shipping</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 relative">
                                        <div className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-sm ${
                                            v.status === 'available' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                                            v.status === 'busy' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                            'bg-red-50 text-red-600 border border-red-100'
                                        }`}>
                                            {v.status === 'available' ? '● Available' : v.status === 'busy' ? '○ Busy' : '⚠ Repair'}
                                        </div>
                                        <select 
                                            className="opacity-0 absolute inset-0 cursor-pointer"
                                            value={v.status}
                                            onChange={(e) => handleUpdateVehicleStatus(v.id, e.target.value as any)}
                                        >
                                            <option value="available">Available</option>
                                            <option value="busy">Busy</option>
                                            <option value="repair">Repair</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="relative space-y-1">
                                    <h3 className="text-3xl font-black text-slate-900 font-mono tracking-[0.1em]">{v.plate_no}</h3>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        {v.model || 'Standard Model'} 
                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                        <span className="text-blue-600">{v.type}</span>
                                    </p>
                                </div>
                                
                                <div className="mt-10 pt-8 border-t border-slate-50 flex items-center justify-between relative">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                                            <span className="material-icons-round text-xl">event_available</span>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Road Tax Expiry</p>
                                            <p className="text-sm font-black text-slate-700 font-mono italic">{v.road_tax_expiry || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => setEditingVehicle(v)}
                                            className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-slate-100/50"
                                        >
                                            <span className="material-icons-round text-[18px]">edit</span>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteVehicle(v.id)}
                                            className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm border border-slate-100/50"
                                        >
                                            <span className="material-icons-round text-[18px]">delete_outline</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modals & Popups */}
            {assigningVehicleTo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[4rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">派车指令 <span className="text-blue-600">Dispatch</span></h2>
                                <p className="text-[11px] font-black text-slate-400 mt-2 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                                    Assigning to: {assigningVehicleTo?.name}
                                </p>
                            </div>
                            <button onClick={() => setAssigningVehicleTo(null)} className="w-14 h-14 rounded-[2rem] bg-white text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all shadow-xl shadow-slate-900/5 border border-slate-100">
                                <span className="material-icons-round text-2xl">close</span>
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto no-scrollbar space-y-4">
                            {vehicles.filter((v: Vehicle) => v.status === 'available').length === 0 ? (
                                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
                                    <span className="material-icons-round text-5xl text-slate-100 mb-4">no_crash</span>
                                    <p className="text-sm font-black text-slate-300 uppercase tracking-widest">暂无可用车辆</p>
                                </div>
                            ) : (
                                vehicles.filter((v: Vehicle) => v.status === 'available').map((v: Vehicle) => (
                                    <div key={v.id} className="p-8 rounded-[3rem] border border-slate-100 bg-white hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 transition-all flex items-center justify-between group">
                                        <div className="flex items-center gap-6">
                                            <div className="w-16 h-16 rounded-[1.8rem] bg-blue-600/10 flex items-center justify-center text-blue-600 group-hover:rotate-12 transition-transform shadow-inner">
                                                <span className="material-icons-round text-3xl">local_shipping</span>
                                            </div>
                                            <div>
                                                <p className="text-2xl font-black text-slate-900 font-mono tracking-wider italic">{v.plate_no}</p>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{v.model} • {v.type}</p>
                                            </div>
                                        </div>
                                        <button 
                                            disabled={isAssigning}
                                            onClick={() => handleAssignVehicle(v.id)}
                                            className="px-8 py-4 bg-slate-900 text-white rounded-[1.8rem] text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-2xl shadow-slate-900/20 active:scale-95 disabled:opacity-50"
                                        >
                                            {isAssigning ? 'Wait...' : 'Dispatch'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Driver & Vehicle Modals (aligned with same theme) */}
            {showAddDriver && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white rounded-[4rem] w-full max-w-md shadow-2xl overflow-hidden border border-white/20 p-10 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">新增司机 <span className="text-blue-600">Register</span></h2>
                            <button onClick={() => setShowAddDriver(false)} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleAddDriver} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Full Name</label>
                                <input 
                                    required
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                    value={newDriver.name}
                                    onChange={e => setNewDriver({...newDriver, name: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email Address</label>
                                <input 
                                    required
                                    type="email"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                    value={newDriver.email}
                                    onChange={e => setNewDriver({...newDriver, email: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Phone Number</label>
                                <input 
                                    required
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                    value={newDriver.phone}
                                    onChange={e => setNewDriver({...newDriver, phone: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Login Password</label>
                                <input 
                                    required
                                    type="password"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                    value={newDriver.password}
                                    onChange={e => setNewDriver({...newDriver, password: e.target.value})}
                                />
                            </div>
                            <button 
                                disabled={isSubmitting}
                                type="submit"
                                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-blue-600 transition-all shadow-2xl shadow-slate-900/20 active:scale-95 mt-6 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Registering...' : 'Confirm Registration'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showAddVehicle && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white rounded-[4rem] w-full max-w-md shadow-2xl overflow-hidden border border-white/20 p-10 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">添加载具 <span className="text-blue-600">Vehicle</span></h2>
                            <button onClick={() => setShowAddVehicle(false)} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleAddVehicle} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Plate Number</label>
                                <input 
                                    required
                                    placeholder="e.g. VEC 1234"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                    value={newVehicle.plate_no}
                                    onChange={e => setNewVehicle({...newVehicle, plate_no: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Brand/Model</label>
                                <input 
                                    placeholder="e.g. Isuzu D-Max"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                    value={newVehicle.model}
                                    onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Type</label>
                                    <select 
                                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none appearance-none"
                                        value={newVehicle.type}
                                        onChange={e => setNewVehicle({...newVehicle, type: e.target.value})}
                                    >
                                        <option value="Van">🚚 Van</option>
                                        <option value="Truck">🚛 Truck</option>
                                        <option value="Motorcycle">🛵 Motorcycle</option>
                                        <option value="Car">🚗 Car</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Road Tax Expiry</label>
                                    <input 
                                        type="date"
                                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                        value={newVehicle.road_tax_expiry}
                                        onChange={e => setNewVehicle({...newVehicle, road_tax_expiry: e.target.value})}
                                    />
                                </div>
                            </div>
                            <button 
                                disabled={isSubmitting}
                                type="submit"
                                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-blue-600 transition-all shadow-2xl shadow-slate-900/20 active:scale-95 mt-4 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Adding...' : 'Execute Addition'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {editingVehicle && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white rounded-[4rem] w-full max-md:max-h-[85vh] max-w-md shadow-2xl overflow-hidden border border-white/20 p-10 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">编辑车辆 <span className="text-blue-600">Update</span></h2>
                            <button onClick={() => setEditingVehicle(null)} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleUpdateVehicle} className="space-y-6 overflow-y-auto no-scrollbar max-h-[60vh]">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Plate Number</label>
                                <input 
                                    required
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                    value={editingVehicle.plate_no}
                                    onChange={e => setEditingVehicle({...editingVehicle, plate_no: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Brand/Model</label>
                                <input 
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                                    value={editingVehicle.model || ''}
                                    onChange={e => setEditingVehicle({...editingVehicle, model: e.target.value})}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Type</label>
                                    <select 
                                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none"
                                        value={editingVehicle.type || 'Van'}
                                        onChange={e => setEditingVehicle({...editingVehicle, type: e.target.value})}
                                    >
                                        <option value="Van">🚚 Van</option>
                                        <option value="Truck">🚛 Truck</option>
                                        <option value="Motorcycle">🛵 Motorcycle</option>
                                        <option value="Car">🚗 Car</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Road Tax Expiry</label>
                                    <input 
                                        type="date"
                                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200/50 rounded-2xl text-[13px] font-bold outline-none"
                                        value={editingVehicle.road_tax_expiry || ''}
                                        onChange={e => setEditingVehicle({...editingVehicle, road_tax_expiry: e.target.value})}
                                    />
                                </div>
                            </div>
                            <button 
                                disabled={isSubmitting}
                                type="submit"
                                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-blue-600 transition-all shadow-2xl shadow-slate-900/20 active:scale-95 mt-4 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
