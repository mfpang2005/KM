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
import { UserRole } from './types';
import WalkieTalkie from './pages/WalkieTalkie';

const App: React.FC = () => {
    const [user, setUser] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // NOTE: 启动时检查是否有有效 session（即使刷新页面也能保持登录）
        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const role = session.user.user_metadata?.role as UserRole | undefined;
                    setUser(role ?? UserRole.ADMIN);
                }
            } catch (err) {
                console.error("Auth init error:", err);
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const role = session.user.user_metadata?.role as UserRole | undefined;
                setUser(role ?? UserRole.ADMIN);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">正在恢复会话...</p>
                </div>
            </div>
        );
    }

    /**
     * 判断当前用户是否有权访问 admin 级别的页面
     * NOTE: super_admin 拥有 admin 的全部权限
     */
    const isAdminOrSuper = user === UserRole.ADMIN || user === UserRole.SUPER_ADMIN;

    return (
        <HashRouter>
            <div className="min-h-screen bg-slate-100 flex flex-col">
                <Routes>
                    <Route path="/login" element={
                        <div className="flex justify-center min-h-screen bg-slate-100">
                            <div className="w-full max-w-md bg-white shadow-2xl overflow-hidden relative flex flex-col min-h-screen">
                                <Login onLogin={(role) => setUser(role)} />
                            </div>
                        </div>
                    } />

                        <Route element={<MainLayout user={user} />}>
                            {/* Admin Routes — super_admin 也可访问 */}
                            <Route path="/admin" element={isAdminOrSuper ? <AdminDashboard /> : <Navigate to="/login" />} />
                            <Route path="/admin/finance" element={isAdminOrSuper ? <FinancialSummary /> : <Navigate to="/login" />} />
                            <Route path="/admin/create-order" element={isAdminOrSuper ? <OrderCreate /> : <Navigate to="/login" />} />
                            <Route path="/admin/orders" element={isAdminOrSuper ? <OrderManagement /> : <Navigate to="/login" />} />
                            <Route path="/admin/products" element={isAdminOrSuper ? <ProductManagement /> : <Navigate to="/login" />} />
                            <Route path="/admin/drivers" element={isAdminOrSuper ? <DriverList /> : <Navigate to="/login" />} />
                            <Route path="/admin/kitchen-summary" element={isAdminOrSuper ? <KitchenSummary /> : <Navigate to="/login" />} />
                            <Route path="/admin/notifications" element={isAdminOrSuper ? <NotificationCenter /> : <Navigate to="/login" />} />
                            <Route path="/admin/profile" element={isAdminOrSuper ? <Profile onLogout={() => setUser(null)} /> : <Navigate to="/login" />} />
                            <Route path="/admin/walkie-talkie" element={isAdminOrSuper ? <WalkieTalkie /> : <Navigate to="/login" />} />
                            <Route path="/orders/:id" element={isAdminOrSuper || user === UserRole.DRIVER ? <OrderDetail /> : <Navigate to="/login" />} />

                            {/* Super Admin Routes — 仅 super_admin 可访问 */}
                            <Route path="/super-admin" element={user === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />
                            <Route path="/super-admin/users" element={user === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />
                            <Route path="/super-admin/config" element={user === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />
                            <Route path="/super-admin/audit" element={user === UserRole.SUPER_ADMIN ? <SuperAdminPanel /> : <Navigate to="/login" />} />

                            {/* Kitchen Routes */}
                            <Route path="/kitchen" element={user === UserRole.KITCHEN ? <KitchenPrep /> : <Navigate to="/login" />} />

                            {/* Driver Routes */}
                            <Route path="/driver" element={user === UserRole.DRIVER ? <DriverSchedule /> : <Navigate to="/login" />} />
                            <Route path="/driver/confirm" element={user === UserRole.DRIVER ? <PhotoConfirmation /> : <Navigate to="/login" />} />
                        </Route>

                        {/* NOTE: 公共路由 - 不需要登录，供顾客扫码查看账单 */}
                        <Route path="/receipt/:id" element={<PublicReceipt />} />

                        <Route path="/" element={<Navigate to="/login" />} />
                    </Routes>
            </div>
        </HashRouter>
    );
};

export default App;
