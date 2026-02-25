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
import SuperAdminPanel from './pages/SuperAdminPanel';
import MainLayout from './src/components/MainLayout';
import { UserRole } from './types';

const App: React.FC = () => {
    const [user, setUser] = useState<UserRole | null>(null);

    useEffect(() => {
        // NOTE: 启动时检查是否已有有效 session（页面刷新或 OAuth 回调后恢复登录状态）
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const savedRole = session.user.user_metadata?.role as UserRole | undefined;
                setUser(savedRole ?? UserRole.ADMIN);
            }
        });

        // NOTE: 监听 Supabase 认证状态变化
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const savedRole = session.user.user_metadata?.role as UserRole | undefined;
                setUser(savedRole ?? UserRole.ADMIN);
            } else {
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    /**
     * 判断当前用户是否有权访问 admin 级别的页面
     * NOTE: super_admin 拥有 admin 的全部权限
     */
    const isAdminOrSuper = user === UserRole.ADMIN || user === UserRole.SUPER_ADMIN;

    return (
        <HashRouter>
            <div className="flex justify-center min-h-screen bg-slate-100">
                <div className="w-full max-w-md bg-white shadow-2xl overflow-hidden relative flex flex-col min-h-screen">
                    <Routes>
                        <Route path="/login" element={<Login onLogin={(role) => setUser(role)} />} />

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

                        <Route path="/" element={<Navigate to="/login" />} />
                    </Routes>
                </div>
            </div>
        </HashRouter>
    );
};

export default App;
