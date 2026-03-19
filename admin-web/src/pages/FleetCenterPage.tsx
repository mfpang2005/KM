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
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'fleet' | 'inventory'>('fleet');
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rtStatus, setRtStatus] = useState<string>('CONNECTING');

    // Add Driver/Vehicle states
    const [showAddVehicle, setShowAddVehicle] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState<Order | null>(null);
    const [isAssigningOrder, setIsAssigningOrder] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [newVehicle, setNewVehicle] = useState<Partial<Vehicle>>({ 
        plate_no: '', 
        model: '', 
        type: 'Van', 
        status: 'available',
        road_tax_expiry: ''
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');

    const loadData = useCallback(async () => {
        try {
            const [fleetData, vehiclesData, ordersRes] = await Promise.all([
                FleetService.getFleetStatus(),
                VehicleService.getAll(),
                api.get('/orders').catch(() => ({ data: [] })) // Resilient to orders failure
            ]);

            const allOrders: Order[] = ('status' in ordersRes && ordersRes.status === 200) ? (ordersRes.data as Order[]) : (ordersRes.data as Order[] || []);
            const today = new Date().toISOString().split('T')[0];

            // Filter pending orders (READY/PREPARING/PENDING but no driver assigned)
            const pending = allOrders.filter(o => 
                (o.status === OrderStatus.READY || o.status === OrderStatus.PREPARING || o.status === OrderStatus.PENDING) && 
                !o.driverId
            );
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
            // If it was PENDING or PREPARING, it's now READY for delivery once assigned? 
            // Or keep it as is. User wanted "assgin 好订单 要制作一个可以发给客人订单和司机已经出发whatsapp的模板和按钮"
            // I'll keep the status as is if it's already PREPARING/READY, but if it was PENDING maybe move to READY?
            // Actually, keep it simple: just assign driver.
            await api.patch(`/orders/${selectedOrderForAssignment.id}`, { 
                driverId, 
                // status: OrderStatus.DELIVERING  // Removed auto-change to DELIVERING so driver can manully start
            });
            setSelectedOrderForAssignment(null);
            loadData();
        } catch (e: any) {
            alert(`指派订单失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigningOrder(false);
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
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        const itemsList = order.items.map(m => `- ${m.product_name || m.name} (x${m.quantity})`).join('%0A');
        const message = `[金龙餐饮] 订单详情确认%0A----------------------%0A订单编号: ${order.order_number || order.id.slice(0, 8)}%0A客户姓名: ${order.customerName}%0A配送地址: ${order.address}%0A%0A订购项目:%0A${itemsList}%0A%0A合计金额: RM ${(order.amount || 0).toFixed(2)}%0A----------------------%0A感谢您的订购！如有疑问请联系我们。`;
        
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const handleWhatsAppDeparture = async (order: Order) => {
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        const message = `[金龙餐饮] 出发通知%0A----------------------%0A尊敬的 ${order.customerName}，您的订单 ${order.order_number || order.id.slice(0, 8)} 司机已整装出发！%0A%0A预计近期送达，请保持电话畅通。%0A配送地址: ${order.address}%0A%0A祝您用餐愉快！`;
        
        // 自动更新状态为已出发 (Auto-update status to DELIVERING)
        try {
            await api.patch(`/orders/${order.id}`, { 
                status: OrderStatus.DELIVERING 
            });
            loadData();
        } catch (e: any) {
            console.error('自动更新出发状态失败:', e);
        }

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

    if (loading) return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-50/30">
            <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="material-icons-round text-blue-600 text-xl">local_shipping</span>
                </div>
            </div>
            <p className="mt-4 text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Initializing Fleet Data...</p>
        </div>
    );

    if (error) return (
        <div className="h-screen flex flex-col items-center justify-center gap-6 bg-slate-50/30 p-6 text-center">
            <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center">
                <span className="material-icons-round text-5xl text-red-500">cloud_off</span>
            </div>
            <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-800">Connection Failed</h2>
                <p className="text-slate-500 font-bold max-w-sm">{error}</p>
            </div>
            <button 
                onClick={loadData}
                className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-900/20 active:scale-95 flex items-center gap-2"
            >
                <span className="material-icons-round text-sm">refresh</span>
                Try Reconecting
            </button>
        </div>
    );

    return (
        <div className="min-h-full pt-6 pb-20 space-y-10 animate-in fade-in duration-500">
            {/* High-Impact Dashboard Header */}
            <div className="relative group p-1 tracking-tight">
                {/* Background Accent */}
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5 rounded-[4rem] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>

                <div className="relative flex flex-col xl:flex-row items-center justify-between gap-8 bg-white/60 backdrop-blur-3xl border border-white p-8 xl:p-12 rounded-[3.5rem] shadow-2xl shadow-slate-900/5">
                    <div className="space-y-8 flex-1 w-full text-center xl:text-left">
                        <div className="space-y-3">
                            <div className="flex items-center justify-center xl:justify-start gap-4 mb-2">
                                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
                                    <span className="material-icons-round text-2xl">fleet_manage</span>
                                </div>
                                <h1 className="text-5xl 2xl:text-6xl font-black text-slate-900 tracking-tighter">
                                    车队管理 <span className="text-blue-600">Fleet Control</span>
                                </h1>
                            </div>
                            <p className="text-slate-400 font-bold text-sm 2xl:text-base tracking-wide max-w-xl mx-auto xl:mx-0">
                                Monitor real-time driver availability, vehicle assets, and dispatch upcoming missions.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center xl:justify-start gap-3">
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-sm border transition-all ${
                                rtStatus === 'SUBSCRIBED' ? 'bg-emerald-50/80 text-emerald-600 border-emerald-100' : 'bg-red-50/80 text-red-600 border-red-100'
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${
                                    rtStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'
                                }`}></span>
                                {rtStatus === 'SUBSCRIBED' ? 'Live Sync Active' : `Sync: ${rtStatus}`}
                            </div>
                            <button 
                                onClick={() => setShowAddVehicle(true)}
                                className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 shadow-xl shadow-slate-900/20"
                            >
                                <span className="material-icons-round text-sm">add_circle</span>
                                Enroll Vehicle
                            </button>
                        </div>
                    </div>
                    
                    {/* Stats Dashboard */}
                    <div className="flex flex-wrap items-center justify-center gap-4 xl:gap-6">
                        <div className="bg-slate-50/50 border border-white p-6 2xl:p-8 rounded-[2.5rem] shadow-xl shadow-slate-900/5 flex flex-col items-center gap-3 min-w-[170px] hover:bg-white transition-colors cursor-default group/stat">
                            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100 group-hover/stat:scale-110 transition-transform">
                                <span className="material-icons-round text-xl">person_search</span>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-black text-slate-800 font-mono italic leading-none">{stats.activeDrivers}</p>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">在线司机 Active</p>
                            </div>
                        </div>
                        <div className="bg-slate-50/50 border border-white p-6 2xl:p-8 rounded-[2.5rem] shadow-xl shadow-slate-900/5 flex flex-col items-center gap-3 min-w-[170px] hover:bg-white transition-colors cursor-default group/stat">
                            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-purple-500 shadow-sm border border-purple-100 group-hover/stat:scale-110 transition-transform">
                                <span className="material-icons-round text-xl">local_shipping</span>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-black text-slate-800 font-mono italic leading-none">{stats.availableVehicles}</p>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">空闲载具 Idle</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Control Bar: Search & View Switcher */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/50 p-3 rounded-[2.5rem] border border-slate-100">
                <div className="flex bg-white p-1.5 rounded-[1.8rem] shadow-sm border border-slate-100 w-full md:w-auto self-stretch md:self-auto">
                    <button 
                        onClick={() => setViewMode('fleet')}
                        className={`flex-1 md:flex-none px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${
                            viewMode === 'fleet' ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10' : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <span className="material-icons-round text-sm">departure_board</span>
                        Fleet Status
                    </button>
                    <button 
                        onClick={() => setViewMode('inventory')}
                        className={`flex-1 md:flex-none px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${
                            viewMode === 'inventory' ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10' : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <span className="material-icons-round text-sm">inventory</span>
                        Vehicle Assets
                    </button>
                </div>

                <div className="relative w-full md:w-96 group">
                    <span className="material-icons-round absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">search</span>
                    <input 
                        type="text"
                        placeholder={viewMode === 'fleet' ? "Search Drivers or Plates..." : "Search Vehicle Plates..."}
                        value={viewMode === 'fleet' ? searchQuery : vehicleSearchQuery}
                        onChange={(e) => viewMode === 'fleet' ? setSearchQuery(e.target.value) : setVehicleSearchQuery(e.target.value)}
                        className="w-full pl-14 pr-6 py-4 bg-white border border-slate-100 rounded-[1.8rem] text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition-all placeholder:text-slate-300"
                    />
                </div>
            </div>

            {viewMode === 'fleet' ? (
                <>
                    {/* Mission Pool (Pending Orders) */}
                    {pendingOrders.length > 0 && (
                        <div className="space-y-6 animate-in slide-in-from-top-4 duration-700">
                            <div className="flex items-center justify-between px-4">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">待指派任务池 <span className="text-blue-600 ml-2">Mission Pool</span></h2>
                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black border border-blue-100/50">{pendingOrders.length}</span>
                                </div>
                                <div className="h-px flex-1 mx-10 bg-slate-100"></div>
                            </div>

                            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-4 px-4 mask-fade-right">
                                {pendingOrders.map(order => (
                                    <div 
                                        key={order.id} 
                                        className={`min-w-[320px] bg-white border p-7 rounded-[3rem] shadow-xl transition-all flex flex-col gap-6 group relative overflow-hidden ${
                                            selectedOrderForAssignment?.id === order.id ? 'border-blue-600 ring-4 ring-blue-100 scale-95' : 'border-slate-50 hover:border-blue-200'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{order.order_number || order.id.slice(0, 8)}</span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest italic">{order.status}</span>
                                                </div>
                                                <h3 className="text-lg font-black text-slate-800 line-clamp-1">{order.customerName}</h3>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center min-w-[50px]">
                                                <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Due</p>
                                                <p className="text-sm font-black text-slate-800 font-mono leading-none">
                                                    {order.dueTime ? new Date(order.dueTime).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                                            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-blue-500 shadow-sm border border-slate-50 shrink-0">
                                                <span className="material-icons-round text-lg">near_me</span>
                                            </div>
                                            <p className="text-[11px] font-bold text-slate-500 leading-snug line-clamp-2">{order.address}</p>
                                        </div>

                                        <button 
                                            onClick={() => {
                                                if (selectedOrderForAssignment?.id === order.id) {
                                                    setSelectedOrderForAssignment(null);
                                                } else {
                                                    setSelectedOrderForAssignment(order);
                                                    document.getElementById('fleet-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                }
                                            }}
                                            className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${
                                                selectedOrderForAssignment?.id === order.id 
                                                ? 'bg-red-50 text-red-600 border border-red-100 shadow-sm' 
                                                : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:scale-105'
                                            }`}
                                        >
                                            <span className="material-icons-round text-sm">{selectedOrderForAssignment?.id === order.id ? 'close' : 'assignment_ind'}</span>
                                            {selectedOrderForAssignment?.id === order.id ? 'Cancel Selection' : 'Assign Mission'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fleet List */}
                    <div id="fleet-list" className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-10">
                        {filteredDrivers.map(driver => (
                            <div 
                                key={driver.id} 
                                className={`group relative bg-white border rounded-[3rem] p-1 shadow-2xl transition-all duration-500 hover:-translate-y-2 ${
                                    selectedOrderForAssignment ? 'border-blue-200 ring-8 ring-blue-50/50' : 'border-slate-50'
                                }`}
                            >
                                <div className="bg-slate-900 rounded-[2.8rem] p-8 xl:p-10 relative overflow-hidden h-full flex flex-col">
                                    {/* Accent background */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full group-hover:bg-blue-500/20 transition-all pointer-events-none"></div>
                                    
                                    <div className="relative flex flex-col lg:flex-row gap-8 items-start flex-1">
                                        {/* Driver Identity */}
                                        <div className="flex flex-row lg:flex-col items-center lg:items-start gap-5 shrink-0">
                                            <div className="relative">
                                                <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 overflow-hidden shadow-inner group-hover:scale-105 transition-transform duration-500">
                                                    {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="material-icons-round text-4xl">person</span>}
                                                </div>
                                                <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-xl border-4 border-slate-900 flex items-center justify-center shadow-xl ${driver.activeOrders.length > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                                    <span className="material-icons-round text-white text-[16px]">{driver.activeOrders.length > 0 ? 'local_shipping' : 'potted_plant'}</span>
                                                </div>
                                            </div>
                                            <div className="text-left lg:text-left">
                                                <h3 className="text-xl font-black text-white tracking-tight">{driver.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="material-icons-round text-blue-400 text-xs">settings_phone</span>
                                                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{driver.phone || 'NO PHONE'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Operational Info */}
                                        <div className="flex-1 space-y-6 w-full">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 backdrop-blur-md group-hover:bg-white/10 transition-colors">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Asset</p>
                                                    <p className="text-sm font-black text-white font-mono tracking-widest leading-none">
                                                        {driver.activeAssignment?.vehicle ? driver.activeAssignment.vehicle.plate_no : '---'}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-slate-400 mt-2 truncate opacity-50 italic">
                                                        {driver.activeAssignment?.vehicle?.model || 'UNASSIGNED'}
                                                    </p>
                                                </div>
                                                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 backdrop-blur-md group-hover:bg-white/10 transition-colors">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Today's Load</p>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl font-black text-white font-mono leading-none">{driver.completedToday}</span>
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Done</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Mission Section */}
                                            <div className="space-y-3">
                                                {driver.activeOrders.length > 0 ? (
                                                    driver.activeOrders.map(o => (
                                                        <div key={o.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3 group/mission hover:bg-white/10 transition-all">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">#{o.order_number || o.id.slice(0,8)}</span>
                                                                </div>
                                                                <span className="text-[9px] font-black text-slate-500 uppercase px-2 py-0.5 rounded-md bg-white/5">{o.status}</span>
                                                            </div>
                                                            <p className="text-xs font-bold text-white line-clamp-1">{o.customerName}</p>
                                                            
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <button 
                                                                    onClick={() => handleWhatsAppOrderDetails(o)}
                                                                    className="py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[9px] font-black uppercase tracking-tighter hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-1"
                                                                >
                                                                    <span className="material-icons-round text-sm">info</span>
                                                                    Detail
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleWhatsAppDeparture(o)}
                                                                    className="py-2 bg-blue-500/10 text-blue-500 rounded-xl text-[9px] font-black uppercase tracking-tighter hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-1"
                                                                >
                                                                    <span className="material-icons-round text-sm">rocket</span>
                                                                    Depart
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleUnassignOrder(o.id)}
                                                                    className="py-2 bg-red-500/10 text-red-500 rounded-xl text-[9px] font-black uppercase tracking-tighter hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-1"
                                                                >
                                                                    <span className="material-icons-round text-sm">backspace</span>
                                                                    Return
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/[0.02] text-slate-500 text-[10px] font-black uppercase tracking-widest border border-dashed border-white/10">
                                                        <span className="material-icons-round text-sm">hourglass_empty</span>
                                                        Standby Mode
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between gap-4">
                                        {selectedOrderForAssignment ? (
                                            <button 
                                                disabled={isAssigningOrder}
                                                onClick={() => handleAssignOrder(driver.id)}
                                                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-2 animate-pulse"
                                            >
                                                <span className="material-icons-round text-sm">task_alt</span>
                                                Assign Mission To {driver.name?.split(' ')[0] || 'Driver'}
                                            </button>
                                        ) : (
                                            <>
                                                <button 
                                                    onClick={() => setAssigningVehicleTo(driver)}
                                                    className="flex-1 py-4 bg-white text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-icons-round text-sm">key</span>
                                                    Update Vehicle
                                                </button>
                                                <button className="w-14 h-14 bg-white/5 hover:bg-white/10 text-slate-400 rounded-2xl flex items-center justify-center transition-all border border-white/5">
                                                    <span className="material-icons-round text-xl">settings</span>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                /* Vehicle Inventory View (车辆盘点) */
                <div className="space-y-8 animate-in fade-in duration-700">
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">资产管理中心 <span className="text-blue-600 ml-2">Vehicle Asset Manager</span></h2>
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black border border-slate-200">{filteredVehicles.length}</span>
                        </div>
                        <div className="h-px flex-1 mx-10 bg-slate-100"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
                        {filteredVehicles.map(v => (
                            <div key={v.id} className="bg-white border border-slate-50 p-7 rounded-[3rem] shadow-xl hover:border-blue-500/20 transition-all group relative flex flex-col gap-8">
                                <div className="flex items-center justify-between relative">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white group-hover:bg-blue-600 group-hover:rotate-12 transition-all shadow-xl shadow-slate-900/10 shrink-0">
                                        <span className="material-icons-round text-2xl">
                                            {v.type === 'Van' ? 'local_shipping' : v.type === 'Truck' ? 'fire_truck' : v.type === 'Motorcycle' ? 'moped' : 'directions_car'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 text-right">
                                        <div className={`relative px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-colors shadow-sm ${
                                            v.status === 'available' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            v.status === 'busy' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                            'bg-red-50 text-red-600 border-red-100'
                                        }`}>
                                            {v.status === 'available' ? '● Ready' : v.status === 'busy' ? '○ Active' : '⚠ Action Needed'}
                                            <select 
                                                className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                                                value={v.status}
                                                onChange={(e) => handleUpdateVehicleStatus(v.id, e.target.value as any)}
                                            >
                                                <option value="available">Available</option>
                                                <option value="busy">Busy</option>
                                                <option value="repair">Repair</option>
                                            </select>
                                        </div>
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                                            Status: <span className="text-slate-500">{v.status}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-1 text-center">
                                    <h3 className="text-2xl font-black text-slate-900 font-mono tracking-widest">{v.plate_no}</h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2">
                                        {v.model || 'GENERIC'} 
                                        <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                        <span className="text-blue-600 font-bold">{v.type}</span>
                                    </p>
                                </div>
                                
                                <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <span className="material-icons-round text-slate-400 text-lg">event_repeat</span>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter leading-none">Road Tax</p>
                                            <p className="text-[11px] font-bold text-slate-600 font-mono whitespace-nowrap">{v.road_tax_expiry || 'No Expiry Set'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button 
                                            onClick={() => setEditingVehicle(v)}
                                            className="w-10 h-10 rounded-xl bg-white text-slate-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-slate-200/50"
                                        >
                                            <span className="material-icons-round text-sm">edit</span>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteVehicle(v.id)}
                                            className="w-10 h-10 rounded-xl bg-white text-slate-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm border border-slate-200/50"
                                        >
                                            <span className="material-icons-round text-sm">delete</span>
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
