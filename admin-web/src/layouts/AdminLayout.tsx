import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';

type ServiceStatus = 'checking' | 'ok' | 'error';

/** 小型健康状态点 */
const StatusDot: React.FC<{ status: ServiceStatus; latency?: number }> = ({ status, latency }) => {
    const colors = { checking: 'bg-yellow-400 animate-pulse', ok: 'bg-emerald-400', error: 'bg-red-500' };
    return (
        <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
            {status === 'ok' && latency != null && (
                <span className="text-emerald-400 text-[9px] font-black">{latency}ms</span>
            )}
            {status === 'error' && <span className="text-red-400 text-[9px] font-black">ERR</span>}
        </span>
    );
};

import RealtimeStatus from '../components/RealtimeStatus';

/** 徧边栏底部健康检查组件 */
const HealthCheck: React.FC = () => {
    const [apiStatus, setApiStatus] = useState<ServiceStatus>('checking');
    const [supabaseStatus, setSupabaseStatus] = useState<ServiceStatus>('checking');
    const [apiLatency, setApiLatency] = useState<number>();
    const [sbLatency, setSbLatency] = useState<number>();

    const check = useCallback(async () => {
        // FastAPI check
        const t1 = Date.now();
        try {
            await api.get('/');
            setApiLatency(Date.now() - t1);
            setApiStatus('ok');
        } catch {
            setApiStatus('error');
            setApiLatency(undefined);
        }

        // Supabase check: 轻量级查询
        const t2 = Date.now();
        try {
            await supabase.from('products').select('id').limit(1);
            setSbLatency(Date.now() - t2);
            setSupabaseStatus('ok');
        } catch {
            setSupabaseStatus('error');
            setSbLatency(undefined);
        }
    }, []);

    useEffect(() => {
        check();
        const timer = setInterval(check, 120_000); // 120s
        return () => clearInterval(timer);
    }, [check]);

    return (
        <div className="mx-4 mb-3 px-4 py-3 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">System Status</span>
                <button
                    onClick={check}
                    title="手动刷新"
                    className="text-slate-600 hover:text-slate-300 transition-colors"
                >
                    <span className="material-icons-round text-[12px]">refresh</span>
                </button>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                        <span className="material-icons-round text-[11px]">bolt</span>FastAPI
                    </span>
                    <StatusDot status={apiStatus} latency={apiLatency} />
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                        <span className="material-icons-round text-[11px]">storage</span>Supabase
                    </span>
                    <StatusDot status={supabaseStatus} latency={sbLatency} />
                </div>
                <div className="mt-2 pt-2 border-t border-white/5">
                    <RealtimeStatus />
                </div>
            </div>
        </div>
    );
};

const AdminLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const scrollRef = useRef<HTMLDivElement>(null);
    // 侧边栏导航项
    const navItems = [
        { path: '/', label: 'Overview', icon: 'dashboard' },
        { path: '/users', label: 'Users', icon: 'people' },
        { path: '/orders', label: 'Orders', icon: 'receipt_long' },
        { path: '/kitchen-prep', label: 'Kitchen Management', icon: 'precision_manufacturing' },
        { path: '/event-calendar', label: 'Event Calendar', icon: 'calendar_month' },
        { path: '/create-order', label: 'Create New Order', icon: 'add_shopping_cart' },
        { path: '/fleet', label: 'Fleet Center', icon: 'local_shipping' },
        { path: '/products', label: 'Products', icon: 'inventory_2' },
        { path: '/walkie-talkie', label: 'Walkie-Talkie', icon: 'settings_voice' },
        { path: '/finance', label: 'Financials', icon: 'account_balance_wallet' },
        { path: '/config', label: 'Settings', icon: 'settings', hidden: true },
        { path: '/audit', label: 'Audit Logs', icon: 'history' },
    ].filter(item => !item.hidden);

    return (
        <div className="flex h-screen text-slate-800 font-sans bg-[#f8f9fc] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100/40 via-white to-purple-100/40 selection:bg-blue-200">
            {/* 侧边栏 (Glass Dark Theme) - 改为 Antigravity 悬浮缩放模式 */}
            <aside className="group fixed left-0 top-0 h-screen w-[75px] hover:w-[260px] bg-slate-900/95 backdrop-blur-2xl border-r border-white/10 flex flex-col sidebar-transition text-white z-50 shadow-[10px_0_40px_rgba(0,0,0,0.2)] overflow-hidden no-scrollbar">
                <div className="h-24 px-5 border-b border-white/5 flex items-center shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 flex-shrink-0">
                        <span className="font-black text-sm tracking-tighter">KL</span>
                    </div>
                    <div className="ml-4 opacity-0 group-hover:opacity-100 sidebar-transition keep-inline">
                        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">
                            SuperAdmin
                        </h1>
                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em] mt-0.5">Control Center</p>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto no-scrollbar">
                    {navItems.map(item => {
                        const isActive = location.pathname === item.path ||
                            (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center px-3 py-3.5 rounded-2xl text-sm sidebar-transition group/item ${isActive
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-white shadow-xl shadow-blue-600/30'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white font-bold'
                                    }`}
                            >
                                <div className="w-10 flex-shrink-0 flex justify-center">
                                    <span className={`material-icons-round text-[22px] transition-transform duration-300 ${isActive ? 'text-white scale-110' : 'text-slate-500 group-hover/item:scale-110'}`}>
                                        {item.icon}
                                    </span>
                                </div>
                                <span className={`ml-3 opacity-0 group-hover:opacity-100 sidebar-transition keep-inline ${isActive ? 'text-white' : ''}`}>
                                    {item.label}
                                </span>
                                {isActive && (
                                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse opacity-0 group-hover:opacity-100 sidebar-transition"></span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="sidebar-transition group-hover:px-0">
                    <div className="opacity-0 group-hover:opacity-100 sidebar-transition h-0 group-hover:h-auto overflow-hidden">
                        <HealthCheck />
                    </div>
                    {/* 简易状态灯 (在收缩时显示) */}
                    <div className="group-hover:hidden flex flex-col items-center gap-3 mb-6 py-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                    </div>
                </div>

                <div className="p-4 border-t border-white/5 bg-black/20 mt-auto">
                    <div className="flex items-center px-1 mb-4">
                        <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700">
                                <span className="material-icons-round text-[18px] text-slate-300">person</span>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>
                        </div>
                        <div className="ml-4 opacity-0 group-hover:opacity-100 sidebar-transition keep-inline">
                            <p className="text-sm font-black text-white truncate w-40">{user?.email}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full h-12 flex items-center sidebar-transition px-1 hover:bg-red-500 hover:text-white text-slate-400 rounded-2xl text-xs font-black group/logout overflow-hidden whitespace-nowrap"
                    >
                        <div className="w-10 flex-shrink-0 flex justify-center">
                            <span className="material-icons-round text-[20px] group-hover/logout:-translate-x-1 transition-transform">logout</span>
                        </div>
                        <span className="ml-3 opacity-0 group-hover:opacity-100 sidebar-transition">Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* 主内容区 - 增加占位符防止被固定侧边栏遮挡 */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative pl-[75px]">
                {/* 装饰性背景球 */}
                <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-blue-400/20 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-purple-400/20 rounded-full blur-[100px] pointer-events-none"></div>

                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-10 pb-10 relative z-0 no-scrollbar"
                >
                    <div className="max-w-7xl mx-auto h-full pt-20">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
