import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminService } from '../services/api';
import type { AuditLog } from '../types';

export const AuditLogsPage: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [actionFilter, setActionFilter] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const pageSize = 15;

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            // Note: Now using server-side filtering and searching
            const data = await SuperAdminService.getAuditLogs(
                page, 
                pageSize, 
                actionFilter || undefined, 
                searchTerm || undefined
            );
            
            setLogs(data.data || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to load audit logs', error);
        } finally {
            setLoading(false);
        }
    }, [page, actionFilter, searchTerm]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    const totalPages = Math.ceil(total / pageSize);

    const actionColors: Record<string, string> = {
        update_user: 'border-blue-200 bg-blue-50 text-blue-700',
        update_user_profile: 'border-blue-200 bg-blue-50 text-blue-700',
        delete_user: 'border-red-200 bg-red-50 text-red-700',
        update_user_status: 'border-cyan-200 bg-cyan-50 text-cyan-700',
        create_internal_user: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        update_config: 'border-purple-200 bg-purple-50 text-purple-700',
        order_create: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        order_update: 'border-amber-200 bg-amber-50 text-amber-700',
        order_delete: 'border-rose-200 bg-rose-50 text-rose-700',
        order_status_change: 'border-cyan-200 bg-cyan-50 text-cyan-700',
        order_assign_driver: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        order_unassign_driver: 'border-slate-200 bg-slate-50 text-slate-700',
        order_item_prepared: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        order_update_photos: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        kitchen_complete: 'border-teal-200 bg-teal-50 text-teal-700',
        create_vehicle: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        update_vehicle: 'border-blue-200 bg-blue-50 text-blue-700',
        delete_vehicle: 'border-red-200 bg-red-50 text-red-700',
        assign_vehicle: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        unassign_vehicle: 'border-slate-200 bg-slate-50 text-slate-700',
        create_product: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        update_product: 'border-blue-200 bg-blue-50 text-blue-700',
        delete_product: 'border-red-200 bg-red-50 text-red-700',
        create_customer: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        update_customer: 'border-blue-200 bg-blue-50 text-blue-700',
        delete_customer: 'border-red-200 bg-red-50 text-red-700',
        create_recipe: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        update_recipe: 'border-blue-200 bg-blue-50 text-blue-700',
        delete_recipe: 'border-red-200 bg-red-50 text-red-700',
        reset_data: 'border-slate-900 bg-slate-900 text-white',
    };

    const actionTypes = [
        { value: '', label: 'All Actions' },
        { value: 'order_create', label: 'Order: Create' },
        { value: 'order_update', label: 'Order: Update' },
        { value: 'order_status_change', label: 'Order: Status' },
        { value: 'order_assign_driver', label: 'Order: Assign' },
        { value: 'order_unassign_driver', label: 'Order: Unassign' },
        { value: 'order_item_prepared', label: 'Order: Item Ready' },
        { value: 'order_update_photos', label: 'Order: Photos' },
        { value: 'kitchen_complete', label: 'Order: Ready' },
        { value: 'update_user', label: 'User: Update' },
        { value: 'update_user_profile', label: 'User: Profile Update' },
        { value: 'update_user_status', label: 'User: Status' },
        { value: 'create_internal_user', label: 'User: Create' },
        { value: 'delete_user', label: 'User: Delete' },
        { value: 'create_vehicle', label: 'Vehicle: Create' },
        { value: 'update_vehicle', label: 'Vehicle: Update' },
        { value: 'delete_vehicle', label: 'Vehicle: Delete' },
        { value: 'assign_vehicle', label: 'Vehicle: Assign' },
        { value: 'unassign_vehicle', label: 'Vehicle: Unassign' },
        { value: 'create_product', label: 'Product: Create' },
        { value: 'update_product', label: 'Product: Update' },
        { value: 'delete_product', label: 'Product: Delete' },
        { value: 'create_customer', label: 'Customer: Create' },
        { value: 'update_customer', label: 'Customer: Update' },
        { value: 'delete_customer', label: 'Customer: Delete' },
        { value: 'create_recipe', label: 'Recipe: Create' },
        { value: 'update_recipe', label: 'Recipe: Update' },
        { value: 'delete_recipe', label: 'Recipe: Delete' },
        { value: 'update_config', label: 'System: Config' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Audit Logs</h1>
                    <p className="text-sm text-slate-400 font-bold mt-1 uppercase tracking-widest">System Operation History</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-blue-100/50 shadow-sm">
                        {total} Records
                    </span>
                    <button 
                        onClick={() => loadLogs()}
                        className="p-2 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-primary hover:border-primary transition-all shadow-sm"
                    >
                        <span className="material-icons-round text-[20px]">refresh</span>
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white/60 backdrop-blur-xl p-4 rounded-3xl border border-white shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-[20px]">search</span>
                    <input
                        type="text"
                        placeholder="Search by Target or Actor ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-300 font-bold"
                    />
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="flex-1 md:w-48 px-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-bold text-slate-600 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none"
                    >
                        {actionTypes.map(at => (
                            <option key={at.value} value={at.value}>{at.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                {loading && logs.length === 0 ? (
                    <div className="flex h-96 items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary/20 border-t-primary"></div>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest animate-pulse">Loading Logs</p>
                        </div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-20 text-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <span className="material-icons-round text-4xl text-slate-200">history</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-700">No Logs Found</h3>
                        <p className="text-sm text-slate-400 mt-2 font-bold uppercase tracking-widest">Everything looks quiet here</p>
                    </div>
                ) : (
                    <div className="p-8">
                        <div className="relative border-l-2 border-slate-100 ml-5 space-y-10">
                            {logs.map(log => (
                                <div key={log.id} className="relative pl-10">
                                    <div className={`absolute -left-[11px] top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-md ring-1 ring-slate-100 ${log.action.includes('delete') ? 'bg-rose-500' :
                                            log.action.includes('update_config') ? 'bg-purple-500' :
                                                log.action.includes('approve') || log.action.includes('complete') ? 'bg-emerald-500' : 
                                                log.action.includes('create') ? 'bg-blue-500' : 'bg-slate-400'
                                        }`}></div>

                                    <div className="bg-slate-50/50 hover:bg-white hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 rounded-3xl p-6 border border-slate-100/50 group">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                                            <div className="flex items-center gap-4">
                                                <span className={`px-3 py-1.5 text-[10px] font-black rounded-xl border-2 uppercase tracking-widest ${actionColors[log.action] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {log.action.replace('_', ' ')}
                                                </span>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Target</span>
                                                    <code className="text-sm text-slate-700 font-black">
                                                        {log.target || 'N/A'}
                                                    </code>
                                                </div>
                                            </div>
                                            <span className="text-xs font-black text-slate-400 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
                                                <span className="material-icons-round text-[16px] text-blue-500">schedule</span>
                                                {new Date(log.created_at).toLocaleString('en-MY', { 
                                                    year: 'numeric', month: 'short', day: '2-digit',
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                                    <span className="material-icons-round text-[14px]">person</span>
                                                    Actor Details
                                                </p>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-400">
                                                        {log.actor_role?.[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-700">{log.actor_id}</p>
                                                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">{log.actor_role}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {log.detail && Object.keys(log.detail).length > 0 && (
                                                <div className="bg-slate-900 rounded-2xl p-4 shadow-xl overflow-hidden group-hover:bg-slate-800 transition-colors">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Payload</p>
                                                        <span className="material-icons-round text-[14px] text-slate-600">data_object</span>
                                                    </div>
                                                    <pre className="text-[11px] text-blue-200/80 overflow-x-auto font-mono max-h-40 thin-scrollbar">
                                                        {JSON.stringify(log.detail, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="mt-12 flex items-center justify-center gap-6 pt-8 border-t border-slate-100">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 text-slate-400 rounded-2xl disabled:opacity-30 hover:bg-slate-50 hover:text-primary hover:border-primary transition-all shadow-sm"
                                >
                                    <span className="material-icons-round">chevron_left</span>
                                </button>
                                <div className="px-6 py-2 bg-slate-50 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest border border-slate-100 shadow-inner">
                                    Page {page} <span className="mx-2 text-slate-300">/</span> {totalPages}
                                </div>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 text-slate-400 rounded-2xl disabled:opacity-30 hover:bg-slate-50 hover:text-primary hover:border-primary transition-all shadow-sm"
                                >
                                    <span className="material-icons-round">chevron_right</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <style>{`
                .thin-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .thin-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
};
