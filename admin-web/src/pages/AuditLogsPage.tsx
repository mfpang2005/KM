import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminService } from '../services/api';
import type { AuditLog } from '../types';
import { supabase } from '../lib/supabase';

/**
 * 格式化审计日志摘要，将其转化为更具可读性的自然语言
 */
const formatLogSummary = (log: AuditLog) => {
    const detail = log.detail || {};
    const target = log.target || '未知目标';

    switch (log.action) {
        case 'order_create':
            return `创建了新订单 ${target}`;
        case 'order_update':
            return `修改了订单 ${target} 的信息`;
        case 'order_status_change':
            return `将订单 ${target} 的状态变更为 "${detail.status || '未知'}"`;
        case 'order_assign_driver':
            return `为订单 ${target} 指派了司机 ${detail.driverId || '未知'}`;
        case 'order_unassign_driver':
            return `移除了订单 ${target} 的指派司机`;
        case 'order_item_prepared':
            return `确认订单 ${target} 中的单品已准备就绪`;
        case 'order_update_photos':
            return `更新了订单 ${target} 的配送存档照片 (${detail.photo_count || 0} 张)`;
        case 'kitchen_complete':
            return `确认订单 ${target} 厨房制作完成，等待出发`;
        case 'update_user':
            return `更新了用户 ${target} 的权限或状态`;
        case 'update_user_profile':
            return `用户 ${target} 更新了个人资料`;
        case 'update_user_status':
            return `变更了用户 ${target} 的账户状态`;
        case 'create_internal_user':
            return `在系统中创建了新成员 ${detail.email || target}`;
        case 'delete_user':
            return `删除了用户账号 ${target}`;
        case 'create_vehicle':
            return `添加了新车辆 ${target}`;
        case 'update_vehicle':
            return `调整了车辆 ${target} 的资料`;
        case 'delete_vehicle':
            return `注销了车辆 ${target}`;
        case 'assign_vehicle':
            return `执行了车辆 ${target} 的出车指派`;
        case 'unassign_vehicle':
            return `撤回了车辆 ${target} 的指派`;
        case 'create_product':
            return `新增了产品 ${target}`;
        case 'update_product':
            return `修改了产品 ${target} 的价格或属性`;
        case 'delete_product':
            return `下架并删除了产品 ${target}`;
        case 'create_customer':
            return `登记了新客户 ${target}`;
        case 'update_customer':
            return `更新了客户 ${target} 的联系方式或偏好`;
        case 'delete_customer':
            return `移除了客户 ${target} 的记录`;
        case 'create_recipe':
            return `创建了 ${target} 的配方标准`;
        case 'update_recipe':
            return `优化了 ${target} 的配方细节`;
        case 'delete_recipe':
            return `删除了 ${target} 的配方存档`;
        case 'update_config':
            return `修改了系统配置项: ${target}`;
        case 'reset_data':
            return `执行了危险的全局数据重置操作`;
        default:
            return `${log.action.replace(/_/g, ' ')} 操作作用于 ${target}`;
    }
};

export const AuditLogsPage: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [actionFilter, setActionFilter] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [rtStatus, setRtStatus] = useState<'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | 'CONNECTING'>('CONNECTING');
    const pageSize = 12;

    const loadLogs = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
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
            if (!isSilent) setLoading(false);
        }
    }, [page, actionFilter, searchTerm]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const channel = supabase
            .channel('audit-logs-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'audit_logs' },
                () => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        loadLogs(true);
                    }, 1500);
                }
            )
            .subscribe((status) => {
                setRtStatus(status);
            });

        return () => {
            clearTimeout(timeoutId);
            supabase.removeChannel(channel);
        };
    }, [loadLogs]);

    const totalPages = Math.ceil(total / pageSize);

    const actionTheme: Record<string, { color: string, icon: string, bg: string, text: string }> = {
        order_create: { color: 'bg-emerald-500', icon: 'add_shopping_cart', bg: 'bg-emerald-50/50', text: 'text-emerald-600' },
        order_update: { color: 'bg-amber-500', icon: 'edit_note', bg: 'bg-amber-50/50', text: 'text-amber-600' },
        order_delete: { color: 'bg-rose-500', icon: 'delete_sweep', bg: 'bg-rose-50/50', text: 'text-rose-600' },
        order_status_change: { color: 'bg-cyan-500', icon: 'sync_alt', bg: 'bg-cyan-50/50', text: 'text-cyan-600' },
        order_assign_driver: { color: 'bg-indigo-500', icon: 'local_shipping', bg: 'bg-indigo-50/50', text: 'text-indigo-600' },
        order_unassign_driver: { color: 'bg-slate-500', icon: 'person_remove', bg: 'bg-slate-50/50', text: 'text-slate-600' },
        order_item_prepared: { color: 'bg-emerald-500', icon: 'restaurant_menu', bg: 'bg-emerald-50/50', text: 'text-emerald-600' },
        order_update_photos: { color: 'bg-indigo-500', icon: 'photo_camera', bg: 'bg-indigo-50/50', text: 'text-indigo-600' },
        kitchen_complete: { color: 'bg-teal-500', icon: 'done_all', bg: 'bg-teal-50/50', text: 'text-teal-600' },
        update_user: { color: 'bg-blue-500', icon: 'manage_accounts', bg: 'bg-blue-50/50', text: 'text-blue-600' },
        create_internal_user: { color: 'bg-emerald-500', icon: 'person_add', bg: 'bg-emerald-50/50', text: 'text-emerald-600' },
        update_config: { color: 'bg-purple-500', icon: 'settings_suggest', bg: 'bg-purple-50/50', text: 'text-purple-600' },
        reset_data: { color: 'bg-slate-900', icon: 'warning', bg: 'bg-red-50/50', text: 'text-red-600' },
    };

    const actionTypes = [
        { value: '', label: '全部操作' },
        { value: 'order_create', label: '订单: 新建' },
        { value: 'order_update', label: '订单: 更新' },
        { value: 'order_status_change', label: '订单: 状态流转' },
        { value: 'order_item_prepared', label: '厨房: 单品就绪' },
        { value: 'order_update_photos', label: '配送: 上传存档' },
        { value: 'update_user', label: '用户: 权限变更' },
        { value: 'update_config', label: '系统: 参数调整' },
    ];

    return (
        <div className="min-h-screen bg-[#FDFDFF] pb-20">
            {/* Header Section with Glassmorphism Title */}
            <div className="relative mb-12">
                <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-blue-50/50 to-transparent -z-10"></div>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                                <span className="material-icons-round text-[28px]">history_edu</span>
                            </span>
                            <span className="px-4 py-1.5 bg-white border border-slate-100 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm">
                                System Audit Trail
                            </span>
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider backdrop-blur-sm border ${
                                rtStatus === 'SUBSCRIBED' ? 'bg-emerald-50/80 text-emerald-600 border-emerald-100' : 'bg-red-50/80 text-red-600 border-red-100'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                    rtStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                                }`}></span>
                                {rtStatus === 'SUBSCRIBED' ? 'Live' : rtStatus}
                            </div>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight leading-none">
                            审计日志 <span className="text-primary font-serif italic text-3xl">.</span>
                        </h1>
                        <p className="text-slate-400 font-bold text-sm max-w-md">
                            透明化追踪系统每一个角落的变动，确保数据安全与流程可溯。
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Total Records</p>
                            <p className="text-3xl font-black text-slate-800 tabular-nums">{total}</p>
                        </div>
                        <button 
                            onClick={() => loadLogs()}
                            className="w-14 h-14 bg-white border-2 border-slate-50 flex items-center justify-center rounded-2xl text-slate-400 hover:text-primary hover:border-primary/20 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-200/40"
                        >
                            <span className={`material-icons-round text-[24px] ${loading ? 'animate-spin text-primary' : ''}`}>refresh</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Glass Filters Bar */}
            <div className="sticky top-6 z-30 bg-white/70 backdrop-blur-2xl p-4 rounded-3xl border border-white/50 shadow-2xl shadow-slate-200/30 mb-8 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full group">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 material-icons-round text-slate-300 text-[20px] group-focus-within:text-primary transition-colors">search</span>
                    <input
                        type="text"
                        placeholder="搜索目标对象 ID 或 操作人..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-14 pr-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-[20px] text-sm focus:bg-white focus:border-primary/10 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-slate-300 font-bold"
                    />
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-56">
                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            className="w-full pl-6 pr-12 py-4 bg-slate-50/50 border-2 border-transparent rounded-[20px] text-sm font-black text-slate-600 focus:bg-white focus:border-primary/10 transition-all appearance-none cursor-pointer"
                        >
                            {actionTypes.map(at => (
                                <option key={at.value} value={at.value}>{at.label}</option>
                            ))}
                        </select>
                        <span className="absolute right-5 top-1/2 -translate-y-1/2 material-icons-round text-slate-300 pointer-events-none">expand_more</span>
                    </div>
                </div>
            </div>

            {/* Logs List Container */}
            <div className="space-y-6 relative">
                {loading && logs.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-[200px] bg-white rounded-[32px] border border-slate-100 animate-pulse"></div>
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-24 text-center">
                        <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <span className="material-icons-round text-[48px] text-slate-200">auto_stories</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-700">暂无相关日志</h3>
                        <p className="text-sm text-slate-400 mt-2 font-bold uppercase tracking-widest">Everything is operating smoothly</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {logs.map((log, index) => {
                                const theme = actionTheme[log.action] || { color: 'bg-slate-400', icon: 'bolt', bg: 'bg-slate-50', text: 'text-slate-600' };
                                return (
                                    <div 
                                        key={log.id} 
                                        className="group bg-white hover:bg-slate-900 transition-all duration-700 rounded-[35px] p-7 border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-slate-900/40 relative overflow-hidden flex flex-col justify-between"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        {/* Background Glow */}
                                        <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full ${theme.color} opacity-[0.03] blur-3xl group-hover:opacity-20 transition-opacity`}></div>
                                        
                                        <div>
                                            <div className="flex items-center justify-between mb-6">
                                                <div className={`w-12 h-12 rounded-2xl ${theme.bg} ${theme.text} flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-6`}>
                                                    <span className="material-icons-round text-[24px]">{theme.icon}</span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-slate-300 group-hover:text-slate-500 uppercase tracking-widest mb-1">Timeline</p>
                                                    <p className="text-xs font-black text-slate-600 group-hover:text-slate-200 tabular-nums">
                                                        {new Date(log.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>

                                            <h4 className="text-[15px] font-black text-slate-800 group-hover:text-white leading-relaxed mb-4 min-h-[44px]">
                                                {formatLogSummary(log)}
                                            </h4>
                                            
                                            <div className="flex flex-wrap gap-2 mb-6">
                                                <span className={`px-3 py-1 text-[9px] font-black rounded-lg border uppercase tracking-wider ${theme.bg} ${theme.text} border-transparent`}>
                                                    {log.action.replace('_', ' ')}
                                                </span>
                                                <span className="px-3 py-1 text-[9px] font-black rounded-lg bg-slate-50 text-slate-400 border border-transparent group-hover:bg-white/5 group-hover:text-slate-500 transition-colors">
                                                    {new Date(log.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-slate-50 group-hover:border-white/10 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">
                                                    {log.actor_role?.[0]?.toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-slate-300 group-hover:text-slate-600 uppercase tracking-tighter">Actor</span>
                                                    <span className="text-[11px] font-black text-slate-800 group-hover:text-slate-300 max-w-[120px] truncate">{log.actor_id}</span>
                                                </div>
                                            </div>
                                            
                                            {log.detail && Object.keys(log.detail).length > 0 && (
                                                <button 
                                                    className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-white/10 flex items-center justify-center text-slate-400 group-hover:text-primary transition-all hover:scale-110"
                                                    title="View Details"
                                                    onClick={() => console.log(log.detail)}
                                                >
                                                    <span className="material-icons-round text-[18px]">data_object</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination with Youthful Style */}
                        {totalPages > 1 && (
                            <div className="mt-16 flex items-center justify-center gap-3">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-400 rounded-2xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"
                                >
                                    <span className="material-icons-round">arrow_back_ios_new</span>
                                </button>
                                
                                <div className="px-8 py-3 bg-white rounded-[20px] text-xs font-black text-slate-800 border border-slate-100 shadow-sm">
                                    <span className="text-primary text-sm mr-2">{page}</span>
                                    <span className="text-slate-300 mx-2">OF</span>
                                    <span className="text-slate-400">{totalPages}</span>
                                </div>

                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-400 rounded-2xl disabled:opacity-30 hover:bg-primary hover:text-white transition-all shadow-sm"
                                >
                                    <span className="material-icons-round">arrow_forward_ios</span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .grid > div {
                    animation: slideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    opacity: 0;
                }
            `}</style>
        </div>
    );
};
