import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { WalkieTalkiePage } from './pages/WalkieTalkiePage';
import { ConfigPage } from './pages/ConfigPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { CreateOrderPage } from './pages/CreateOrderPage';
import { FleetCenterPage } from './pages/FleetCenterPage';
import KitchenCalendarPage from './pages/KitchenCalendarPage';
import KitchenPrepPage from './pages/KitchenPrepPage';
import KitchenRecipesPage from './pages/KitchenRecipesPage';
import { FinancePage } from './pages/FinancePage';
import PublicReceiptPage from './pages/PublicReceiptPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, logout } = useAuth();


  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
      <div className="h-8 w-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Authenticating</p>
    </div>
  );

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // SECURITY CHECK: 拦截非管理员访问后台
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-sm text-center">
          <span className="material-icons-round text-5xl text-red-500 mb-4 tracking-tighter">gpp_maybe</span>
          <h2 className="text-xl font-bold text-slate-800 mb-2">权限不足 (Access Denied)</h2>
          <p className="text-sm text-slate-500 mb-2">您的账号：<b>{user.email}</b></p>
          <p className="text-xs text-slate-400 mb-6">级别（{user.role}）不足以访问总后台。请联系系统管理员通过 SuperAdmin 后台提升您的权限。</p>
          <button
            onClick={async () => {
              await logout();
              window.location.href = '/login';
            }}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition-colors"
          >
            退出并返回重新登录
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// NOTE: 超管专属路由守卫 - 只有 super_admin 可以访问，防止直接输入 URL 绕过
const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-sm text-center">
          <span className="material-icons-round text-5xl text-red-500 mb-4">lock</span>
          <h2 className="text-xl font-bold text-slate-800 mb-2">权限不足</h2>
          <p className="text-sm text-slate-500">此页面仅限超级管理员访问</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-re-50 min-h-screen text-red-900 font-mono">
          <h1 className="text-2xl font-bold mb-4">💥页面崩溃保护 (Error Boundary)</h1>
          <div className="p-4 bg-white border border-red-200 rounded-lg shadow-sm whitespace-pre-wrap">
            {this.state.error?.toString()}
            <br />
            {this.state.error?.stack}
          </div>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">重新加载</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  console.log("App: Rendering...");
  return (
    <ErrorBoundary>
      <BrowserRouter>

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<SuperAdminRoute><UsersPage /></SuperAdminRoute>} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="fleet" element={<FleetCenterPage />} />
          <Route path="create-order" element={<CreateOrderPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="walkie-talkie" element={<WalkieTalkiePage />} />
          <Route path="kitchen-prep" element={<KitchenPrepPage />} />
          <Route path="kitchen-recipes" element={<KitchenRecipesPage />} />
          <Route path="event-calendar" element={<KitchenCalendarPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="audit" element={<AuditLogsPage />} />
        </Route>
        {/* NOTE: 公共路由 - 无需登录，供顾客扫码查看账单 */}
        <Route path="/receipt/:id" element={<PublicReceiptPage />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
