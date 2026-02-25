import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AdminLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const location = useLocation();

    const navItems = [
        { path: '/', label: 'Overview', icon: 'dashboard' },
        { path: '/users', label: 'Users', icon: 'people' },
        { path: '/orders', label: 'Orders', icon: 'receipt_long' },
        { path: '/config', label: 'Settings', icon: 'settings' },
        { path: '/audit', label: 'Audit Logs', icon: 'history' },
    ];

    return (
        <div className="flex h-screen bg-slate-50 text-slate-800 font-sans">
            {/* 侧边栏 */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-all text-white">
                <div className="p-6 border-b border-slate-800">
                    <h1 className="text-xl font-black text-white flex items-center gap-2">
                        <span className="w-8 h-8 rounded bg-primary/20 text-primary flex items-center justify-center">
                            SA
                        </span>
                        Super Admin
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto no-scrollbar">
                    {navItems.map(item => {
                        const isActive = location.pathname === item.path ||
                            (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${isActive
                                        ? 'bg-blue-600 font-bold text-white shadow-md'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                                    }`}
                            >
                                <span className={`material-icons-round text-[20px] ${isActive ? 'text-white' : 'text-slate-500'}`}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                            <span className="material-icons-round text-[16px]">person</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{user?.email}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-400 rounded-xl text-xs font-bold transition-all"
                    >
                        <span className="material-icons-round text-[16px]">logout</span>
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm justify-between">
                    <h2 className="text-lg font-bold text-slate-800">
                        {navItems.find(i => location.pathname === i.path || (i.path !== '/' && location.pathname.startsWith(i.path)))?.label || 'Dashboard'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold border border-amber-200">
                            System Healthy
                        </span>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-6xl mx-auto h-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
