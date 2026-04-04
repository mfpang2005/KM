import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FleetService, VehicleService, api } from '../services/api';
import type { Vehicle, DriverAssignment, Order } from '../types';
import { OrderStatus } from '../types';
import { useAuth } from '../hooks/useAuth';


interface FleetDriver {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    activeAssignment?: DriverAssignment & { vehicle: Vehicle };
    activeOrders: Order[];
    completedToday: number;
}

export const FleetCenterPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'fleet' | 'inventory'>('fleet');
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
                api.get('/orders').catch(() => ({ data: [] }))
            ]);

            const allOrders: Order[] = ('status' in ordersRes && ordersRes.status === 200) ? (ordersRes.data as Order[]) : (ordersRes.data as Order[] || []);
            const today = new Date().toISOString().split('T')[0];

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
            setError('获取数据失败');
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
        setIsAssigning(true);
        try {
            await api.put(`/vehicles/${vehicleId}`, { status: newStatus });
            loadData();
        } catch (e: any) {
            alert(`状态更新失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigning(false);
        }
    };

    const handleAssignOrder = async (driverId: string) => {
        if (!selectedOrderForAssignment) return;
        setIsAssigningOrder(true);
        try {
            await api.patch(`/orders/${selectedOrderForAssignment.id}`, { driverId });
            setSelectedOrderForAssignment(null);
            loadData();
        } catch (e: any) {
            alert(`指派失败: ${e.response?.data?.detail || e.message}`);
        } finally {
            setIsAssigningOrder(false);
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
            return d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                   d.phone?.includes(searchQuery) ||
                   d.activeAssignment?.vehicle?.plate_no?.toLowerCase().includes(searchQuery.toLowerCase());
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
                            <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse">ULTRA V2</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{rtStatus === 'SUBSCRIBED' ? '● Live Sync Active' : '○ Synchronizing...'}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                        <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-2">
                            <span className="text-xs font-black text-slate-700">{stats.activeDrivers}</span>
                            <span className="text-[8px] font-black text-slate-400 uppercase">ONLINE</span>
                        </div>
                        <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-2">
                            <span className="text-xs font-black text-slate-700">{stats.availableVehicles}</span>
                            <span className="text-[8px] font-black text-slate-400 uppercase">IDLE</span>
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
                <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                    <button onClick={() => setViewMode('fleet')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'fleet' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>Fleet</button>
                    <button onClick={() => setViewMode('inventory')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'inventory' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>Car Inventory</button>
                </div>
                <div className="relative w-full sm:w-64">
                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm">search</span>
                    <input 
                        type="text"
                        placeholder="Search..."
                        value={viewMode === 'fleet' ? searchQuery : vehicleSearchQuery}
                        onChange={(e) => viewMode === 'fleet' ? setSearchQuery(e.target.value) : setVehicleSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
                    />
                </div>
            </div>

            {viewMode === 'fleet' ? (
                <div className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-1 h-1 rounded-full bg-blue-600"></span>
                                    Mission Pool <span className="bg-blue-600 text-white px-1.5 rounded-md ml-1">{pendingOrders.length}</span>
                                </h2>
                                <div className="flex gap-1 ml-4 no-print-area">
                                    <button onClick={() => scroll('left')} className="w-6 h-6 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 shadow-sm"><span className="material-icons-round text-sm">chevron_left</span></button>
                                    <button onClick={() => scroll('right')} className="w-6 h-6 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 shadow-sm"><span className="material-icons-round text-sm">chevron_right</span></button>
                                </div>
                            </div>
                            <div className="h-px flex-1 mx-4 bg-slate-100"></div>
                        </div>

                        <div ref={scrollRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1.5 -mx-2 px-2 scroll-smooth">
                            {pendingOrders.map(order => (
                                <div key={order.id} className={`min-w-[135px] bg-white border p-2 rounded-lg shadow-sm transition-all flex flex-col gap-1 relative ${selectedOrderForAssignment?.id === order.id ? 'border-blue-600 bg-blue-50/10' : 'border-slate-100'}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 pr-1">
                                            <p className="text-[9px] font-black text-blue-600 truncate opacity-80 uppercase tracking-tight">#{order.order_number || order.id.slice(0, 6)}</p>
                                            <h3 className="text-[10px] font-black text-slate-800 truncate leading-tight mt-0.5 capitalize">{order.customerName}</h3>
                                        </div>
                                        <div className="bg-slate-50 px-1 py-0.5 rounded border border-slate-100 shrink-0">
                                            <p className="text-[8px] font-black text-slate-700 font-mono">{formatOrderTime(order)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[8px] font-bold text-slate-400 line-clamp-1 leading-snug bg-slate-50/50 px-1.5 py-0.5 rounded-md">{order.address}</p>
                                    <button onClick={() => selectedOrderForAssignment?.id === order.id ? setSelectedOrderForAssignment(null) : setSelectedOrderForAssignment(order)} className={`w-full py-1 rounded-md text-[8px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${selectedOrderForAssignment?.id === order.id ? 'bg-red-500 text-white' : 'bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700'}`}>
                                        {selectedOrderForAssignment?.id === order.id ? 'CANCEL' : 'ASSIGN'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div id="fleet-list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-12">
                        {filteredDrivers.map(driver => (
                            <div key={driver.id} className={`p-4 border rounded-2xl shadow-sm flex flex-col gap-4 group transition-all ${driver.activeOrders.length > 0 ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-800 border-slate-200'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-base font-black truncate leading-tight ${driver.activeOrders.length > 0 ? 'text-white' : 'text-slate-800'}`}>{driver.name}</h3>
                                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1 leading-none">{driver.activeAssignment?.vehicle?.plate_no || 'No Vehicle'}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-2xl font-black text-cyan-400 font-mono italic leading-none">{driver.completedToday || 0}</p>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mt-1">COMPLETED</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {driver.activeOrders.length > 0 ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-blue-400/80">{driver.activeOrders.length} ORDERS ASSIGNED</span>
                                            </div>
                                            {driver.activeOrders.map(o => (
                                                <div key={o.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2 hover:bg-white/10 transition-colors">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="font-black text-blue-300 uppercase tracking-tight">#{o.order_number || o.id.slice(0,6)} • {o.status}</span>
                                                            <span className="text-[8px] font-black text-slate-400 font-mono italic">{formatOrderTime(o)}</span>
                                                        </div>
                                                        <div className="flex gap-1.5 text-sm">
                                                            <span onClick={() => navigate(`/orders?search=${o.order_number || o.id}`)} className="material-icons-round text-white/40 cursor-pointer hover:text-blue-400 transition-colors" title="Order Details">info_outline</span>
                                                            <span onClick={() => handleWhatsAppDeparture(o)} className="material-icons-round text-blue-400 cursor-pointer hover:scale-110 transition-transform" title="WhatsApp Delivery Notice">send</span>
                                                            <span onClick={() => handleUnassignOrder(o.id)} className="material-icons-round text-red-400 cursor-pointer hover:text-red-500 transition-colors" title="Unassign Driver">close</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-white/90 truncate leading-none capitalize">{o.customerName}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-2.5 text-center border border-dashed border-slate-200/50 rounded-xl text-[9px] font-black text-slate-400 uppercase tracking-widest">Standby Area</div>
                                    )}
                                </div>

                                <div className="mt-auto pt-3 border-t border-slate-100/10 flex gap-2">
                                    {selectedOrderForAssignment ? (
                                        <button onClick={() => handleAssignOrder(driver.id)} className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5 animate-pulse shadow-lg shadow-blue-600/20">Dispatch Order</button>
                                    ) : (
                                        <button onClick={() => setAssigningVehicleTo(driver)} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${driver.activeOrders.length > 0 ? 'bg-white text-slate-900 hover:bg-blue-500 hover:text-white' : 'bg-slate-900 text-white hover:bg-blue-600'}`}>Car Inventory</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-6 gap-3">
                    {filteredVehicles.map(v => (
                        <div key={v.id} className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm hover:shadow transition-all group">
                            <div className="flex justify-between items-start mb-2">
                                <div className={`relative px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border-2 transition-colors shadow-sm ${
                                    v.status === 'available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                    v.status === 'repair' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                    'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                    {v.status === 'available' ? 'RDY' : v.status === 'repair' ? 'RP' : 'OUT'}
                                    <select className="opacity-0 absolute inset-0 cursor-pointer w-full h-full" value={v.status} onChange={(e) => handleUpdateVehicleStatus(v.id, e.target.value)}>
                                        <option value="available">Ready</option><option value="busy">Out</option><option value="repair">Repair</option>
                                    </select>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditingVehicle(v)} className="material-icons-round text-sm text-slate-300 hover:text-blue-500">edit</button>
                                    <button onClick={() => handleDeleteVehicle(v.id)} className="material-icons-round text-sm text-slate-300 hover:text-red-500">delete</button>
                                </div>
                            </div>
                            <p className="text-sm font-black text-slate-900 font-mono tracking-widest">{v.plate_no}</p>
                            <p className="text-[9px] font-black text-slate-400 truncate uppercase mt-0.5">{v.model}</p>
                        </div>
                    ))}
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
                            <button onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:shadow-sm transition-all text-slate-300 hover:text-slate-600">
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
                                        <option value="Van">Van</option>
                                        <option value="Lorry">Lorry 1T</option>
                                        <option value="Lorry 3T">Lorry 3T</option>
                                        <option value="Bike">Bike</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Model / Driver Name</label>
                                <input required type="text" value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" placeholder="e.g. Toyota Hiace / John Doe" />
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
