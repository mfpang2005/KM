import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { UserRole } from '../../types';
import { NAV_CONFIG } from '../config/navigation';

interface MainLayoutProps {
    user: UserRole | null;
}

const MainLayout: React.FC<MainLayoutProps> = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Determine active menu items based on user role
    // Default to empty list if user is null (though protected route should handle this)
    const navItems = user ? NAV_CONFIG[user] : [];

    // Helper to check if path is active
    const isActive = (path: string) => {
        if (path === '/admin' && location.pathname === '/admin') return true;
        if (path !== '/admin' && location.pathname.startsWith(path)) return true;
        if (location.pathname === path) return true;
        return false;
    };

    return (
        <div className="flex h-screen w-full bg-slate-100 overflow-hidden">
            {/* Desktop Sidebar - Visible on lg screens */}
            <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm z-10 transition-all duration-300">
                <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-icons-round text-xl">restaurant_menu</span>
                    </div>
                    <div>
                        <h1 className="font-bold text-slate-800 text-lg leading-tight">Kim Long</h1>
                        <p className="text-[10px] text-slate-400 font-medium">SMART CATERING</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {navItems.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${isActive(item.path)
                                ? 'bg-primary/5 text-primary shadow-sm ring-1 ring-primary/10'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                }`}
                        >
                            <span className={`material-icons-round text-xl transition-transform group-hover:scale-110 ${isActive(item.path) ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'
                                }`}>
                                {item.icon}
                            </span>
                            <span className="text-sm font-medium">{item.label}</span>
                            {isActive(item.path) && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"></span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-4 border-t border-slate-100">
                    <button
                        onClick={() => navigate('/login')}
                        className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
                    >
                        <span className="material-icons-round">logout</span>
                        <span className="text-sm font-medium">退出登录</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full w-full overflow-hidden relative">
                <div className="flex-1 overflow-y-auto w-full no-scrollbar pb-20 lg:pb-0">
                    <Outlet />
                </div>

                {/* Mobile Bottom Navigation - Visible on small screens */}
                <nav className="lg:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-2 safe-bottom z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                    {/* We show max 5 items for mobile bottom nav to avoid clutter. 
                        If more, detailed menu should be handled via a "More" button or similar. 
                        For now, we slice the first 4 + Profile or just mapping important ones.*/}

                    {navItems.slice(0, 4).map((item) => (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 ${isActive(item.path) ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <span className={`material-icons-round text-2xl transition-transform active:scale-95 ${isActive(item.path) ? '' : 'opacity-70'
                                }`}>
                                {item.icon}
                            </span>
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                    ))}

                    {/* Always show Profile/Logout or key action as last item if list is long? 
                        Current list for Admin has 9 items. Bottom nav fits ~4-5 optimally.
                        Let's verify what the design requirement implies. Use a specific set for mobile?
                        Or just first 4. Let's stick to first 4 for now to keep it clean.
                        Ideally, we would have a 'Menu' tab for others. 
                        Let's just show top 4 for now and assume users use dashboard for others.
                    */}
                    <button
                        onClick={() => navigate(
                            user === UserRole.SUPER_ADMIN ? '/super-admin' :
                                user === UserRole.ADMIN ? '/admin' : '/login'
                        )}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl text-slate-400 hover:text-slate-600`}
                    >
                        <span className="material-icons-round text-2xl opacity-70">apps</span>
                        <span className="text-[10px] font-medium">更多</span>
                    </button>
                </nav>
            </main>
        </div>
    );
};

export default MainLayout;
