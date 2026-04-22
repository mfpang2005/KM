import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FleetService, VehicleService, api } from '../services/api';
import type { Vehicle, DriverAssignment, Order } from '../types';
import { OrderStatus } from '../types';

interface FleetDriver {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    employee_id?: string;
    activeAssignment?: DriverAssignment & { vehicle: Vehicle };
    activeOrders: Order[];
    completedToday: number;
}

export const FleetCenterPage: React.FC = () => {
    const navigate = useNavigate();
    // const { user } = useAuth(); // Removed unused auth
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'fleet' | 'inventory'>('fleet');
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    // Removed unused isAssigning and error states
    const [rtStatus, setRtStatus] = useState<string>('CONNECTING');
    const scrollRef = useRef<HTMLDivElement>(null);


    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth / 2 : scrollLeft + clientWidth / 2;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    const [showAddVehicle, setShowAddVehicle] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState<Order | null>(null);
    // Removed unused isAssigningOrder state
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [newVehicle, setNewVehicle] = useState<Partial<Vehicle>>({ 
        plate_no: '', 
        model: '', 
        type: 'Van', 
        status: 'available',
        road_tax_expiry: '',
        manufacturing_date: '',
        insurance_company: ''
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');

    const loadData = useCallback(async () => {
        try {
            const [fleetData, vehiclesData, ordersRes] = await Promise.all([
                FleetService.getFleetStatus(),
                VehicleService.getAll(),
                api.get('/orders').catch(() => ({ data: [] }))
            ]);

            const allOrders: Order[] = ('status' in ordersRes && ordersRes.status === 200) ? (ordersRes.data as Order[]) : (ordersRes.data as Order[] || []);
            const today = new Date().toISOString().split('T')[0];

            const pending = allOrders.filter(o => 
                (o.status === OrderStatus.READY || o.status === OrderStatus.PREPARING || o.status === OrderStatus.PENDING) && 
                !o.driverId
            );
            setPendingOrders(pending);

            const mappedDrivers: FleetDriver[] = (fleetData || [])
                .filter((d: any) => d.status !== 'deleted' && d.status !== 'pending' && d.is_disabled !== true)
                .map((d: any) => {
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
            // unset error
        } catch (error) {
            console.error('Failed to load fleet data', error);
            // setError removed
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
        activeDrivers: drivers.filter(d => 
            d.name?.trim() && 
            d.activeOrders.some(o => o.status === OrderStatus.DELIVERING)
        ).length,
        availableVehicles: vehicles.filter(v => v.status === 'available').length
    }), [drivers, vehicles]);

    const handleAssignVehicle = async (vehicleId: string) => {
        if (!assigningVehicleTo) return;
        // setIsAssigning(true) removed
        try {
            await VehicleService.assignToDriver(assigningVehicleTo.id, vehicleId);
            setAssigningVehicleTo(null);
            loadData();
        } catch (e: any) {
            alert(`指派失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            // setIsAssigning(false) removed
        }
    };

    const handleAddVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await VehicleService.create(newVehicle);
            setShowAddVehicle(false);
            setNewVehicle({ plate_no: '', model: '', type: 'Van', status: 'available', road_tax_expiry: '', manufacturing_date: '', insurance_company: '' });
            loadData();
        } catch (e: any) {
            alert(`添加失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteVehicle = async (id: string) => {
        if (!window.confirm('确定要删除吗？')) return;
        try {
            await VehicleService.delete(id);
            loadData();
        } catch (e: any) {
            alert(`删除失败: ${e.response?.data?.detail || e.message}`);
        }
    };

    const handleUpdateVehicleStatus = async (vehicleId: string, newStatus: string) => {
        // setIsAssigning(true) removed
        try {
            await api.put(`/vehicles/${vehicleId}`, { status: newStatus });
            loadData();
        } catch (e: any) {
            alert(`状态更新失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            // setIsAssigning(false) removed
        }
    };

    const handleAssignOrder = async (driverId: string) => {
        if (!selectedOrderForAssignment) return;
        // setIsAssigningOrder(true) removed
        try {
            await api.patch(`/orders/${selectedOrderForAssignment.id}`, { driverId });
            setSelectedOrderForAssignment(null);
            loadData();
        } catch (e: any) {
            alert(`指派失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            // setIsAssigningOrder(false) removed
        }
    };

    const handleUnassignOrder = async (orderId: string) => {
        if (!window.confirm('确定要退回此订单吗？')) return;
        try {
            await api.patch(`/orders/${orderId}`, { driverId: null });
            loadData();
        } catch (e: any) {
            alert(`退回失败: ${e.response?.data?.detail || e.message}`);
        }
    };

    const handleWhatsAppDeparture = async (order: Order) => {
        const cleanPhone = order.customerPhone.replace(/\D/g, '');
        const message = `[金龙餐饮] 出发通知%0A----------------------%0A尊敬的 ${order.customerName}，您的订单 ${order.order_number || order.id.slice(0, 8)} 司机已整装出发！%0A%0A预计近期送达，请保持电话畅通。%0A配送地址: ${order.address}%0A%0A祝您用餐愉快！`;
        try {
            await api.patch(`/orders/${order.id}`, { status: OrderStatus.DELIVERING });
            loadData();
        } catch (e: any) {
            console.error('状态更新失败:', e);
        }
        const url = `https://wa.me/60${cleanPhone.replace(/^60/, '').replace(/^0/, '')}?text=${message}`;
        window.open(url, '_blank');
    };

    const filteredDrivers = useMemo(() => {
        return drivers.filter(d => {
            if (!d.name || d.name.trim() === '') return false;
            const displayName = String(d.name || d.employee_id || d.phone || d.email || 'UNNAMED DRIVER');
            return displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                   String(d.phone || '').includes(searchQuery) ||
                   String(d.activeAssignment?.vehicle?.plate_no || '').toLowerCase().includes(searchQuery.toLowerCase());
        });
    }, [drivers, searchQuery]);

    const filteredVehicles = useMemo(() => {
        return vehicles.filter(v => 
            v.plate_no?.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) || 
            v.model?.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
        );
    }, [vehicles, vehicleSearchQuery]);

    const formatOrderTime = (order: Order, includeDate = true) => {
        let date = order.dueTime ? new Date(order.dueTime) : null;
        
        if (!date || isNaN(date.getTime())) {
            if (order.eventDate && order.eventTime) {
                let dateStr = order.eventDate;
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                        dateStr = `${year}-${parts[1]}-${parts[0]}`;
                    }
                }
                date = new Date(`${dateStr}T${order.eventTime}`);
            }
        }
        
        if (!date || isNaN(date.getTime())) {
            date = order.created_at ? new Date(order.created_at) : null;
        }

        if (!date || isNaN(date.getTime())) return '--:--';
        
        const timeStr = date.toLocaleTimeString('en-MY', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
        });

        if (includeDate) {
            const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            return `${dateStr} ${timeStr}`;
        }
        
        return timeStr;
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50/10"><div className="w-10 h-10 border-2 border-blue-500 border-t-transparent animate-spin rounded-full"></div></div>;

    return (
        <div className="mt-10 mx-auto max-w-[1600px] px-4 py-4 space-y-4 animate-in fade-in duration-500 text-slate-800 flex flex-col uppercase">

            {/* Dashboard Header - Compact */}
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-4 bg-white/60 backdrop-blur-3xl border border-white p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                        <span className="material-icons-round text-lg">local_shipping</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black tracking-tighter">车队控制 <span className="text-blue-600">Fleet Control</span></h1>
                            <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black animate-pulse">ULTRA V2</span>
                        </div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{rtStatus === 'SUBSCRIBED' ? '● Live Sync Active' : '○ Synchronizing...'}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                        <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 flex items-center gap-2">
                            <span className="text-sm font-black text-slate-700">{stats.activeDrivers}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">出车司机</span>
                        </div>
                        <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 flex items-center gap-2">
                            <span className="text-sm font-black text-slate-700">{stats.availableVehicles}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">空闲车辆</span>
                        </div>
                    </div>
                    {viewMode === 'inventory' && (
                        <button 
                            onClick={() => setShowAddVehicle(true)}
                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-600 transition-all flex items-center gap-2"
                        >
                            <span className="material-icons-round text-sm">add</span>
                            New Vehicle
                        </button>
                    )}
                </div>
            </div>

            {/* View Switcher & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
                <div className="flex bg-slate-100 p-1.5 rounded-xl w-full sm:w-auto">
                    <button onClick={() => setViewMode('fleet')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'fleet' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>Fleet</button>
                    <button onClick={() => setViewMode('inventory')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'inventory' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>Car Inventory</button>
                </div>
                <div className="relative w-full sm:w-72">
                    <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-[18px]">search</span>
                    <input 
                        type="text"
                        placeholder="Search..."
                        value={viewMode === 'fleet' ? searchQuery : vehicleSearchQuery}
                        onChange={(e) => viewMode === 'fleet' ? setSearchQuery(e.target.value) : setVehicleSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-2 bg-white border border-slate-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                    />
                </div>
            </div>

            {viewMode === 'fleet' ? (
                <div className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                    Distribution Pool <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md ml-1 text-[10px]">{pendingOrders.length}</span>
                                </h2>
                                <div className="flex gap-1.5 ml-4 no-print-area">
                                    <button onClick={() => scroll('left')} className="w-7 h-7 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 shadow-sm"><span className="material-icons-round text-base">chevron_left</span></button>
                                    <button onClick={() => scroll('right')} className="w-7 h-7 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 shadow-sm"><span className="material-icons-round text-base">chevron_right</span></button>
                                </div>
                            </div>
                            <div className="h-px flex-1 mx-4 bg-slate-100"></div>
                        </div>

                        <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2 -mx-2 px-2 scroll-smooth">
                            {pendingOrders.map(order => (
                                <div key={order.id} className={`min-w-[150px] bg-white border p-2.5 rounded-xl shadow-sm transition-all flex flex-col gap-1.5 relative ${selectedOrderForAssignment?.id === order.id ? 'border-blue-600 bg-blue-50/10 shadow-blue-100' : 'border-slate-100'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-black text-blue-600 truncate opacity-80 uppercase tracking-[0.05em]">#{order.order_number || order.id.slice(0, 6)}</p>
                                            <h3 className="text-sm font-black text-slate-800 truncate leading-tight mt-0.5 capitalize">{order.customerName}</h3>
                                        </div>
                                        <div className="bg-amber-50/50 px-2 py-1 rounded-md border border-amber-100/50 shrink-0 flex flex-col items-end">
                                            <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest leading-none mb-0.5">活动日期和时间</span>
                                            <p className="text-[10px] font-black text-amber-600 font-mono leading-none">{formatOrderTime(order)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-500 line-clamp-1 leading-snug bg-slate-50/50 px-1.5 py-0.5 rounded-md mb-0.5 pb-0.5">{order.address}</p>
                                    <button onClick={() => selectedOrderForAssignment?.id === order.id ? setSelectedOrderForAssignment(null) : setSelectedOrderForAssignment(order)} className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 mt-auto ${selectedOrderForAssignment?.id === order.id ? 'bg-red-500 text-white' : 'bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700'}`}>
                                        {selectedOrderForAssignment?.id === order.id ? 'CANCEL' : 'ASSIGN'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div id="fleet-list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 pb-12 mt-3">
                        {filteredDrivers.map(driver => (
                            <div key={driver.id} className={`p-4 border rounded-2xl shadow-sm flex flex-col gap-3 group transition-all ${driver.activeOrders.length > 0 ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-800 border-slate-200'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-xl font-black truncate leading-tight ${driver.activeOrders.length > 0 ? 'text-white' : 'text-slate-800'}`}>{driver.name || driver.employee_id || driver.phone || (driver.email ? driver.email.split('@')[0] : 'UNNAMED')}</h3>
                                        {driver.activeAssignment?.vehicle ? (
                                            <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${driver.activeOrders.length > 0 ? 'bg-blue-500/20 border-blue-400/20 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                                                <span className="material-icons-round text-[14px]">local_shipping</span>
                                                <span className="text-xs font-black uppercase tracking-wider">{driver.activeAssignment.vehicle.plate_no}</span>
                                            </div>
                                        ) : (
                                            <div className={`mt-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${driver.activeOrders.length > 0 ? 'text-slate-500 bg-white/5' : 'text-slate-400 bg-slate-50'}`}>
                                                <span className="material-icons-round text-[12px]">no_crash</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest">No Vehicle</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-3xl font-black text-cyan-400 font-mono italic leading-none">{driver.completedToday || 0}</p>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">COMPLETED</p>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-1">
                                    {driver.activeOrders.length > 0 ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-xs font-black uppercase tracking-[0.15em] text-blue-400/80">{driver.activeOrders.length} ORDERS ASSIGNED</span>
                                            </div>
                                            {driver.activeOrders.map(o => (
                                                <div key={o.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5 hover:bg-white/10 transition-colors">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="font-black text-blue-300 uppercase tracking-tight text-[13px]">#{o.order_number || o.id.slice(0,6)} • <span className="text-white/80 shrink-0">{o.status === 'ready' ? 'Distribution' : o.status === 'preparing' ? 'Kitchen Process' : o.status}</span></span>
                                                            <span className="text-[10px] font-black text-slate-400 font-mono italic">{formatOrderTime(o)}</span>
                                                        </div>
                                                        <div className="flex gap-2 text-base shrink-0 items-center justify-end">
                                                            <span onClick={() => navigate(`/orders?search=${o.order_number || o.id}`)} className="material-icons-round text-white/40 cursor-pointer hover:text-blue-400 transition-colors" title="Order Details">info_outline</span>
                                                            <span onClick={() => handleWhatsAppDeparture(o)} className="material-icons-round text-blue-400 cursor-pointer hover:scale-110 transition-transform" title="WhatsApp Delivery Notice">send</span>
                                                            <span onClick={() => handleUnassignOrder(o.id)} className="material-icons-round text-red-400 cursor-pointer hover:text-red-500 transition-colors" title="Unassign Driver">close</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] font-black text-white/90 truncate leading-tight capitalize bg-white/5 px-2 py-1 rounded-md border border-white/5">{o.customerName}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-4 text-center border-2 border-dashed border-slate-200/50 rounded-xl text-xs font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-50/50">Standby Area</div>
                                    )}
                                </div>

                                <div className="mt-auto pt-3 border-t border-slate-100/10 flex gap-2">
                                    {selectedOrderForAssignment ? (
                                        <button onClick={() => handleAssignOrder(driver.id)} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-[0.1em] hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5 animate-pulse shadow-md shadow-blue-600/20">Dispatch Order</button>
                                    ) : (
                                        <button onClick={() => setAssigningVehicleTo(driver)} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-[0.1em] transition-all shadow-sm ${driver.activeOrders.length > 0 ? 'bg-white text-slate-900 hover:bg-blue-500 hover:text-white' : 'bg-slate-900 text-white hover:bg-blue-600 shadow-md shadow-slate-900/10'}`}>Car Inventory</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredVehicles.map(v => {
                        const assignedDriver = drivers.find(d => d.activeAssignment?.vehicle_id === v.id);
                        const driverName = assignedDriver ? (assignedDriver.name || assignedDriver.employee_id || assignedDriver.phone || (assignedDriver.email ? assignedDriver.email.split('@')[0] : 'UNNAMED')) : 'UNNAMED DRIVER';
                        return (
                        <div key={v.id} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col justify-between relative overflow-hidden">
                            {/* Decorative background element */}
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700 ease-out z-0"></div>
                            
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="relative group/dropdown">
                                        {/* Status Badge - triggers dropdown on hover/focus */}
                                        <div 
                                            tabIndex={0} 
                                            className={`relative cursor-pointer px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] border-2 transition-all shadow-sm flex items-center gap-1.5 ${
                                            v.status === 'available' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:shadow-emerald-200/50' : 
                                            v.status === 'repair' ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:shadow-amber-200/50' :
                                            'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:shadow-rose-200/50'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                v.status === 'available' ? 'bg-emerald-500 animate-pulse' : 
                                                v.status === 'repair' ? 'bg-amber-500' :
                                                'bg-rose-500'
                                            }`}></span>
                                            <span className="mt-px leading-none">{v.status === 'available' ? 'READY' : v.status === 'repair' ? 'REPAIR' : 'ON ROAD'}</span>
                                            <span className="material-icons-round text-[12px] opacity-50 group-hover/dropdown:rotate-180 transition-transform">expand_more</span>
                                        </div>
                                        
                                        {/* Custom Dropdown Menu */}
                                        <div className="absolute top-full left-0 mt-2 w-36 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-100 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible group-focus-within/dropdown:opacity-100 group-focus-within/dropdown:visible transition-all duration-300 z-50 overflow-hidden transform origin-top-left scale-95 group-hover/dropdown:scale-100 group-focus-within/dropdown:scale-100">
                                            <div className="p-1.5 flex flex-col gap-1">
                                                <button 
                                                    onClick={(e) => { e.currentTarget.blur(); handleUpdateVehicleStatus(v.id, 'available'); }} 
                                                    className={`w-full text-left px-3 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all outline-none ${v.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50 hover:text-emerald-600'}`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${v.status === 'available' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                                    Ready
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.currentTarget.blur(); handleUpdateVehicleStatus(v.id, 'busy'); }} 
                                                    className={`w-full text-left px-3 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all outline-none ${v.status === 'busy' ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-50 hover:text-rose-600'}`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${v.status === 'busy' ? 'bg-rose-500' : 'bg-slate-300'}`}></span>
                                                    On Road
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.currentTarget.blur(); handleUpdateVehicleStatus(v.id, 'repair'); }} 
                                                    className={`w-full text-left px-3 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all outline-none ${v.status === 'repair' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50 hover:text-amber-600'}`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${v.status === 'repair' ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
                                                    Repair
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50/80 backdrop-blur-sm p-1 rounded-lg border border-slate-100 shadow-sm z-10">
                                        <button onClick={() => { setEditingVehicle(v); setNewVehicle(v); }} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white text-slate-400 hover:text-blue-500 transition-colors"><span className="material-icons-round text-sm">edit</span></button>
                                        <button onClick={() => handleDeleteVehicle(v.id)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white text-slate-400 hover:text-red-500 transition-colors"><span className="material-icons-round text-sm">delete</span></button>
                                    </div>
                                </div>
                                <div className="mt-1">
                                    <div className="inline-block bg-slate-900 px-4 py-2 rounded-xl text-white shadow-inner mb-2">
                                        <p className="text-xl font-black font-mono tracking-widest">{v.plate_no}</p>
                                    </div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{v.model || 'UNKNOWN MODEL'}</p>
                                    {assignedDriver && (
                                        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50/80 border border-blue-100 text-blue-600 w-full sm:w-auto overflow-hidden">
                                            <span className="material-icons-round text-[14px] shrink-0">person</span>
                                            <span className="text-[11px] font-black uppercase tracking-wider truncate" title={driverName}>{driverName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-dashed border-slate-200/60 flex flex-col gap-2 relative z-10">
                                <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
                                    <span className="uppercase tracking-widest">Type</span>
                                    <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{v.type || '-'}</span>
                                </div>
                                {(v.road_tax_expiry || v.manufacturing_date || v.insurance_company) && (
                                    <>
                                        {v.road_tax_expiry && (
                                            <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
                                                <span className="uppercase tracking-widest text-[9px]">Road Tax</span>
                                                <span className="text-slate-700">{v.road_tax_expiry}</span>
                                            </div>
                                        )}
                                        {v.manufacturing_date && (
                                            <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
                                                <span className="uppercase tracking-widest text-[9px]">Mfg Date</span>
                                                <span className="text-slate-700">{v.manufacturing_date}</span>
                                            </div>
                                        )}
                                        {v.insurance_company && (
                                            <div className="flex items-center justify-between text-[11px] font-black text-slate-400">
                                                <span className="uppercase tracking-widest text-[9px]">Insurance</span>
                                                <span className="text-slate-700 truncate max-w-[120px] text-right" title={v.insurance_company}>{v.insurance_company}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                    })}
                </div>
            )}

            {assigningVehicleTo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-800 uppercase italic">Car Inventory</h3>
                            <button onClick={() => setAssigningVehicleTo(null)} className="material-icons-round text-slate-300">close</button>
                        </div>
                        <div className="p-3 max-h-[60vh] overflow-y-auto space-y-2">
                            {vehicles.filter(v => v.status === 'available').map(v => (
                                <div key={v.id} className="p-3 rounded-xl border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer" onClick={() => handleAssignVehicle(v.id)}>
                                    <div><p className="text-sm font-black font-mono tracking-widest">{v.plate_no}</p></div>
                                    <span className="material-icons-round text-blue-500">arrow_forward</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 新增/编辑车辆弹窗 */}
            {(showAddVehicle || editingVehicle) && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">
                                {editingVehicle ? 'Edit Vehicle' : 'New Vehicle'}
                            </h3>
                            <button onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); setNewVehicle({ plate_no: '', model: '', type: 'Van', status: 'available', road_tax_expiry: '', manufacturing_date: '', insurance_company: '' }); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:shadow-sm transition-all text-slate-300 hover:text-slate-600">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <form onSubmit={editingVehicle ? (e) => {
                            e.preventDefault();
                            setIsSubmitting(true);
                            api.put(`/vehicles/${editingVehicle.id}`, newVehicle)
                                .then(() => { setEditingVehicle(null); loadData(); })
                                .catch(err => alert(err.message))
                                .finally(() => setIsSubmitting(false));
                        } : handleAddVehicle} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Plate No.</label>
                                    <input required type="text" value={newVehicle.plate_no} onChange={e => setNewVehicle({...newVehicle, plate_no: e.target.value.toUpperCase()})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" placeholder="WYM 1234" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Type</label>
                                    <select value={newVehicle.type} onChange={e => setNewVehicle({...newVehicle, type: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none">
                                        <option value="Car">Car</option>
                                        <option value="Van">Van</option>
                                        <option value="Lorry">Lorry 1T</option>
                                        <option value="Lorry 3T">Lorry 3T</option>
                                        <option value="Bike">Bike</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Model / Driver Name</label>
                                <input required type="text" value={newVehicle.model || ''} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" placeholder="e.g. Toyota Hiace / John Doe" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Road Tax Expiry</label>
                                    <input type="date" value={newVehicle.road_tax_expiry || ''} onChange={e => setNewVehicle({...newVehicle, road_tax_expiry: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mfg Date</label>
                                    <input type="date" value={newVehicle.manufacturing_date || ''} onChange={e => setNewVehicle({...newVehicle, manufacturing_date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Insurance Company</label>
                                <input type="text" value={newVehicle.insurance_company || ''} onChange={e => setNewVehicle({...newVehicle, insurance_company: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" placeholder="e.g. Allianz, Etiqa..." />
                            </div>
                            <button disabled={isSubmitting} type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-blue-600 disabled:opacity-50 transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98] mt-2">
                                {isSubmitting ? 'Saving...' : 'Confirm Details'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
