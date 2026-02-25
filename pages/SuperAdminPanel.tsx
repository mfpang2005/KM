import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SuperAdminService } from '../src/services/api';
import { UserRole } from '../types';

// ── 类型定义 ──

interface StatsData {
    total_orders: number;
    total_revenue: number;
    total_users: number;
    orders_by_status: Record<string, number>;
}

interface UserRecord {
    id: string;
    email: string;
    role: string;
    name?: string;
    phone?: string;
    is_disabled?: boolean;
}

interface ConfigItem {
    key: string;
    value: Record<string, unknown>;
    updated_at?: string;
    updated_by?: string;
}

interface AuditLogItem {
    id: string;
    actor_id: string;
    actor_role: string;
    action: string;
    target?: string;
    detail?: Record<string, unknown>;
    created_at: string;
}

// ── 子视图枚举 ──
type SubView = 'overview' | 'users' | 'config' | 'audit';

/**
 * Super Admin 控制台
 * 最高权限管理面板，涵盖统计总览、用户管理、系统配置、审计日志
 */
const SuperAdminPanel: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // NOTE: 根据 URL 路径自动映射到对应子视图
    const currentView = useMemo<SubView>(() => {
        if (location.pathname.includes('/users')) return 'users';
        if (location.pathname.includes('/config')) return 'config';
        if (location.pathname.includes('/audit')) return 'audit';
        return 'overview';
    }, [location.pathname]);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* 顶部标题栏 */}
            <header className="pt-12 pb-4 px-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <span className="material-icons-round text-amber-400">shield</span>
                            超级管理员控制台
                        </h1>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">
                            SUPER ADMIN PANEL · 全局管控
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-[9px] font-bold bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30 uppercase tracking-wider">
                            Super Admin
                        </span>
                    </div>
                </div>

                {/* 子视图导航标签 */}
                <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto no-scrollbar">
                    {([
                        { key: 'overview', label: '总览', icon: 'dashboard', path: '/super-admin' },
                        { key: 'users', label: '用户', icon: 'group', path: '/super-admin/users' },
                        { key: 'config', label: '配置', icon: 'settings', path: '/super-admin/config' },
                        { key: 'audit', label: '日志', icon: 'history', path: '/super-admin/audit' },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => navigate(tab.path)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all whitespace-nowrap ${currentView === tab.key
                                ? 'bg-slate-50 text-slate-900 shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                                }`}
                        >
                            <span className="material-icons-round text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* 内容区域 */}
            <main className="flex-1 overflow-y-auto p-4 no-scrollbar">
                {currentView === 'overview' && <OverviewSection />}
                {currentView === 'users' && <UsersSection />}
                {currentView === 'config' && <ConfigSection />}
                {currentView === 'audit' && <AuditSection />}
            </main>
        </div>
    );
};

// ═══════════════════════════════════════════
// 1. 统计总览
// ═══════════════════════════════════════════

const OverviewSection: React.FC = () => {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const loadStats = async () => {
            try {
                const data = await SuperAdminService.getStats();
                setStats(data);
            } catch (error) {
                console.error('Failed to load stats:', error);
            } finally {
                setLoading(false);
            }
        };
        loadStats();
    }, []);

    const statusLabels: Record<string, string> = {
        pending: '待处理',
        preparing: '准备中',
        ready: '待取餐',
        delivering: '配送中',
        completed: '已完成',
    };

    const statusColors: Record<string, string> = {
        pending: 'bg-slate-100 text-slate-600',
        preparing: 'bg-blue-50 text-blue-600',
        ready: 'bg-purple-50 text-purple-600',
        delivering: 'bg-amber-50 text-amber-600',
        completed: 'bg-green-50 text-green-600',
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 核心指标卡片 */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                        <span className="material-icons-round text-primary text-xl">receipt_long</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">订单总数</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{stats?.total_orders ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
                        <span className="material-icons-round text-green-600 text-xl">payments</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">总营收</p>
                    <p className="text-2xl font-black text-green-600 mt-1">
                        <span className="text-xs font-bold text-green-400">RM</span> {(stats?.total_revenue ?? 0).toLocaleString()}
                    </p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                        <span className="material-icons-round text-blue-600 text-xl">people</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">用户数</p>
                    <p className="text-2xl font-black text-blue-600 mt-1">{stats?.total_users ?? 0}</p>
                </div>
            </div>

            {/* 订单状态分布 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">订单状态分布</h3>
                <div className="space-y-3">
                    {Object.entries(stats?.orders_by_status ?? {}).map(([status, count]) => {
                        const total = stats?.total_orders || 1;
                        const percentage = Math.round((Number(count) / total) * 100);
                        return (
                            <div key={status} className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold w-16 text-center ${statusColors[status] || 'bg-slate-100 text-slate-500'}`}>
                                    {statusLabels[status] || status}
                                </span>
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-500"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                                <span className="text-xs font-bold text-slate-600 w-12 text-right">{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 快捷导航 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">权限操作</h3>
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { icon: 'group', label: '用户管理', desc: '角色分配与权限', path: '/super-admin/users', color: 'bg-blue-50 text-blue-600' },
                        { icon: 'settings', label: '系统配置', desc: '全局参数设置', path: '/super-admin/config', color: 'bg-purple-50 text-purple-600' },
                        { icon: 'history', label: '审计日志', desc: '操作记录追踪', path: '/super-admin/audit', color: 'bg-amber-50 text-amber-600' },
                        { icon: 'list_alt', label: '订单管理', desc: '全局订单查看', path: '/admin/orders', color: 'bg-green-50 text-green-600' },
                    ].map((item, idx) => (
                        <button
                            key={idx}
                            onClick={() => navigate(item.path)}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group active:scale-95 text-left"
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color} transition-transform group-hover:scale-105`}>
                                <span className="material-icons-round text-lg">{item.icon}</span>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-800">{item.label}</p>
                                <p className="text-[10px] text-slate-400">{item.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════
// 2. 用户管理
// ═══════════════════════════════════════════

const UsersSection: React.FC = () => {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editRole, setEditRole] = useState('');

    const loadUsers = useCallback(async () => {
        try {
            const data = await SuperAdminService.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const roleLabels: Record<string, string> = {
        super_admin: '超级管理员',
        admin: '管理员',
        kitchen: '后厨',
        driver: '司机',
    };

    const roleColors: Record<string, string> = {
        super_admin: 'bg-amber-50 text-amber-700 border-amber-200',
        admin: 'bg-primary/5 text-primary border-primary/20',
        kitchen: 'bg-green-50 text-green-700 border-green-200',
        driver: 'bg-blue-50 text-blue-700 border-blue-200',
    };

    /**
     * 保存用户角色修改
     */
    const handleSaveRole = async (userId: string) => {
        try {
            await SuperAdminService.updateUser(userId, { role: editRole });
            setEditingUser(null);
            await loadUsers();
        } catch (error) {
            console.error('Failed to update user:', error);
            alert('修改失败，请重试');
        }
    };

    /**
     * 删除用户（需二次确认）
     */
    const handleDeleteUser = async (userId: string, email: string) => {
        if (!window.confirm(`确认删除用户 ${email}？此操作不可撤销。`)) return;
        try {
            await SuperAdminService.deleteUser(userId);
            await loadUsers();
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('删除失败，请重试');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700">所有用户 ({users.length})</h3>
            </div>

            {users.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                    <span className="material-icons-round text-4xl text-slate-200">person_off</span>
                    <p className="text-xs text-slate-400 mt-2">暂无用户数据</p>
                </div>
            ) : (
                users.map(user => (
                    <div key={user.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                    <span className="material-icons-round text-slate-400">person</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">
                                        {user.name || user.email}
                                    </p>
                                    <p className="text-[10px] text-slate-400">{user.email}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-lg border ${roleColors[user.role] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                {roleLabels[user.role] || user.role}
                            </span>
                        </div>

                        {/* 编辑模式 */}
                        {editingUser === user.id ? (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                                <select
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/10 outline-none"
                                >
                                    <option value="admin">管理员</option>
                                    <option value="kitchen">后厨</option>
                                    <option value="driver">司机</option>
                                    <option value="super_admin">超级管理员</option>
                                </select>
                                <button
                                    onClick={() => handleSaveRole(user.id)}
                                    className="px-3 py-2 bg-primary text-white rounded-xl text-xs font-bold active:scale-95 transition-transform"
                                >
                                    保存
                                </button>
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                                >
                                    取消
                                </button>
                            </div>
                        ) : (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                                <button
                                    onClick={() => { setEditingUser(user.id); setEditRole(user.role); }}
                                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors active:scale-95"
                                >
                                    <span className="material-icons-round text-sm">edit</span>
                                    修改角色
                                </button>
                                <button
                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors active:scale-95"
                                >
                                    <span className="material-icons-round text-sm">delete</span>
                                    删除
                                </button>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
};

// ═══════════════════════════════════════════
// 3. 系统配置
// ═══════════════════════════════════════════

const ConfigSection: React.FC = () => {
    const [configs, setConfigs] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            const data = await SuperAdminService.getConfig();
            setConfigs(data);
        } catch (error) {
            console.error('Failed to load config:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    /**
     * 保存配置修改
     */
    const handleSaveConfig = async (key: string) => {
        try {
            const parsed = JSON.parse(editValue);
            await SuperAdminService.updateConfig(key, parsed);
            setEditingKey(null);
            await loadConfig();
        } catch {
            alert('JSON 格式无效，请检查输入');
        }
    };

    /**
     * 新增配置项
     */
    const handleAddConfig = async () => {
        if (!newKey.trim()) { alert('请输入配置键名'); return; }
        try {
            const parsed = JSON.parse(newValue || '{}');
            await SuperAdminService.updateConfig(newKey.trim(), parsed);
            setNewKey('');
            setNewValue('');
            setShowAddForm(false);
            await loadConfig();
        } catch {
            alert('JSON 格式无效，请检查输入');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700">系统配置 ({configs.length})</h3>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/5 rounded-lg active:scale-95 transition-transform"
                >
                    <span className="material-icons-round text-sm">add</span>
                    新增
                </button>
            </div>

            {/* 新增表单 */}
            {showAddForm && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-primary/20">
                    <p className="text-xs font-bold text-slate-600 mb-3">新增配置项</p>
                    <input
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        placeholder="配置键名（如：business_hours）"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold mb-2 outline-none focus:ring-2 focus:ring-primary/10"
                    />
                    <textarea
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder='配置值（JSON 格式，如：{"open": "08:00", "close": "22:00"}）'
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono mb-3 outline-none focus:ring-2 focus:ring-primary/10 resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowAddForm(false)} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold active:scale-95 transition-transform">取消</button>
                        <button onClick={handleAddConfig} className="px-3 py-2 bg-primary text-white rounded-xl text-xs font-bold active:scale-95 transition-transform">保存</button>
                    </div>
                </div>
            )}

            {/* 已有配置列表 */}
            {configs.length === 0 && !showAddForm ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                    <span className="material-icons-round text-4xl text-slate-200">settings</span>
                    <p className="text-xs text-slate-400 mt-2">暂无配置项，点击「新增」添加</p>
                </div>
            ) : (
                configs.map(config => (
                    <div key={config.key} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-800 font-mono">{config.key}</span>
                            {config.updated_at && (
                                <span className="text-[10px] text-slate-300">
                                    {new Date(config.updated_at).toLocaleString('zh-CN')}
                                </span>
                            )}
                        </div>

                        {editingKey === config.key ? (
                            <div>
                                <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono mb-2 outline-none focus:ring-2 focus:ring-primary/10 resize-none"
                                />
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setEditingKey(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold active:scale-95 transition-transform">取消</button>
                                    <button onClick={() => handleSaveConfig(config.key)} className="px-3 py-1.5 bg-primary text-white rounded-lg text-[10px] font-bold active:scale-95 transition-transform">保存</button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <pre className="text-[10px] text-slate-500 bg-slate-50 p-3 rounded-xl overflow-x-auto font-mono">
                                    {JSON.stringify(config.value, null, 2)}
                                </pre>
                                <button
                                    onClick={() => { setEditingKey(config.key); setEditValue(JSON.stringify(config.value, null, 2)); }}
                                    className="mt-2 flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors active:scale-95"
                                >
                                    <span className="material-icons-round text-sm">edit</span>
                                    编辑
                                </button>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
};

// ═══════════════════════════════════════════
// 4. 审计日志
// ═══════════════════════════════════════════

const AuditSection: React.FC = () => {
    const [logs, setLogs] = useState<AuditLogItem[]>([]);
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
            console.error('Failed to load audit logs:', error);
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    const actionLabels: Record<string, string> = {
        update_user: '修改用户',
        delete_user: '删除用户',
        update_config: '更新配置',
    };

    const actionColors: Record<string, string> = {
        update_user: 'bg-blue-50 text-blue-600',
        delete_user: 'bg-red-50 text-red-600',
        update_config: 'bg-purple-50 text-purple-600',
    };

    const totalPages = Math.ceil(total / pageSize);

    if (loading && logs.length === 0) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700">操作日志</h3>
                <span className="text-[10px] text-slate-400 font-bold">{total} 条记录</span>
            </div>

            {logs.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                    <span className="material-icons-round text-4xl text-slate-200">history</span>
                    <p className="text-xs text-slate-400 mt-2">暂无操作日志</p>
                </div>
            ) : (
                <>
                    {/* 时间线样式的日志列表 */}
                    <div className="relative">
                        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                        {logs.map((log, idx) => (
                            <div key={log.id || idx} className="relative pl-12 pb-4">
                                <div className={`absolute left-3.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${actionColors[log.action]?.includes('red') ? 'bg-red-400' :
                                    actionColors[log.action]?.includes('purple') ? 'bg-purple-400' :
                                        'bg-blue-400'
                                    }`} style={{ top: '6px' }}></div>

                                <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${actionColors[log.action] || 'bg-slate-50 text-slate-500'}`}>
                                            {actionLabels[log.action] || log.action}
                                        </span>
                                        <span className="text-[10px] text-slate-300">
                                            {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 space-y-0.5">
                                        {log.target && <p>目标: <span className="font-mono text-slate-600">{log.target}</span></p>}
                                        {log.actor_id && <p>操作者: <span className="font-mono text-slate-600">{log.actor_id.slice(0, 8)}...</span></p>}
                                        {log.detail && Object.keys(log.detail).length > 0 && (
                                            <pre className="mt-1 p-2 bg-slate-50 rounded-lg text-[9px] font-mono overflow-x-auto">
                                                {JSON.stringify(log.detail, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 分页控制 */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 text-[10px] font-bold bg-white border border-slate-200 rounded-lg disabled:opacity-30 active:scale-95 transition-all"
                            >
                                上一页
                            </button>
                            <span className="text-[10px] text-slate-400 font-bold">{page} / {totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 text-[10px] font-bold bg-white border border-slate-200 rounded-lg disabled:opacity-30 active:scale-95 transition-all"
                            >
                                下一页
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default SuperAdminPanel;
