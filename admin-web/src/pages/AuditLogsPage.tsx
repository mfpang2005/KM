import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminService } from '../services/api';
import type { AuditLog } from '../types';

export const AuditLogsPage: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const pageSize = 15;

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await SuperAdminService.getAuditLogs(page, pageSize);
            setLogs(data.data || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to load audit logs', error);
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    const totalPages = Math.ceil(total / pageSize);

    const actionColors: Record<string, string> = {
        update_user: 'border-blue-200 bg-blue-50 text-blue-700',
        delete_user: 'border-red-200 bg-red-50 text-red-700',
        update_config: 'border-purple-200 bg-purple-50 text-purple-700',
        approve_order: 'border-green-200 bg-green-50 text-green-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-800">Audit Logs</h1>
                <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold">
                    Total: {total} Records
                </span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {loading && logs.length === 0 ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center">
                        <span className="material-icons-round text-5xl text-slate-200">history</span>
                        <h3 className="text-lg font-bold text-slate-700 mt-4">No Audit Logs</h3>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="relative border-l-2 border-slate-100 ml-4 space-y-8">
                            {logs.map(log => (
                                <div key={log.id} className="relative pl-6">
                                    <div className={`absolute -left-2 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200 ${log.action.includes('delete') ? 'bg-red-500' :
                                            log.action.includes('update_config') ? 'bg-purple-500' :
                                                log.action.includes('approve') ? 'bg-green-500' : 'bg-blue-500'
                                        }`}></div>

                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2.5 py-1 text-xs font-bold rounded border ${actionColors[log.action] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {log.action.replace('_', ' ').toUpperCase()}
                                                </span>
                                                <code className="text-xs text-slate-500 px-2 py-0.5 bg-slate-200/50 rounded">
                                                    Target: {log.target || 'N/A'}
                                                </code>
                                            </div>
                                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                                <span className="material-icons-round text-[14px]">schedule</span>
                                                {new Date(log.created_at).toLocaleString()}
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <p className="text-sm text-slate-600">
                                                <span className="font-bold">Actor:</span> {log.actor_id} <span className="text-xs text-slate-400">({log.actor_role})</span>
                                            </p>

                                            {log.detail && Object.keys(log.detail).length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-xs font-bold text-slate-500 mb-1">Details:</p>
                                                    <pre className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto font-mono">
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
                            <div className="mt-8 flex items-center justify-center gap-4 pt-6 border-t border-slate-100">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-slate-50 transition-colors"
                                >
                                    Previous
                                </button>
                                <span className="text-sm font-bold text-slate-500">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-slate-50 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
