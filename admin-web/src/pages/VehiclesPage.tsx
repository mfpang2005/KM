import React, { useState, useEffect } from 'react';
import { VehicleService } from '../services/api';
import type { Vehicle } from '../types';

export const VehiclesPage: React.FC = () => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Partial<Vehicle> | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadVehicles = async () => {
        try {
            setLoading(true);
            const data = await VehicleService.getAll();
            setVehicles(data);
        } catch (error) {
            console.error('Failed to load vehicles', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVehicles();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingVehicle) return;

        try {
            if (editingVehicle.id) {
                await VehicleService.update(editingVehicle.id, editingVehicle);
            } else {
                await VehicleService.create(editingVehicle);
            }
            setEditModalOpen(false);
            loadVehicles();
        } catch (error) {
            console.error('Failed to save vehicle', error);
            alert('Failed to save vehicle');
        }
    };

    /** 删除车辆 */
    const handleDelete = async (id: string, plateNo: string) => {
        if (!window.confirm(`确定要删除车辆 ${plateNo} 吗？此操作不可撤销。`)) return;
        setDeletingId(id);
        try {
            await VehicleService.delete(id);
            setVehicles(prev => prev.filter(v => v.id !== id));
        } catch (error) {
            console.error('Failed to delete vehicle', error);
            alert('删除失败，请重试');
        } finally {
            setDeletingId(null);
        }
    };

    const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
        switch (status) {
            case 'available':
                return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black tracking-widest uppercase"><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> 可用</span>;
            case 'busy':
                return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black tracking-widest uppercase"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse"></span> 占用中</span>;
            case 'repair':
                return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-black tracking-widest uppercase"><span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span> 维修中</span>;
            default:
                return null;
        }
    };

    // 检查路税是否在30天内到期
    const checkRoadTaxWarning = (expiryDate?: string) => {
        if (!expiryDate) return false;
        const expiry = new Date(expiryDate);
        const today = new Date();
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 30;
    };

    // 检查路税是否已过期
    const checkRoadTaxExpired = (expiryDate?: string) => {
        if (!expiryDate) return false;
        const expiry = new Date(expiryDate);
        const today = new Date();
        return expiry < today;
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">车辆监控面板</h1>
                    <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">
                        Vehicle Dashboard
                    </p>
                </div>
                <button
                    onClick={() => {
                        setEditingVehicle({ status: 'available' });
                        setEditModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-slate-900/20"
                >
                    <span className="material-icons-round">add</span>
                    新增车辆
                </button>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 border-b-2 border-slate-900 rounded-full"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                    {vehicles.map(vehicle => {
                        const isWarning = checkRoadTaxWarning(vehicle.road_tax_expiry);
                        const isExpired = checkRoadTaxExpired(vehicle.road_tax_expiry);

                        return (
                            <div
                                key={vehicle.id}
                                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group relative overflow-hidden"
                                onClick={() => {
                                    setEditingVehicle(vehicle);
                                    setEditModalOpen(true);
                                }}
                            >
                                {/* 警告条 */}
                                {(isWarning || isExpired) && (
                                    <div className={`absolute top-0 left-0 right-0 py-1.5 px-4 flex items-center justify-center gap-1.5 ${isExpired ? 'bg-red-500' : 'bg-amber-500'} text-white text-[10px] font-black uppercase tracking-widest z-10 shadow-sm`}>
                                        <span className="material-icons-round text-[12px]">warning</span>
                                        {isExpired ? '路税已过期！禁止指派' : '⚠️ 防违规：路税即将到期！'}
                                    </div>
                                )}

                                <div className={`flex justify-between items-start mb-6 ${(isWarning || isExpired) ? 'mt-4' : ''}`}>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 tabular-nums tracking-tight">
                                            {vehicle.plate_no}
                                        </h3>
                                        <p className="text-xs font-bold text-slate-400 mt-1">{vehicle.model || '未登记车型'}</p>
                                    </div>
                                    <StatusIndicator status={vehicle.status} />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-50 border border-slate-100/50">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <span className="material-icons-round text-[14px]">local_shipping</span> 车型
                                        </span>
                                        <span className="text-xs font-black text-slate-700">{vehicle.type || '-'}</span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-50 border border-slate-100/50">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <span className="material-icons-round text-[14px]">event</span> 路税/年审
                                        </span>
                                        <span className={`text-xs font-black ${isExpired ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-slate-700'}`}>
                                            {vehicle.road_tax_expiry || '未设置'}
                                        </span>
                                    </div>
                                </div>

                                {/* 操作按钮组：悬停时出现 */}
                                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* 编辑 */}
                                    <div className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                                        <span className="material-icons-round text-[16px]">edit</span>
                                    </div>
                                    {/* 删除 */}
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleDelete(vehicle.id, vehicle.plate_no);
                                        }}
                                        disabled={deletingId === vehicle.id}
                                        className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                                        title="删除车辆"
                                    >
                                        {deletingId === vehicle.id
                                            ? <span className="material-icons-round text-[16px] animate-spin">autorenew</span>
                                            : <span className="material-icons-round text-[16px]">delete</span>}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* 编辑/新增弹窗 */}
            {isEditModalOpen && editingVehicle && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-black text-slate-800 text-lg">
                                {editingVehicle.id ? '编辑车辆信息' : '新增车辆'}
                            </h3>
                            <button
                                onClick={() => setEditModalOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
                            >
                                <span className="material-icons-round text-[18px]">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">车牌号 (Plate Numbuer)</label>
                                <input
                                    required
                                    type="text"
                                    value={editingVehicle.plate_no || ''}
                                    onChange={e => setEditingVehicle({ ...editingVehicle, plate_no: e.target.value.toUpperCase() })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-bold text-sm"
                                    placeholder="例如: JAA 1234"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">品牌/型号</label>
                                    <input
                                        type="text"
                                        value={editingVehicle.model || ''}
                                        onChange={e => setEditingVehicle({ ...editingVehicle, model: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-bold text-sm"
                                        placeholder="例如: Toyota Hiace"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">车辆类型</label>
                                    <select
                                        value={editingVehicle.type || ''}
                                        onChange={e => setEditingVehicle({ ...editingVehicle, type: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-bold text-sm appearance-none"
                                    >
                                        <option value="">请选择...</option>
                                        <option value="Van">Van (货车)</option>
                                        <option value="Lorry">Lorry (罗里)</option>
                                        <option value="Car">Car (轿车)</option>
                                        <option value="Motorcycle">Motorcycle (摩托)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">当前状态</label>
                                    <select
                                        value={editingVehicle.status || 'available'}
                                        onChange={e => setEditingVehicle({ ...editingVehicle, status: e.target.value as 'available' | 'busy' | 'repair' })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-bold text-sm appearance-none"
                                    >
                                        <option value="available">🟢 可用 (Available)</option>
                                        <option value="busy">🔴 占用中 (Busy)</option>
                                        <option value="repair">🟡 维修中 (Repair)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">路税/年审到期日</label>
                                    <input
                                        type="date"
                                        value={editingVehicle.road_tax_expiry || ''}
                                        onChange={e => setEditingVehicle({ ...editingVehicle, road_tax_expiry: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-bold text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">备注说明</label>
                                <textarea
                                    value={editingVehicle.notes || ''}
                                    onChange={e => setEditingVehicle({ ...editingVehicle, notes: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-bold text-sm resize-none h-24"
                                    placeholder="车辆额外备注信息..."
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                {/* 编辑模式下显示删除按钮 */}
                                {editingVehicle.id && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditModalOpen(false);
                                            handleDelete(editingVehicle.id!, editingVehicle.plate_no || '');
                                        }}
                                        disabled={deletingId === editingVehicle.id}
                                        className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-2xl font-black text-sm transition-colors flex items-center gap-1"
                                    >
                                        <span className="material-icons-round text-[16px]">delete</span>
                                        删除
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setEditModalOpen(false)}
                                    className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-sm transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-slate-900/20 active:scale-95"
                                >
                                    保存车辆
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
