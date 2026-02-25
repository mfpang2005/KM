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
import MainLayout from './src/components/MainLayout';
import { UserRole } from './types';

const App: React.FC = () => {
    const [user, setUser] = useState<UserRole | null>(null);

    useEffect(() => {
        // NOTE: 启动时检查是否已有有效 session（页面刷新或 OAuth 回调后恢复登录状态）
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                // 从用户元数据中恢复角色；若无则默认为 ADMIN
                const savedRole = session.user.user_metadata?.role as UserRole | undefined;
                setUser(savedRole ?? UserRole.ADMIN);
            }
        });

        // NOTE: 监听 Supabase 认证状态变化
        // SIGNED_IN 会在密码登录、OAuth 回调完成后触发
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const savedRole = session.user.user_metadata?.role as UserRole | undefined;
                setUser(savedRole ?? UserRole.ADMIN);
            } else {
                // SIGNED_OUT 时清除用户状态
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <HashRouter>
            <div className="flex justify-center min-h-screen bg-slate-100">
                <div className="w-full max-w-md bg-white shadow-2xl overflow-hidden relative flex flex-col min-h-screen">
                    <Routes>
                        <Route path="/login" element={<Login onLogin={(role) => setUser(role)} />} />

                        <Route element={<MainLayout user={user} />}>
                            {/* Admin Routes */}
                            <Route path="/admin" element={user === UserRole.ADMIN ? <AdminDashboard /> : <Navigate to="/login" />} />
                            <Route path="/admin/finance" element={user === UserRole.ADMIN ? <FinancialSummary /> : <Navigate to="/login" />} />
                            <Route path="/admin/create-order" element={user === UserRole.ADMIN ? <OrderCreate /> : <Navigate to="/login" />} />
                            <Route path="/admin/orders" element={user === UserRole.ADMIN ? <OrderManagement /> : <Navigate to="/login" />} />
                            <Route path="/admin/products" element={user === UserRole.ADMIN ? <ProductManagement /> : <Navigate to="/login" />} />
                            <Route path="/admin/drivers" element={user === UserRole.ADMIN ? <DriverList /> : <Navigate to="/login" />} />
                            <Route path="/admin/kitchen-summary" element={user === UserRole.ADMIN ? <KitchenSummary /> : <Navigate to="/login" />} />
                            <Route path="/admin/notifications" element={user === UserRole.ADMIN ? <NotificationCenter /> : <Navigate to="/login" />} />
                            <Route path="/admin/profile" element={user === UserRole.ADMIN ? <Profile onLogout={() => setUser(null)} /> : <Navigate to="/login" />} />

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
