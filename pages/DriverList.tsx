import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { FleetService, VehicleService, api } from '../src/services/api';
import { OrderStatus, Order, Vehicle, User } from '../types';

interface FleetDriver extends User {
    activeOrders: Order[];
    completedToday: number;
    activeAssignment?: any;
}

const DriverList: React.FC = () => {
    const navigate = useNavigate();
    
    // Core State
    const [viewMode, setViewMode] = useState<'fleet' | 'inventory'>('fleet');
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
    const [rtStatus, setRtStatus] = useState<string>('CONNECTING');
    
    // Dispatch State
    const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState<Order | null>(null);
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Vehicle Inventory State
    const [showAddVehicle, setShowAddVehicle] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
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
                api.get('/orders').catch(() => ({ data: [] }))
            ]);

            const allOrders: Order[] = ('status' in ordersRes && ordersRes.status === 200) ? (ordersRes.data as Order[]) : (ordersRes.data as Order[] || []);
            const today = new Date().toISOString().split('T')[0];

            // Filter pending orders (READY/PREPARING/PENDING but no driver assigned)
            const pending = allOrders.filter(o => 
                (o.status === OrderStatus.READY || o.status === OrderStatus.PREPARING || o.status === OrderStatus.PENDING) && 
                !o.driverId
            );
            setPendingOrders(pending);
            setVehicles(vehiclesData || []);

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

            setDrivers(mappedDrivers);
        } catch (error) {
            console.error('Failed to load fleet data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const channels = [
            supabase.channel('fleet-assignments').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_assignments' }, () => loadData()).subscribe((status) => setRtStatus(status)),
            supabase.channel('fleet-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData()).subscribe(),
            supabase.channel('fleet-vehicles').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => loadData()).subscribe()
        ];
        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [loadData]);

    const stats = useMemo(() => ({
        activeDrivers: drivers.filter(d => d.activeOrders.length > 0).length,
        availableVehicles: vehicles.filter(v => v.status === 'available').length
    }), [drivers, vehicles]);

    const handleAssignOrder = async (driverId: string) => {
        if (!selectedOrderForAssignment) return;
        setIsSubmitting(true);
        try {
            await api.patch(`/orders/${selectedOrderForAssignment.id}`, { 
                driverId 
            });
            setSelectedOrderForAssignment(null);
            loadData();
        } catch (e: any) {
            alert(`指派订单失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAssignVehicle = async (vehicleId: string) => {
        if (!assigningVehicleTo) return;
        setIsSubmitting(true);
        try {
            await VehicleService.assignToDriver(assigningVehicleTo.id, vehicleId);
            setAssigningVehicleTo(null);
            loadData();
        } catch (e: any) {
            alert(`指派失败: ${e.response?.data?.detail || e.message}`);
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

    const handleDeleteVehicle = async (id: string) => {
        if (!window.confirm('确定要删除这辆车吗？')) return;
        try {
            await VehicleService.delete(id);
            loadData();
        } catch (e: any) {
            alert(`删除失败: ${e.response?.data?.detail || e.message}`);
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

    const handleUnassignOrder = async (orderId: string) => {
        if (!window.confirm('确定要退回此订单吗？退回后将进入待指派池。')) return;
        try {
            await api.patch(`/orders/${orderId}`, { 
                driverId: null
            });
            loadData();
        } catch (e: any) {
            alert(`退回失败: ${e.response?.data?.detail || e.message}`);
        }
    };

    const handleWhatsAppOrderDetails = (order: Order) => {
        const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
        const itemsList = order.items.map(m => `- ${m.product_name || m.name} (x${m.quantity})`).join('%0A');
        const message = `[金龙餐饮] 订单详情确认%0A----------------------%0A订单编号: ${order.order_number || order.id.slice(0, 8)}%0A客户姓名: ${order.customerName}%0A配送地址: ${order.address}%0A%0A订购项目:%0A${itemsList}%0A%0A合计金额: RM ${(order.amount || 0).toFixed(2)}%0A----------------------%0A感谢您的订购！如有疑问请联系我们。`;
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const handleWhatsAppDeparture = async (order: Order) => {
        const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
        const message = `[金龙餐饮] 出发通知%0A----------------------%0A尊敬的 ${order.customerName}，您的订单 ${order.order_number || order.id.slice(0, 8)} 司机已整装出发！%0A%0A预计近期送达，请保持电话畅通。%0A配送地址: ${order.address}%0A%0A祝您用餐愉快！`;
        try {
            await api.patch(`/orders/${order.id}`, { 
                status: OrderStatus.DELIVERING 
            });
            loadData();
        } catch (e) { console.error('Auto status update failed', e); }
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const filteredDrivers = useMemo(() => {
        return drivers.filter(d => 
            d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            d.phone?.includes(searchQuery) ||
            d.activeAssignment?.vehicle?.plate_no?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [drivers, searchQuery]);

    const filteredVehicles = useMemo(() => {
        return vehicles.filter(v => 
            v.plate_no?.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) || 
            v.model?.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
        );
    }, [vehicles, vehicleSearchQuery]);

    const availableVehicles = vehicles.filter(v => v.status === 'available');

    if (loading && drivers.length === 0) {
        return <div className="h-full flex flex-col items-center justify-center bg-[#0f172a] text-white">
            <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full mb-4"></div>
            <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-[10px]">Loading Fleet Systems...</p>
        </div>;
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 relative text-slate-200 font-sans selection:bg-indigo-500/30 overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none opacity-50"></div>
            
            {/* --- Premium Header --- */}
            <header className="pt-10 pb-6 px-8 bg-slate-900/40 backdrop-blur-3xl sticky top-0 z-40 border-b border-white/5 shadow-2xl">
                <div className="max-w-[1800px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <button onClick={() => navigate('/admin')} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 group relative overflow-hidden">
                            <div className="absolute inset-0 bg-indigo-500/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                            <span className="material-icons-round relative z-10 text-xl">arrow_back</span>
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                                    <span className="text-indigo-500 material-icons-round text-3xl">hub</span>
                                    调度中心 <span className="text-indigo-500/50 font-light opacity-50 ml-1">Fleet Central</span>
                                </h1>
                                <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                                    <div className={`w-1.5 h-1.5 rounded-full ${rtStatus === 'SUBSCRIBED' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{rtStatus === 'SUBSCRIBED' ? 'Live System' : 'Connecting...'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Real-time logistics & fleet management hub</p>
                                <div className="h-4 w-px bg-white/10"></div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-indigo-400 font-mono tracking-tighter">{stats.activeDrivers} ON DUTY</span>
                                    <span className="text-[10px] font-black text-emerald-400 font-mono tracking-tighter ml-2">{stats.availableVehicles} READY</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center bg-slate-900/80 p-1.5 rounded-2xl border border-white/10 shadow-inner group">
                        <button 
                            onClick={() => setViewMode('fleet')}
                            className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0 ${viewMode === 'fleet' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'text-slate-500 hover:text-indigo-400'}`}
                        >
                            <span className="material-icons-round text-sm">rocket_launch</span>
                            任务指派 Dispatch
                        </button>
                        <button 
                            onClick={() => setViewMode('inventory')}
                            className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0 ${viewMode === 'inventory' ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'text-slate-500 hover:text-indigo-400'}`}
                        >
                            <span className="material-icons-round text-sm">local_shipping</span>
                            车辆资产 Assets
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 space-y-12 no-scrollbar pb-32">
                <div className="max-w-[1800px] mx-auto space-y-12">
                    {viewMode === 'fleet' ? (
                        <>
                            {/* --- Mission Pool --- */}
                            {pendingOrders.length > 0 && (
                                <section className="space-y-6 animate-in slide-in-from-top-4 duration-700">
                                    <div className="flex items-center justify-between px-2">
                                        <div className="flex items-center gap-4">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)] animate-pulse"></div>
                                            <h2 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">待指派任务池 <span className="text-white ml-2 opacity-50">Mission Pool</span></h2>
                                        </div>
                                        <div className="h-px flex-1 mx-8 bg-gradient-to-r from-indigo-500/20 to-transparent"></div>
                                        <span className="text-[10px] font-mono font-black text-indigo-400/60 uppercase">{pendingOrders.length} Pending Missions</span>
                                    </div>
                                    
                                    <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-8 px-8">
                                        {pendingOrders.map(order => (
                                            <div 
                                                key={order.id} 
                                                className={`min-w-[380px] bg-slate-900/40 border p-8 rounded-[2.5rem] transition-all flex flex-col gap-6 group relative overflow-hidden backdrop-blur-xl ${selectedOrderForAssignment?.id === order.id ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-500/5' : 'border-white/5 hover:border-white/20 hover:bg-white/[0.02]'}`}
                                            >
                                                {/* Card Glow */}
                                                <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/5 blur-[60px] rounded-full group-hover:bg-indigo-500/10 transition-all"></div>
                                                
                                                <div className="flex justify-between items-start relative z-10">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="material-icons-round text-indigo-500 text-sm">assignment_ind</span>
                                                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Order #{order.order_number || order.id.slice(0, 8)}</p>
                                                        </div>
                                                        <h3 className="text-xl font-black text-white line-clamp-1 flex items-center gap-2">
                                                            {order.customerName}
                                                            <span className="material-icons-round text-emerald-400 text-sm opacity-0 group-hover:opacity-100 transition-all">verified</span>
                                                        </h3>
                                                    </div>
                                                    <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-white/5 flex flex-col items-center justify-center shadow-lg group-hover:border-indigo-500/30 transition-all">
                                                        <span className="text-[12px] font-black text-white leading-none font-mono">{order.dueTime ? order.dueTime.split(' ')[0] : '--'}</span>
                                                        <span className="text-[8px] font-black text-slate-500 leading-none mt-1.5 uppercase font-mono tracking-tighter">{order.dueTime ? order.dueTime.split(' ')[1] : 'PM'}</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-4 relative z-10">
                                                    <div className="bg-white/[0.03] p-5 rounded-3xl border border-white/5 group-hover:bg-white/[0.05] transition-colors flex items-start gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-indigo-400/10 flex items-center justify-center shrink-0 border border-indigo-400/20">
                                                            <span className="material-icons-round text-indigo-400 text-lg">place</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Delivery Address</p>
                                                            <p className="text-[12px] font-bold text-slate-300 leading-relaxed line-clamp-2">{order.address}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => setSelectedOrderForAssignment(selectedOrderForAssignment?.id === order.id ? null : order)}
                                                    className={`w-full py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all relative overflow-hidden group/btn ${selectedOrderForAssignment?.id === order.id ? 'bg-rose-500 text-white shadow-[0_10px_30px_rgba(244,63,94,0.3)]' : 'bg-white text-slate-950 shadow-[0_10px_30px_rgba(255,255,255,0.1)] active:scale-[0.98]'}`}
                                                >
                                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                                        <span className="material-icons-round text-lg">{selectedOrderForAssignment?.id === order.id ? 'close' : 'send_and_archive'}</span>
                                                        {selectedOrderForAssignment?.id === order.id ? '取消指派 Cancel' : '指派此任务 Dispatch'}
                                                    </span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* --- Fleet Monitoring --- */}
                            <section className="space-y-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
                                    <div className="flex items-center gap-4">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">车队实时追踪 <span className="text-white ml-2 opacity-50">Fleet Monitoring</span></h2>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="relative group/search">
                                            <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 text-lg group-focus-within/search:text-indigo-400 transition-colors">search</span>
                                            <input 
                                                type="text" 
                                                placeholder="搜索司机 SEARCH DRIVERS..." 
                                                className="bg-slate-900/80 border border-white/5 rounded-2xl pl-14 pr-8 py-3.5 text-[11px] font-black text-white w-full md:w-[360px] focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600 shadow-inner"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                    {filteredDrivers.map(driver => (
                                        <div key={driver.id} className="relative group/card bg-slate-900/40 border border-white/5 rounded-[3rem] p-10 overflow-hidden transition-all hover:bg-slate-900/60 hover:shadow-2xl hover:border-white/10 hover:translate-y-[-4px]">
                                            {/* Glow */}
                                            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/[0.03] blur-[120px] rounded-full pointer-events-none group-hover/card:bg-indigo-500/[0.06] transition-all"></div>
                                            
                                            <div className="relative z-10 space-y-8">
                                                {/* Driver Header Row */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-6">
                                                        <div className="relative">
                                                            <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center overflow-hidden shadow-inner group-hover/card:border-indigo-500/40 transition-all">
                                                                {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="material-icons-round text-4xl text-indigo-400/40">person</span>}
                                                            </div>
                                                            <div className={`absolute -bottom-1 -right-1 w-9 h-9 rounded-2xl border-[5px] border-slate-950 flex items-center justify-center shadow-2xl transition-all duration-500 ${driver.activeOrders.length > 0 ? 'bg-orange-500 rotate-[360deg]' : (driver.activeAssignment ? 'bg-emerald-500' : 'bg-slate-700')}`}>
                                                                <span className="material-icons-round text-white text-[16px]">{driver.activeOrders.length > 0 ? 'local_shipping' : (driver.activeAssignment ? 'check' : 'power_settings_new')}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-3">
                                                                <h3 className="text-2xl font-black text-white tracking-tight group-hover/card:text-indigo-400 transition-colors">{driver.name}</h3>
                                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-[0.2em] border ${driver.activeOrders.length > 0 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                                                                    {driver.activeOrders.length > 0 ? 'On Mission' : 'Standby'}
                                                                </span>
                                                            </div>
                                                            <div className="flex gap-5 mt-3">
                                                                <div className="flex items-center gap-2 text-slate-500 group-hover/card:text-slate-400 transition-colors">
                                                                    <span className="material-icons-round text-indigo-500 text-[18px]">phone</span>
                                                                    <p className="text-[11px] font-black uppercase tracking-widest font-mono">{driver.phone || 'N/A'}</p>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-slate-500">
                                                                    <span className="material-icons-round text-emerald-400 text-[18px]">done_all</span>
                                                                    <p className="text-[11px] font-black uppercase tracking-widest font-mono">{driver.completedToday} DONE</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="hidden sm:flex gap-3">
                                                        <button 
                                                            onClick={() => window.open(`https://wa.me/60${(driver.phone || '').replace(/\D/g, '')}`, '_blank')}
                                                            className="w-14 h-14 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center transition-all border border-emerald-500/10 active:scale-90 group/comm"
                                                        >
                                                            <span className="material-icons-round text-2xl group-hover/comm:scale-125 transition-transform">chat</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => window.location.href = `tel:${driver.phone}`}
                                                            className="w-14 h-14 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center transition-all border border-indigo-500/10 active:scale-90 group/comm"
                                                        >
                                                            <span className="material-icons-round text-2xl group-hover/comm:scale-125 transition-transform">phone</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Assigned Vehicle Box */}
                                                <div className="group/asset relative">
                                                    <div className="bg-slate-900/80 rounded-[2.5rem] p-7 border border-white/5 flex justify-between items-center group-hover/card:bg-slate-800/80 transition-all border-l-4 border-l-indigo-500/30">
                                                        <div className="flex items-center gap-5">
                                                            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover/asset:rotate-6 transition-transform">
                                                                <span className="material-icons-round text-2xl">local_shipping</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1.5">活跃车辆 Assigned Asset</p>
                                                                <p className="text-[15px] font-black text-white font-mono tracking-widest flex items-center gap-2">
                                                                    {driver.activeAssignment?.vehicle?.plate_no || 'STANDBY / NO ASSET'}
                                                                    {driver.activeAssignment && <span className="text-[9px] font-medium text-slate-500 opacity-60 ml-1">({driver.activeAssignment.vehicle.model})</span>}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => setAssigningVehicleTo(driver)}
                                                            className="px-6 py-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shadow-lg group-hover/asset:scale-105"
                                                        >
                                                            {driver.activeAssignment ? '更换车辆' : '绑定车辆'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Active Sessions */}
                                                {driver.activeOrders.length > 0 && (
                                                    <div className="space-y-4 pt-4">
                                                        <div className="flex items-center gap-4 px-2">
                                                            <div className="h-4 w-1 bg-indigo-500 rounded-full animate-pulse"></div>
                                                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">正在进行的任务 Active Sessions ({driver.activeOrders.length})</h4>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-4">
                                                            {driver.activeOrders.map(order => (
                                                                <div key={order.id} className="bg-white/[0.02] rounded-[2rem] p-7 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:bg-white/[0.04] transition-all group/session border-r-4 border-r-transparent hover:border-r-indigo-500">
                                                                    <div className="flex items-center gap-5">
                                                                        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover/session:bg-indigo-600 group-hover/session:text-white transition-all">
                                                                            <span className="material-icons-round">{order.status === OrderStatus.DELIVERING ? 'near_me' : 'inventory_2'}</span>
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex items-center gap-3">
                                                                                <p className="text-[13px] font-black text-white tracking-tight">{order.customerName}</p>
                                                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${order.status === OrderStatus.DELIVERING ? 'bg-orange-500/10 text-orange-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                                                                    {order.status === OrderStatus.DELIVERING ? 'Delivering' : 'Ready'}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-tighter">Mission ID: {order.order_number || order.id.slice(0, 8)}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2 w-full sm:w-auto">
                                                                        <button onClick={() => handleWhatsAppOrderDetails(order)} className="flex-1 sm:flex-none px-5 py-2.5 bg-white/5 text-indigo-400 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all">查看</button>
                                                                        <button onClick={() => handleWhatsAppDeparture(order)} className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">通知</button>
                                                                        <button onClick={() => handleUnassignOrder(order.id)} className="w-11 h-11 flex items-center justify-center bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><span className="material-icons-round text-lg">logout</span></button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Dispatch Cta */}
                                                {selectedOrderForAssignment && (
                                                    <button 
                                                        disabled={isSubmitting || !driver.activeAssignment}
                                                        onClick={() => handleAssignOrder(driver.id)}
                                                        className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] text-[12px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-900 hover:scale-[1.02] transition-all shadow-[0_20px_50px_rgba(79,70,229,0.4)] animate-in slide-in-from-bottom-4 active:scale-95 disabled:opacity-30 disabled:grayscale disabled:scale-100 disabled:shadow-none group/dispatch"
                                                    >
                                                        <span className="flex items-center justify-center gap-3">
                                                            <span className="material-icons-round text-xl group-hover/dispatch:translate-x-1 group-hover/dispatch:-translate-y-1 transition-transform">send</span>
                                                            {isSubmitting ? '系统锁定中...' : `确认指派给 ${driver.name.split(' ')[0]}`}
                                                        </span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </>
                    ) : (
                    /* --- Vehicle Inventory View --- */
                    <section className="space-y-10 animate-in fade-in duration-500">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">车队资产概览 <span className="text-white ml-2 opacity-50">Vehicle Asset Pool</span></h2>
                            </div>
                            <button 
                                onClick={() => setShowAddVehicle(true)}
                                className="px-8 py-4 bg-white text-slate-900 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shadow-[0_20px_40px_rgba(255,255,255,0.1)] flex items-center gap-3 group/add"
                            >
                                <span className="material-icons-round text-sm group-hover/add:rotate-90 transition-transform">add</span>
                                注册新车辆 Enroll Vehicle
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {filteredVehicles.map(vehicle => (
                                <div key={vehicle.id} className="bg-slate-900/40 border border-white/5 rounded-[3rem] p-10 space-y-8 hover:bg-slate-900/60 hover:border-white/10 transition-all group relative overflow-hidden backdrop-blur-xl hover:shadow-2xl">
                                    <div className="flex justify-between items-start">
                                        <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                            <span className="material-icons-round text-3xl">local_shipping</span>
                                        </div>
                                        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border shadow-sm ${vehicle.status === 'available' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : vehicle.status === 'busy' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                                            {vehicle.status}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <h3 className="text-2xl font-black text-white tracking-[0.15em] font-mono group-hover:text-indigo-400 transition-colors uppercase">{vehicle.plate_no}</h3>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{vehicle.model} • {vehicle.type || 'Standard'}</p>
                                    </div>

                                    <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 space-y-4 group-hover:bg-white/[0.05] transition-colors">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em]">Road Tax Expiry</span>
                                            <span className={`text-[11px] font-mono font-black ${new Date(vehicle.road_tax_expiry || '') < new Date() ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>
                                                {(vehicle.road_tax_expiry || '----/--/--').split('T')[0]}
                                            </span>
                                        </div>
                                        <div className="h-px bg-white/5"></div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em]">Assigned Driver</span>
                                            <span className="text-[11px] text-white font-black truncate max-w-[120px]">{vehicle.driver_name || 'Standby'}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            onClick={() => setEditingVehicle(vehicle)}
                                            className="py-4 bg-white/5 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                                        >
                                            管理资料
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteVehicle(vehicle.id)}
                                            className="py-4 bg-rose-500/5 text-rose-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-500/10 hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                                        >
                                            删除车辆
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                </div>
            </main>

            {/* --- Modals & Overlays --- */}

            {/* Dispatch Sticky Action (Floating UI) */}
            {selectedOrderForAssignment && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[95%] max-w-[700px] z-50 animate-in slide-in-from-bottom-12 duration-700">
                    <div className="bg-white text-slate-900 p-8 md:p-10 rounded-[3.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-white/20 flex flex-col md:flex-row items-center gap-8 backdrop-blur-2xl">
                        <div className="w-16 h-16 rounded-[2rem] bg-indigo-600 flex items-center justify-center shrink-0 shadow-lg animate-bounce">
                            <span className="material-icons-round text-3xl text-white">bolt</span>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-1">正在指派任务 MISSION ASSIGNMENT</p>
                            <h4 className="text-xl font-black text-slate-900 line-clamp-1">派送至: {selectedOrderForAssignment.customerName || '未知客户'}</h4>
                        </div>
                        <button 
                            onClick={() => setSelectedOrderForAssignment(null)} 
                            className="px-8 py-4 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-widest hover:bg-rose-500 transition-all active:scale-90"
                        >
                            取消指派
                        </button>
                    </div>
                </div>
            )}

            {/* Add Vehicle Modal */}
            {showAddVehicle && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setShowAddVehicle(false)}></div>
                    <div className="relative w-full max-w-[600px] bg-slate-900 border border-white/10 rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 rounded-[2.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                <span className="material-icons-round text-4xl">add_road</span>
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tight">注册新资产</h2>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-3">Enroll new logistic vehicle into system</p>
                            </div>
                            
                            <div className="w-full space-y-6 pt-10">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-2">车牌号码 PLATE NO.</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-950 border border-white/5 rounded-2xl px-8 py-5 text-white font-mono text-lg font-black focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-800"
                                        placeholder="E.G. ABC 1234"
                                        value={newVehicle.plate_no}
                                        onChange={e => setNewVehicle({...newVehicle, plate_no: e.target.value.toUpperCase()})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-2">品牌型号 MODEL</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-8 py-5 text-white font-black focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-800"
                                            placeholder="Brand & Model"
                                            value={newVehicle.model}
                                            onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-2">类型 TYPE</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-8 py-5 text-white font-black focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-800"
                                            placeholder="Lorry / Van"
                                            value={newVehicle.type}
                                            onChange={e => setNewVehicle({...newVehicle, type: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-2">ROAD TAX 到期日期</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-slate-950 border border-white/5 rounded-2xl px-8 py-5 text-white font-black focus:outline-none focus:border-indigo-500 transition-all font-mono"
                                        value={newVehicle.road_tax_expiry}
                                        onChange={e => setNewVehicle({...newVehicle, road_tax_expiry: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 w-full pt-10">
                                <button onClick={() => setShowAddVehicle(false)} className="flex-1 py-5 bg-white/5 text-slate-400 rounded-3xl text-[11px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">取消</button>
                                <button onClick={handleAddVehicle} className="flex-[2] py-5 bg-indigo-600 text-white rounded-3xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all">确认注册 REGISTER</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Vehicle Modal */}
            {assigningVehicleTo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setAssigningVehicleTo(null)}></div>
                    <div className="relative w-full max-w-[600px] bg-slate-900 border border-white/10 rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                <span className="material-icons-round text-4xl">local_shipping</span>
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tight">绑定车队资产</h2>
                                <p className="text-[11px] text-indigo-500 font-black uppercase tracking-[0.4em] mt-3">Assigning Vehicle to {assigningVehicleTo.name}</p>
                            </div>
                            
                            <div className="w-full space-y-6 pt-10 text-left">
                                <div className="flex items-center justify-between px-2">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">选择可用车辆 SELECT AVAILABLE</h4>
                                    <div className="relative flex-1 max-w-[200px] ml-4">
                                        <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                                        <input 
                                            type="text" 
                                            className="w-full bg-white/5 border border-white/5 rounded-xl px-9 py-2 text-[10px] text-white focus:outline-none focus:border-indigo-500 transition-all"
                                            placeholder="筛选车牌"
                                            value={vehicleSearchQuery}
                                            onChange={e => setVehicleSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                                    {availableVehicles.length > 0 ? availableVehicles.map(v => (
                                        <button 
                                            key={v.id}
                                            onClick={() => handleAssignVehicle(v.id)}
                                            className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 hover:bg-indigo-600 hover:border-indigo-500 group transition-all text-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="material-icons-round text-indigo-500 group-hover:text-white transition-colors">directions_car</span>
                                                <div>
                                                    <p className="text-sm font-black text-white font-mono tracking-widest group-hover:text-white">{v.plate_no}</p>
                                                    <p className="text-[9px] font-bold text-slate-500 group-hover:text-white/60 uppercase">{v.model}</p>
                                                </div>
                                            </div>
                                            <span className="material-icons-round text-slate-600 group-hover:text-white opacity-0 group-hover:opacity-100 transition-all">chevron_right</span>
                                        </button>
                                    )) : (
                                        <div className="p-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                            <p className="text-sm font-black text-slate-600 uppercase tracking-widest">没有找到可用车辆</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button onClick={() => setAssigningVehicleTo(null)} className="w-full py-5 bg-white/5 text-slate-400 rounded-3xl text-[11px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all mt-6">取消操作</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Vehicle Modal */}
            {editingVehicle && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setEditingVehicle(null)}></div>
                    <div className="relative w-full max-w-[600px] bg-slate-900 border border-white/10 rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center text-center space-y-8">
                            <div className="w-20 h-20 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                <span className="material-icons-round text-4xl">folder_shared</span>
                            </div>
                            <h2 className="text-3xl font-black text-white tracking-tight">资产信息管理</h2>
                            
                            <div className="w-full space-y-6 pt-4 text-left">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">车牌号码 Plate No</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-5 text-white font-mono font-black focus:outline-none focus:border-indigo-500 transition-all"
                                            value={editingVehicle.plate_no}
                                            onChange={e => setEditingVehicle({...editingVehicle, plate_no: e.target.value.toUpperCase()})}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">资产状态 Status</label>
                                        <select 
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-indigo-500 transition-all appearance-none"
                                            value={editingVehicle.status}
                                            onChange={e => setEditingVehicle({...editingVehicle, status: e.target.value as any})}
                                        >
                                            <option value="available">Available (空闲)</option>
                                            <option value="busy">Busy (占位中)</option>
                                            <option value="repair">Repair (维修中)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">ROAD TAX 到期日 EXPIRY</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-indigo-500 transition-all font-mono"
                                        value={editingVehicle.road_tax_expiry?.split('T')[0] || ''}
                                        onChange={e => setEditingVehicle({...editingVehicle, road_tax_expiry: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 w-full pt-10">
                                <button onClick={() => setEditingVehicle(null)} className="flex-1 py-5 bg-white/5 text-slate-400 rounded-3xl text-[11px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">取消</button>
                                <button onClick={() => handleUpdateVehicle(editingVehicle)} className="flex-[2] py-5 bg-indigo-600 text-white rounded-3xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all">更新系统纪录 UPDATE ASSET</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverList;
