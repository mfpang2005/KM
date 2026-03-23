import axios from 'axios';
import { Order, OrderCreate, OrderStatus, Product, User, UserRole, Vehicle, StatsOverview, AiSummary } from '../../types';
import { supabase } from '../lib/supabase';

export interface Customer {
    id: string;
    name: string;
    phone: string;
    address?: string;
    remark?: string;
    created_at?: string;
    updated_at?: string;
}

const API_URL = '/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// NOTE: 自动从 Supabase session 中附加 Bearer token 到每个请求
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
});

export const OrderService = {
    getAll: async (): Promise<Order[]> => {
        const response = await api.get('/orders');
        return response.data;
    },
    getById: async (id: string): Promise<Order> => {
        const response = await api.get(`/orders/${encodeURIComponent(id)}`);
        return response.data;
    },
    create: async (order: OrderCreate): Promise<Order> => {
        const response = await api.post('/orders', order);
        return response.data;
    },
    update: async (id: string, order: OrderCreate): Promise<Order> => {
        const response = await api.put(`/orders/${encodeURIComponent(id)}`, order);
        return response.data;
    },
    updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
        const response = await api.post(`/orders/${encodeURIComponent(id)}/status?status=${status}`);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/orders/${encodeURIComponent(id)}`);
    },
    updateOrderItemStatus: async (itemId: string, status: string): Promise<void> => {
        await api.patch(`/orders/items/${itemId}/status?status=${status}`);
    },
    getOrderItems: async (orderId: string): Promise<any[]> => {
        const response = await api.get(`/orders/items/${encodeURIComponent(orderId)}`);
        return response.data;
    },
    markItemPrepared: async (itemId: string, isPrepared: boolean): Promise<void> => {
        await api.patch(`/orders/items/${itemId}/prepared`, { is_prepared: isPrepared });
    },
    kitchenComplete: async (orderId: string): Promise<void> => {
        await api.post(`/orders/${encodeURIComponent(orderId)}/kitchen-complete`);
    },
    updateOrderPhotos: async (orderId: string, photoUrls: string[]): Promise<void> => {
        await api.patch(`/orders/${encodeURIComponent(orderId)}/photos`, { delivery_photos: photoUrls });
    },
    completeOrder: async (orderId: string, paymentMethod: string): Promise<Order> => {
        const response = await api.post(`/orders/${encodeURIComponent(orderId)}/complete`, { paymentMethod });
        return response.data;
    }
};

export const PRESET_CATEGORIES = [
    '主食 Mains',
    '饮品 Beverages',
    '小食 Snacks',
    '甜点 Desserts',
    '汤品 Soups',
    '素食 Vegetarian',
    '海鲜 Seafood',
    '肉类 Meat',
    '套餐 Set Meals',
    '其他 Others',
];

export const ProductService = {
    getAll: async (): Promise<Product[]> => {
        const response = await api.get('/products');
        return response.data;
    },
    create: async (product: Omit<Product, 'id'>): Promise<Product> => {
        const response = await api.post('/products', product);
        return response.data;
    },
    update: async (id: string, product: Omit<Product, 'id'>): Promise<Product> => {
        const response = await api.put(`/products/${id}`, product);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/products/${id}`);
    },
    uploadImage: async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/products/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data.url;
    },
    /**
     * 从产品列表中提取唯一品类列表，为前端创建订单菜单动态生成按钮
     */
    getCategories: async (): Promise<string[]> => {
        const response = await api.get('/products');
        const products: Product[] = response.data;
        const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
        return cats;
    },
};

export const UserService = {
    login: async (email: string, role: string): Promise<User> => {
        const response = await api.post(`/users/login?email=${email}&role=${role}`);
        return response.data;
    },
    getCurrentUser: async (userId: string): Promise<User> => {
        const response = await api.get(`/users/me/profile?user_id=${userId}`);
        return response.data;
    },
    updateProfile: async (userId: string, data: Partial<User>): Promise<User> => {
        const response = await api.patch(`/users/me/profile?user_id=${userId}`, data);
        return response.data;
    }
};

/**
 * Super Admin 专属 API 服务
 * 所有请求需携带有效的 super_admin 角色 JWT Token
 */
export const SuperAdminService = {
    /** 获取全局统计总览 */
    getStats: async (): Promise<StatsOverview> => {
        const response = await api.get('/super-admin/stats');
        return response.data;
    },

    /** 获取所有用户列表 */
    getUsers: async () => {
        const response = await api.get('/super-admin/users');
        return response.data;
    },

    /** 修改用户角色、姓名或状态 */
    updateUser: async (userId: string, update: { role?: string; name?: string; employee_id?: string; is_disabled?: boolean }) => {
        const response = await api.patch(`/super-admin/users/${userId}`, update);
        return response.data;
    },

    /** 删除用户 */
    deleteUser: async (userId: string) => {
        const response = await api.delete(`/super-admin/users/${userId}`);
        return response.data;
    },

    /** 创建内部员工账号 (无需邮箱验证) */
    createInternalUser: async (data: any) => {
        const response = await api.post('/admin/users/', data);
        return response.data;
    },

    /** 获取系统配置 */
    getConfig: async () => {
        const response = await api.get('/super-admin/config');
        return response.data;
    },

    /** 更新系统配置 */
    updateConfig: async (key: string, value: Record<string, unknown>) => {
        const response = await api.put(`/super-admin/config/${key}`, { value });
        return response.data;
    },

    /** 获取审计日志（分页） */
    getAuditLogs: async (page: number = 1, pageSize: number = 20) => {
        const response = await api.get(`/super-admin/audit-logs?page=${page}&page_size=${pageSize}`);
        return response.data;
    },

    /** 重置全系统交易数据（危险操作） */
    resetData: async () => {
        const response = await api.post('/super-admin/reset-data');
        return response.data;
    },

    /** 获取财务统计总览 (今日/本月/全部)，range 传 today/month/all */
    getFinanceSummary: async (range: 'today' | 'month' | 'all' = 'month'): Promise<{
        periodRevenue: number;
        periodOrders: number;
        todayRevenue: number;
        todayOrders: number;
        totalUnpaidBalance: number;
        collections: Array<{ method: string; amount: number; count: number }>;
    }> => {
        const response = await api.get(`/super-admin/financials?range=${range}`);
        return response.data;
    },

    /** 获取 AI 营业额分析摘要 */
    getAiSummary: async (): Promise<AiSummary> => {
        const response = await api.get('/super-admin/ai-summary');
        return response.data;
    },
};

export const VehicleService = {
    getAll: async (): Promise<Vehicle[]> => {
        const response = await api.get('/vehicles');
        return response.data;
    },
    create: async (vehicle: Partial<Vehicle>): Promise<Vehicle> => {
        const response = await api.post('/vehicles', vehicle);
        return response.data;
    },
    update: async (id: string, vehicle: Partial<Vehicle>): Promise<Vehicle> => {
        const response = await api.put(`/vehicles/${id}`, vehicle);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/vehicles/${id}`);
    },
    assignToDriver: async (driverId: string, vehicleId: string): Promise<any> => {
        const response = await api.post('/vehicles/assign', { driver_id: driverId, vehicle_id: vehicleId });
        return response.data;
    },
    unassignDriver: async (driverId: string): Promise<any> => {
        const response = await api.post(`/vehicles/unassign/${driverId}`);
        return response.data;
    }
};

export const FleetService = {
    /**
     * 获取车队实时状态 (Join 查询: 司机 + 活跃指派 + 车辆)
     */
    getFleetStatus: async () => {
        const response = await api.get('/vehicles/status');
        return response.data;
    }
};

export const CustomerService = {
    getAll: async (q?: string): Promise<Customer[]> => {
        const response = await api.get('/customers', { params: { q } });
        return response.data;
    },
    getById: async (id: string): Promise<Customer> => {
        const response = await api.get(`/customers/${id}`);
        return response.data;
    },
    create: async (customer: Omit<Customer, 'id'>): Promise<Customer> => {
        const response = await api.post('/customers', customer);
        return response.data;
    },
    update: async (id: string, customer: Partial<Customer>): Promise<Customer> => {
        const response = await api.patch(`/customers/${id}`, customer);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/customers/${id}`);
    },
};

