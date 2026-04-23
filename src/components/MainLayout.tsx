import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { UserRole } from '../../types';
import { NAV_CONFIG } from '../config/navigation';

interface MainLayoutProps {
    user: UserRole | null;
}

const MainLayout: React.FC<MainLayoutProps> = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

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
        <div className="flex h-screen w-full bg-background-beige overflow-hidden">
            {/* Desktop Sidebar - Visible on lg screens */}
            <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-primary/5 shadow-sm z-10 transition-all duration-300">
                <div className="p-6 border-b border-primary/5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-icons-round text-xl">restaurant_menu</span>
                    </div>
                    <div>
                        <h1 className="font-black text-primary text-lg leading-tight uppercase tracking-tight italic">Kim Long</h1>
                        <p className="text-[9px] text-primary-light font-bold uppercase tracking-widest">Smart Catering</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {navItems.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${isActive(item.path)
                                ? 'bg-primary/5 text-primary shadow-sm ring-1 ring-primary/10'
                                : 'text-primary-light/60 hover:bg-primary/5 hover:text-primary'
                                }`}
                        >
                            <span className={`material-icons-round text-xl transition-transform group-hover:scale-110 ${isActive(item.path) ? 'text-primary' : 'text-primary-light/40 group-hover:text-primary-light'
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

                <div className="p-4 border-t border-primary/5">
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            navigate('/login');
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 text-primary-light/60 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
                    >
                        <span className="material-icons-round">logout</span>
                        <span className="text-sm font-bold">退出登录</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full w-full overflow-hidden relative">
                <div className="flex-1 overflow-y-auto w-full no-scrollbar pb-20 lg:pb-0">
                    <Outlet />
                </div>

                {/* Mobile Bottom Navigation - Visible on small screens */}
                <nav className="lg:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-primary/5 px-6 py-2 safe-bottom z-50 flex justify-between items-center shadow-[0_-10px_40px_rgba(128,0,0,0.08)]">
                    {/* We show max 5 items for mobile bottom nav to avoid clutter. 
                        If more, detailed menu should be handled via a "More" button or similar. 
                        For now, we slice the first 4 + Profile or just mapping important ones.*/}

                    {navItems.slice(0, 4).map((item) => (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 ${isActive(item.path) ? 'text-primary' : 'text-primary-light/40 hover:text-primary-light'
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
                        onClick={() => setIsMoreMenuOpen(true)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl text-primary-light/40 hover:text-primary-light transition-all active:scale-95`}
                    >
                        <span className="material-icons-round text-2xl opacity-70">apps</span>
                        <span className="text-[10px] font-medium">更多</span>
                    </button>
                </nav>

                {/* More Menu Drawer - Premium Overlay */}
                {isMoreMenuOpen && (
                    <div className="lg:hidden fixed inset-0 z-[100] flex items-end animate-in fade-in duration-300">
                        {/* Backdrop */}
                        <div 
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setIsMoreMenuOpen(false)}
                        />
                        
                        {/* Drawer Content */}
                        <div className="relative w-full bg-white/90 backdrop-blur-2xl rounded-t-[40px] p-8 pb-12 shadow-[0_-20px_60px_rgba(0,0,0,0.15)] animate-in slide-in-from-bottom duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]">
                            {/* Drag Indicator */}
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full" />
                            
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h4 className="text-sm font-black text-primary uppercase tracking-widest">功能大全</h4>
                                    <p className="text-[9px] text-primary-light/60 font-bold uppercase mt-1 tracking-tight">Explore All Admin Modules</p>
                                </div>
                                <button 
                                    onClick={() => setIsMoreMenuOpen(false)}
                                    className="w-10 h-10 flex items-center justify-center bg-primary/5 rounded-full text-primary/40"
                                >
                                    <span className="material-icons-round">close</span>
                                </button>
                            </div>

                            {/* Icons Grid */}
                            <div className="grid grid-cols-3 gap-y-8 gap-x-4">
                                {navItems.slice(4).map((item) => (
                                    <button
                                        key={item.path}
                                        onClick={() => {
                                            navigate(item.path);
                                            setIsMoreMenuOpen(false);
                                        }}
                                        className="flex flex-col items-center gap-3 transition-all active:scale-90 group"
                                    >
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${isActive(item.path) ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-primary/5 text-primary-light hover:bg-primary/10'}`}>
                                            <span className="material-icons-round text-2xl">{item.icon}</span>
                                        </div>
                                        <span className={`text-[10px] font-black uppercase tracking-tight text-center leading-tight ${isActive(item.path) ? 'text-primary' : 'text-primary-light/70'}`}>
                                            {item.label.split(' ')[0]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default MainLayout;
