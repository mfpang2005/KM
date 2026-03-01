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
    const [headerHide, setHeaderHide] = useState(false);

    // ── 自动收起 Header 逻辑 ──────────────────────────────────────────────────
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let lastScrollTop = 0;
        const threshold = 100; // 滚动超过 100px 后开始生效

        const handleScroll = () => {
            const currentScrollTop = el.scrollTop;

            // 向下滚动超过阈值则收起，向上滚动则立即显示
            if (currentScrollTop > lastScrollTop && currentScrollTop > threshold) {
                setHeaderHide(true);
            } else if (currentScrollTop < lastScrollTop) {
                setHeaderHide(false);
            }

            lastScrollTop = Math.max(0, currentScrollTop);
        };

        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, []);

    // 页面切换时自动显示 Header
    useEffect(() => {
        setHeaderHide(false);
    }, [location.pathname]);

    // ── 通知铃铛状态 ────────────────────────────────────────────────────────
    const [showNotifs, setShowNotifs] = useState(false);
    const [notifs, setNotifs] = useState<{ id: string; customerName: string; amount: number; created_at: string }[]>([]);
    const [unread, setUnread] = useState(0);

    const loadNotifs = async () => {
        try {
            const lastSeen = parseInt(localStorage.getItem('last_seen_notifs') || '0');
            const { data } = await supabase
                .from('orders')
                .select('id, customerName, amount, created_at')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(10);
            if (data) {
                const unseen = data.filter(n => new Date(n.created_at).getTime() > lastSeen);
                setNotifs(unseen);
                setUnread(unseen.length);
            }
        } catch (e) {
            // Silently fail or log sparingly
        }
    };

    // NOTE: 初次加载 + Realtime 监听，拉取最新 PENDING 订单作为通知
    useEffect(() => {
        loadNotifs();

        const ch = supabase
            .channel('notif-bell')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadNotifs())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const handleBell = () => {
        const willShow = !showNotifs;
        setShowNotifs(willShow);
        if (willShow) {
            setUnread(0); // 打开后清零红点
        } else {
            // 关闭后清空（查看后删除）
            localStorage.setItem('last_seen_notifs', Date.now().toString());
            setNotifs([]);
            setUnread(0);
        }
    };

    const handleClearAll = () => {
        localStorage.setItem('last_seen_notifs', Date.now().toString());
        setNotifs([]);
        setUnread(0);
        setShowNotifs(false);
    };

    const navItems = [
        { path: '/', label: 'Overview', icon: 'dashboard' },
        { path: '/users', label: 'Users', icon: 'people' },
        { path: '/orders', label: 'Orders', icon: 'receipt_long' },
        { path: '/kitchen-prep', label: 'Kitchen Management', icon: 'precision_manufacturing' },
        { path: '/kitchen-calendar', label: 'Kitchen Calendar', icon: 'calendar_month' },
        { path: '/create-order', label: 'Create New Order', icon: 'add_shopping_cart' },
        { path: '/vehicles', label: 'Vehicle Inventory', icon: 'directions_car' },
        { path: '/drivers', label: 'Drivers Management', icon: 'directions_bike' },
        { path: '/products', label: 'Products', icon: 'inventory_2' },
        { path: '/walkie-talkie', label: 'Walkie-Talkie', icon: 'settings_voice' },
        { path: '/config', label: 'Settings', icon: 'settings' },
        { path: '/audit', label: 'Audit Logs', icon: 'history' },
    ];

    return (
        <div className="flex h-screen text-slate-800 font-sans bg-[#f8f9fc] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100/40 via-white to-purple-100/40 selection:bg-blue-200">
            {/* 侧边栏 (Glass Dark Theme) */}
            <aside className="w-72 bg-slate-900/95 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-all text-white z-20 shadow-[4px_0_30px_rgba(0,0,0,0.1)]">
                <div className="p-8 border-b border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                        <span className="font-black text-sm tracking-tighter">KL</span>
                    </div>
                    <div>
                        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">
                            SuperAdmin
                        </h1>
                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em] mt-0.5">Control Center</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto no-scrollbar">
                    {navItems.map(item => {
                        const isActive = location.pathname === item.path ||
                            (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm transition-all duration-300 group ${isActive
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-white shadow-xl shadow-blue-600/30 translate-x-1'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white font-bold'
                                    }`}
                            >
                                <span className={`material-icons-round text-[20px] transition-transform duration-300 ${isActive ? 'text-white scale-110' : 'text-slate-500 group-hover:scale-110'}`}>
                                    {item.icon}
                                </span>
                                {item.label}
                                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
                            </Link>
                        );
                    })}
                </nav>

                <HealthCheck />
                <div className="p-6 border-t border-white/5 bg-black/20">
                    <div className="flex items-center gap-4 mb-5 px-2">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700">
                                <span className="material-icons-round text-[18px] text-slate-300">person</span>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white truncate">{user?.email}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-red-500 hover:text-white text-slate-400 rounded-2xl text-xs font-black transition-all duration-300 group"
                    >
                        <span className="material-icons-round text-[16px] group-hover:-translate-x-1 transition-transform">logout</span>
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* 装饰性背景球 */}
                <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-blue-400/20 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-purple-400/20 rounded-full blur-[100px] pointer-events-none"></div>

                <header className={`h-20 bg-white/40 backdrop-blur-xl border-b border-white/50 flex items-center px-10 shadow-[0_4px_30px_rgba(0,0,0,0.02)] justify-between sticky top-0 z-10 transition-all duration-500 ease-in-out ${headerHide ? '-mt-20 opacity-0 pointer-events-none' : 'mt-0 opacity-100'}`}>
                    {/* 当前页标题（无副标题） */}
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                        {navItems.find(i => location.pathname === i.path || (i.path !== '/' && location.pathname.startsWith(i.path)))?.label || 'Dashboard'}
                    </h2>

                    {/* 通知铃铛 */}
                    <div className="relative">
                        <button
                            onClick={handleBell}
                            className="relative w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors border border-slate-100"
                        >
                            <span className="material-icons-round text-[20px]">notifications</span>
                            {unread > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                                    {unread > 9 ? '9+' : unread}
                                </span>
                            )}
                        </button>

                        {/* 下拉通知面板 */}
                        {showNotifs && (
                            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                                    <h4 className="font-black text-slate-700 text-sm">新订单通知</h4>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-400">{notifs.length} 条待处理</span>
                                        {notifs.length > 0 && (
                                            <button onClick={handleClearAll} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full font-bold transition-colors">
                                                清空
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                                    {notifs.length === 0 ? (
                                        <div className="py-10 text-center text-slate-300">
                                            <span className="material-icons-round text-3xl">notifications_none</span>
                                            <p className="text-xs font-bold mt-1">暂无新通知</p>
                                        </div>
                                    ) : notifs.map(n => (
                                        <div key={n.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                                                    <span className="material-icons-round text-[16px] text-indigo-500">receipt_long</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{n.customerName} 的新订单</p>
                                                    <p className="text-[10px] font-black text-indigo-600 mt-0.5">RM {Number(n.amount).toFixed(2)}</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                                        {new Date(n.created_at).toLocaleString('zh-MY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50">
                                    <button
                                        onClick={handleClearAll}
                                        className="w-full text-center text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors"
                                    >
                                        关闭并清空
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </header>
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-10 relative z-0 no-scrollbar"
                >
                    <div className="max-w-7xl mx-auto h-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
