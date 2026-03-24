import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();
    const [drivers, setDrivers] = useState<FleetDriver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'fleet' | 'inventory'>('fleet');
    const [assigningVehicleTo, setAssigningVehicleTo] = useState<FleetDriver | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rtStatus, setRtStatus] = useState<string>('CONNECTING');

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
            await api.patch(`/vehicles/${vehicleId}`, { status: newStatus });
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

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50/10"><div className="w-10 h-10 border-2 border-blue-500 border-t-transparent animate-spin rounded-full"></div></div>;

    return (
        <div className="min-h-full py-4 space-y-4 animate-in fade-in duration-500 text-slate-800">
            {/* Dashboard Header - Compact */}
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-4 bg-white/60 backdrop-blur-3xl border border-white p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                        <span className="material-icons-round text-lg">local_shipping</span>
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tighter">车队控制 <span className="text-blue-600">Fleet Control</span></h1>
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
                    <button 
                        onClick={() => setShowAddVehicle(true)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-600 transition-all flex items-center gap-2"
                    >
                        <span className="material-icons-round text-sm">add</span>
                        New Vehicle
                    </button>
                </div>
            </div>

            {/* View Switcher & Search - Compact */}
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
                    {/* Mission Pool - Ultra Compact View for 20-25 orders */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-blue-600"></span>
                                Mission Pool <span className="bg-blue-600 text-white px-1.5 rounded-md ml-1">{pendingOrders.length}</span>
                            </h2>
                            <div className="h-px flex-1 mx-4 bg-slate-100"></div>
                        </div>

                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-2 px-2">
                            {pendingOrders.map(order => (
                                <div 
                                    key={order.id} 
                                    className={`min-w-[164px] bg-white border p-3 rounded-xl shadow-sm transition-all flex flex-col gap-2 relative ${
                                        selectedOrderForAssignment?.id === order.id ? 'border-blue-600 bg-blue-50/30' : 'border-slate-50'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black text-blue-600 truncate">#{order.order_number || order.id.slice(0, 6)}</p>
                                            <h3 className="text-[11px] font-black text-slate-800 truncate leading-none mt-0.5">{order.customerName}</h3>
                                        </div>
                                        <div className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                            <p className="text-[9px] font-black text-slate-700 font-mono italic">
                                                {order.dueTime ? new Date(order.dueTime).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 line-clamp-2 leading-tight bg-slate-50/50 p-1.5 rounded">{order.address}</p>
                                    <button 
                                        onClick={() => {
                                            if (selectedOrderForAssignment?.id === order.id) setSelectedOrderForAssignment(null);
                                            else { setSelectedOrderForAssignment(order); document.getElementById('fleet-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                                        }}
                                        className={`w-full py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                                            selectedOrderForAssignment?.id === order.id ? 'bg-white text-red-600 border border-red-100' : 'bg-blue-600 text-white shadow shadow-blue-600/20'
                                        }`}
                                    >
                                        <span className="material-icons-round text-[12px]">{selectedOrderForAssignment?.id === order.id ? 'close' : 'assignment'}</span>
                                        {selectedOrderForAssignment?.id === order.id ? 'Unsel' : 'Assign'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Fleet List - Multi-column density */}
                    <div id="fleet-list" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 pb-8">
                        {filteredDrivers.map(driver => (
                            <div key={driver.id} className={`p-4 bg-white border rounded-2xl shadow-sm flex flex-col gap-4 group transition-all ${selectedOrderForAssignment ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-100'}`}>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden font-black">
                                            {driver.avatar_url ? <img src={driver.avatar_url} className="w-full h-full object-cover" /> : <span>DR</span>}
                                        </div>
                                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${driver.activeOrders.length > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                            <span className="material-icons-round text-white text-[8px]">{driver.activeOrders.length > 0 ? 'bolt' : 'bedtime'}</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-black text-slate-800 truncate">{driver.name}</h3>
                                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{driver.activeAssignment?.vehicle?.plate_no || 'No Vehicle'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[14px] font-black text-slate-400 font-mono italic">{driver.completedToday}<span className="text-[8px] uppercase not-italic ml-0.5">OK</span></p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {driver.activeOrders.length > 0 ? driver.activeOrders.map(o => (
                                        <div key={o.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100/10 space-y-2">
                                            <div className="flex justify-between items-center text-[9px]">
                                                <span className="font-black text-emerald-600 uppercase tracking-tighter">#{o.order_number || o.id.slice(0,6)} • {o.status}</span>
                                                <div className="flex gap-1.5 text-[14px]">
                                                    <span onClick={() => navigate(`/orders?search=${o.order_number || o.id}`)} className="material-icons-round text-slate-400 cursor-pointer hover:text-blue-500">info_outline</span>
                                                    <span onClick={() => handleWhatsAppDeparture(o)} className="material-icons-round text-blue-500 cursor-pointer hover:scale-110">send</span>
                                                    <span onClick={() => handleUnassignOrder(o.id)} className="material-icons-round text-red-300 cursor-pointer hover:text-red-600">close</span>
                                                </div>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-700 truncate">{o.customerName}</p>
                                        </div>
                                    )) : (
                                        <div className="py-2.5 text-center border border-dashed border-slate-200 rounded-xl text-[9px] font-black text-slate-300 uppercase">Standby Area</div>
                                    )}
                                </div>

                                <div className="mt-auto pt-2 border-t border-slate-50 flex gap-2">
                                    {selectedOrderForAssignment ? (
                                        <button 
                                            disabled={isAssigningOrder}
                                            onClick={() => handleAssignOrder(driver.id)}
                                            className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all flex items-center justify-center gap-2 animate-pulse"
                                        >
                                            <span className="material-icons-round text-sm">bolt</span>
                                            Dispatch Order
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={() => setAssigningVehicleTo(driver)} className="flex-1 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase hover:bg-blue-50 hover:text-blue-600 transition-all">Car Inventory</button>
                                            <button className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"><span className="material-icons-round text-sm">settings</span></button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* Assets View - Compact Grid */
                <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-6 gap-3">
                    {filteredVehicles.map(v => (
                        <div key={v.id} className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm hover:shadow transition-all group">
                            <div className="flex justify-between items-start mb-2">
                                <div className={`relative px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-colors shadow-sm ${
                                    v.status === 'available' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                    'bg-red-50 text-red-600 border-red-100'
                                }`}>
                                    {v.status === 'available' ? 'RDY' : 'OUT'}
                                    <select 
                                        disabled={isAssigning}
                                        className={`opacity-0 absolute inset-0 cursor-pointer w-full h-full ${isAssigning ? 'cursor-wait' : ''}`}
                                        value={v.status}
                                        onChange={(e) => handleUpdateVehicleStatus(v.id, e.target.value)}
                                    >
                                        <option value="available">Ready (RDY)</option>
                                        <option value="busy">Out (OUT)</option>
                                        <option value="repair">Repair (RP)</option>
                                    </select>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditingVehicle(v)} className="material-icons-round text-sm text-slate-300 hover:text-blue-500">edit</button>
                                    <button onClick={() => handleDeleteVehicle(v.id)} className="material-icons-round text-sm text-slate-300 hover:text-red-500">delete</button>
                                </div>
                            </div>
                            <p className="text-sm font-black text-slate-900 font-mono tracking-widest">{v.plate_no}</p>
                            <p className="text-[9px] font-black text-slate-400 truncate uppercase mt-0.5">{v.model}</p>
                            <div className="mt-2 text-[10px] text-slate-300 flex items-center gap-1"><span className="material-icons-round text-[12px]">event</span> {v.road_tax_expiry?.slice(2) || 'NONE'}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals remains unchanged but ensure smaller paddings inside */}
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
                                    <div>
                                        <p className="text-sm font-black font-mono tracking-widest leading-none">{v.plate_no}</p>
                                        <p className="text-[9px] font-bold text-slate-400 mt-1">{v.model} • {v.type}</p>
                                    </div>
                                    <span className="material-icons-round text-blue-500">arrow_forward</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showAddVehicle && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl space-y-4">
                        <h2 className="text-lg font-black text-slate-800">Add Vehicle</h2>
                        <form onSubmit={handleAddVehicle} className="space-y-3">
                            <input required placeholder="Plate No" className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold" value={newVehicle.plate_no} onChange={e => setNewVehicle({...newVehicle, plate_no: e.target.value})} />
                            <input placeholder="Model" className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold" value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} />
                            <select className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold" value={newVehicle.type} onChange={e => setNewVehicle({...newVehicle, type: e.target.value})}>
                                <option value="Van">Van</option><option value="Truck">Truck</option><option value="Motorcycle">Motorcycle</option><option value="Car">Car</option>
                            </select>
                            <input type="date" className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold" value={newVehicle.road_tax_expiry} onChange={e => setNewVehicle({...newVehicle, road_tax_expiry: e.target.value})} />
                            <button disabled={isSubmitting} type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px]">{isSubmitting ? 'Wait...' : 'Create'}</button>
                            <button type="button" onClick={() => setShowAddVehicle(false)} className="w-full py-2 text-slate-400 text-[10px] font-bold uppercase">Cancel</button>
                        </form>
                    </div>
                </div>
            )}

            {editingVehicle && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl space-y-4">
                        <h2 className="text-lg font-black text-slate-800">Edit Vehicle</h2>
                        <form onSubmit={(e) => { e.preventDefault(); if (editingVehicle) api.patch(`/vehicles/${editingVehicle.id}`, editingVehicle).then(() => { setEditingVehicle(null); loadData(); }); }} className="space-y-3">
                            <input required placeholder="Plate No" className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold" value={editingVehicle.plate_no} onChange={e => setEditingVehicle({...editingVehicle, plate_no: e.target.value})} />
                            <input placeholder="Model" className="w-full px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold" value={editingVehicle.model || ''} onChange={e => setEditingVehicle({...editingVehicle, model: e.target.value})} />
                            <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px]">Update</button>
                            <button type="button" onClick={() => setEditingVehicle(null)} className="w-full py-2 text-slate-400 text-[10px] font-bold uppercase">Cancel</button>
                        </form>
                    </div>
                </div>
            )}

            {error && <div className="fixed bottom-4 left-4 right-4 bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase text-center">{error}</div>}
        </div>
    );
};
