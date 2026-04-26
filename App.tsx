import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './src/lib/supabase';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import KitchenPrep from './pages/KitchenPrep';
import DriverSchedule from './pages/DriverSchedule';
import OrderCreate from './pages/OrderCreate';
import PhotoConfirmation from './pages/PhotoConfirmation';
import FinancialSummary from './pages/FinancialSummary';
import OrderManagement from './pages/OrderManagement';
import ProductManagement from './pages/ProductManagement';
import DriverList from './pages/DriverList';
import KitchenSummary from './pages/KitchenSummary';
import NotificationCenter from './pages/NotificationCenter';
import Profile from './pages/Profile';
import OrderDetail from './pages/OrderDetail';
import SuperAdminPanel from './pages/SuperAdminPanel';
import PublicReceipt from './pages/PublicReceipt';
import MainLayout from './src/components/MainLayout';
import { UserRole, User, UserStatus } from './types';
import { UserService } from './src/services/api';
import WalkieTalkie from './pages/WalkieTalkie';
import EventCalendar from './pages/EventCalendar';
import InventoryManagement from './pages/InventoryManagement';

import SystemLockPage from './pages/SystemLockPage';

const App: React.FC = () => {
    const [userProfile, setUserProfile] = useState<User | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // NOTE: 默认 null（未知），避免在授权状态确认前错误放行任何用户
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    const fetchProfile = async (uid: string) => {
        try {
            const data = await UserService.getCurrentUser(uid);
            if (data) {
                setUserProfile(data);
                return data;
            }
        } catch (err) {
            // Silently fail or log sparingly in production
        }
        return null;
    };

    useEffect(() => {
        let authStatusLoaded = false;
        let authSessionLoaded = false;
        let isInitialAuthCheckDone = false;

        console.log("[App] Init started...");
        
        // 安全兜底：5秒后强制关闭加载状态
        const safetyTimer = setTimeout(() => {
            if (loading) {
                console.warn("[App] Safety timeout triggered!");
                setLoading(false);
                if (isAuthorized === null) setIsAuthorized(false);
            }
        }, 5000);

        const checkAllLoaded = () => {
            if (authStatusLoaded && authSessionLoaded) {
                setLoading(false);
                clearTimeout(safetyTimer);
            }
        };

        // 1. 初始化系统授权状态
        const fetchAuthStatus = async () => {
            try {
                console.log("[App] Fetching auth status...");
                const response = await fetch('/api/super-admin/auth-status');
                if (response.ok) {
                    const data = await response.json();
                    setIsAuthorized(data.authorized);
                } else {
                    setIsAuthorized(false);
                }
            } catch (err) {
                console.error("[App] Auth status error:", err);
                setIsAuthorized(false);
            } finally {
                authStatusLoaded = true;
                checkAllLoaded();
            }
        };

        fetchAuthStatus();

        // 2. Auth 状态监听
        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
            const uid = session?.user?.id || null;
            setCurrentUserId(uid);

            if (!uid) setUserProfile(null);

            if (!isInitialAuthCheckDone) {
                isInitialAuthCheckDone = true;
                authSessionLoaded = true;
                checkAllLoaded();
            }
        });

        // 系统授权状态实时监听 —— Super Admin 切换开关后即时生效
        // NOTE: Realtime 仍然使用 Supabase 直连（监听事件，不读取受限数据）
        //       收到变更通知后，重新通过 API 拉取最新授权状态，确保数据准确
        const configSub = supabase
            .channel('system_config_changes')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'system_config',
                filter: 'key=eq.admin_app_auth'
            }, async (payload: any) => {
                // 优先从 payload 快速更新（减少延迟）
                if (payload.new && payload.new.value !== undefined) {
                    setIsAuthorized(!!payload.new.value?.authorized);
                } else {
                    // payload 无数据时通过 API 重新拉取
                    try {
                        const res = await fetch('/api/super-admin/config');
                        if (res.ok) {
                            const configs: Array<{ key: string; value: Record<string, unknown> }> = await res.json();
                            const authConfig = configs.find(c => c.key === 'admin_app_auth');
                            setIsAuthorized(authConfig ? !!authConfig.value?.authorized : false);
                        }
                    } catch { /* 忽略，保持当前状态 */ }
                }
            })
            .subscribe();

        return () => {
            authSub.unsubscribe();
            supabase.removeChannel(configSub);
            clearTimeout(safetyTimer);
        };
    }, []);

    // 3. 异步 Profile 拉取（避开死锁的关键）
    useEffect(() => {
        if (currentUserId) {
            fetchProfile(currentUserId);
        }
    }, [currentUserId]);

    // 等待 session + 授权状态两者均加载完毕
    if (loading || isAuthorized === null) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">
                        {isAuthorized === null ? '正在验证系统授权...' : '正在恢复会话...'}
                    </p>
                </div>
            </div>
        );
    }

    const role = userProfile?.role;
    const isAdminOrSuper = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

    // 全局锁定判断：系统未授权 且 当前用户不是管理员/超级管理员
    // IMPORTANT: 只有在用户已登录(role 存在)的情况下才触发锁定页面
    // 如果未登录，直接通过路由重定向到 /login
    const effectiveAuthorized = isAuthorized || role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
    const isLocked = !!role && !effectiveAuthorized;

    // 全局锁定判断

    /**
     * 细分页面权限守卫组件
     * - 超级管理员拥有上帝视角，无视所有细分权限
     * - 普通管理员需检查 permissions 对象中对应的 ID 是否为 true
     */
    const PermissionRoute = ({ children, id }: { children: React.ReactNode, id: string }) => {
        if (role === UserRole.SUPER_ADMIN) return <>{children}</>;
        
        const perms = userProfile?.permissions || {};
        const hasPermission = perms[id] === true;

        if (!hasPermission) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                    <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6 border border-red-100">
                        <span className="material-icons-round text-4xl text-red-500 animate-pulse">lock</span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 mb-2 tracking-tight uppercase">权限受限</h2>
                    <p className="text-xs font-bold text-slate-400 leading-relaxed max-w-[240px]">
                        您的账号未开启 <span className="text-red-500 font-black">[{id.toUpperCase()}]</span> 模块的访问权限。请联系超级管理员在用户管理中为您授权。
                    </p>
                    <button 
                        onClick={() => window.history.back()}
                        className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                    >
                        返回上一页
                    </button>
                </div>
            );
        }
        return <>{children}</>;
    };

    return (
        <HashRouter>
            <div className="min-h-screen bg-slate-100 flex flex-col">
                <Routes>
                    {/* 
                        登录页：系统锁定时 Admin 仍可到达登录页，
                        但登录成功后会被路由守卫拦截至 /locked
                    */}
                    <Route path="/login" element={
                        <div className="flex justify-center min-h-screen bg-slate-100">
                            <div className="w-full max-w-md bg-white shadow-2xl overflow-hidden relative flex flex-col min-h-screen">
                                <Login onLogin={async () => {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    if (session?.user) await fetchProfile(session.user.id);
                                }} />
                            </div>
                        </div>
                    } />

                    {/* 系统锁定展示页：若未锁定，自动跳转回管理后台 */}
                    <Route path="/locked" element={isLocked ? <SystemLockPage /> : <Navigate to="/admin" replace />} />

                    {/* 
                        全局路由守卫：
                        - isLocked = true  → 所有子路由整体重定向至 /locked
                        - isLocked = false → 正常显示 MainLayout 及其子页面
                    */}
                    <Route element={isLocked ? <Navigate to="/locked" replace /> : <MainLayout user={role} />}>
                        {/* Admin Routes — super_admin 也可访问，受细分权限控制 */}
                        <Route path="/admin" element={isAdminOrSuper ? <PermissionRoute id="overview"><AdminDashboard /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/finance" element={isAdminOrSuper ? <PermissionRoute id="financial"><FinancialSummary /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/create-order" element={isAdminOrSuper ? <PermissionRoute id="create_order"><OrderCreate /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/orders" element={isAdminOrSuper ? <PermissionRoute id="order"><OrderManagement /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/products" element={isAdminOrSuper ? <PermissionRoute id="product"><ProductManagement /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/drivers" element={isAdminOrSuper ? <PermissionRoute id="fleet"><DriverList /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/kitchen-summary" element={isAdminOrSuper ? <PermissionRoute id="kitchen"><KitchenSummary /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/notifications" element={isAdminOrSuper ? <NotificationCenter /> : <Navigate to="/login" />} />
                        <Route path="/admin/profile" element={isAdminOrSuper ? <Profile onLogout={() => setUserProfile(null)} /> : <Navigate to="/login" />} />
                        <Route path="/admin/walkie-talkie" element={isAdminOrSuper ? <PermissionRoute id="walkie_talkie"><WalkieTalkie /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/calendar" element={isAdminOrSuper ? <PermissionRoute id="event_calendar"><EventCalendar /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/admin/inventory" element={isAdminOrSuper ? <PermissionRoute id="inventory"><InventoryManagement /></PermissionRoute> : <Navigate to="/login" />} />
                        <Route path="/orders/:id" element={isAdminOrSuper || role === UserRole.DRIVER ? <OrderDetail /> : <Navigate to="/login" />} />

                        {/* Super Admin Routes — 仅 super_admin 可访问，完全不受锁定影响 */}
                        <Route path="/super-admin" element={role === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />
                        <Route path="/super-admin/users" element={role === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />
                        <Route path="/super-admin/audit" element={role === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />

                        {/* Kitchen Routes */}
                        <Route path="/kitchen" element={role === UserRole.KITCHEN ? <KitchenPrep /> : <Navigate to="/login" />} />

                        {/* Driver Routes */}
                        <Route path="/driver" element={role === UserRole.DRIVER ? <DriverSchedule /> : <Navigate to="/login" />} />
                        <Route path="/driver/confirm" element={role === UserRole.DRIVER ? <PhotoConfirmation /> : <Navigate to="/login" />} />
                    </Route>

                    {/* 公共路由：顾客扫码查看账单，不受任何授权限制 */}
                    <Route path="/receipt/:id" element={<PublicReceipt />} />

                    <Route path="/" element={<Navigate to="/login" />} />
                </Routes>
            </div>
        </HashRouter>
    );
};

export default App;
