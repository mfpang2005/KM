import axios from 'axios';
import { supabase } from '../lib/supabase';
import type { Order, OrderStatus, OrderCreate, User, StatsOverview, AuditLog, SystemConfig, Product, Vehicle, DriverAssignment } from '../types';
// 使用完整的后端地址避免跨域问题，如果配置了 CORS 的话。
// 使用相对路径以触发 Vite 代理，避免跨域和硬编码主机问题
const API_URL = '/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 自动附加 Bearer JWT Token 到所有请求
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
});

export const SuperAdminService = {
    // ---- Dashboard 统计 ----
    getStats: async (): Promise<StatsOverview> => {
        const response = await api.get('/super-admin/stats');
        return response.data;
    },

    // ---- 用户管理 ----
    getUsers: async (): Promise<User[]> => {
        const response = await api.get('/super-admin/users');
        return response.data;
    },
    updateUser: async (userId: string, update: { role?: string; name?: string; is_disabled?: boolean }) => {
        const response = await api.patch(`/super-admin/users/${userId}`, update);
        return response.data;
    },
    deleteUser: async (userId: string): Promise<void> => {
        const response = await api.delete(`/super-admin/users/${userId}`);
        return response.data;
    },

    /** 管理员审核通过用户或拉黑等高级状态流转 */
    updateUserStatus: async (userId: string, status: 'pending' | 'active' | 'deleted') => {
        const response = await api.patch(`/admin/users/${userId}/status?status=${status}`);
        return response.data;
    },

    /** 在内部系统新建用户 (通过 Supabase Auth Admin) */
    createInternalUser: async (data: { email: string; role: string; name?: string; password?: string; employee_id?: string }) => {
        const response = await api.post('/admin/users/', data);
        return response.data;
    },

    // ---- 系统配置 ----
    getConfig: async (): Promise<SystemConfig[]> => {
        const response = await api.get('/super-admin/config');
        return response.data;
    },
    updateConfig: async (key: string, value: Record<string, any>): Promise<SystemConfig> => {
        const response = await api.put(`/super-admin/config/${key}`, { value });
        return response.data;
    },

    // ---- 审计日志 ----
    getAuditLogs: async (page: number = 1, pageSize: number = 20): Promise<{ data: AuditLog[], total: number, page: number, page_size: number }> => {
        const response = await api.get(`/super-admin/audit-logs?page=${page}&page_size=${pageSize}`);
        return response.data;
    },
    /** 指派司机 */
    assignDriver: async (id: string, driverId: string): Promise<Order> => {
        const response = await api.post(`/orders/${id}/assign`, { driver_id: driverId });
        return response.data;
    },
    /** 后台直接建单 */
    create: async (order: OrderCreate): Promise<Order> => {
        const response = await api.post('/orders', order);
        return response.data;
    }
};

// 后续扩展 Order 接口
export const AdminOrderService = {
    getAll: async (params?: { status?: string; sort_by?: string; order?: string }): Promise<Order[]> => {
        const response = await api.get('/orders', { params });
        return response.data;
    },
    getById: async (id: string): Promise<Order> => {
        const response = await api.get(`/orders/${id}`);
        return response.data;
    },
    /** 后台下单，创建新订单并同步到数据库 */
    create: async (order: OrderCreate): Promise<Order> => {
        const response = await api.post('/orders', order);
        return response.data;
    },
    updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
        const response = await api.post(`/orders/${id}/status?status=${status}`);
        return response.data;
    },
    update: async (id: string, order: Partial<Order>): Promise<Order> => {
        const response = await api.put(`/orders/${id}`, order);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/orders/${id}`);
    },
    updateOrderItemStatus: async (itemId: string, status: string): Promise<void> => {
        await api.patch(`/orders/items/${itemId}/status?status=${status}`);
    }
}

export const ProductService = {
    getAll: async (): Promise<Product[]> => {
        const response = await api.get('/products');
        return response.data;
    },
    create: async (product: Omit<Product, 'id'>): Promise<Product> => {
        const response = await api.post('/products', product);
        return response.data;
    },
    update: async (id: string, product: Partial<Product>): Promise<Product> => {
        const response = await api.put(`/products/${id}`, product);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/products/${id}`);
    }
}

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
    assignToDriver: async (driverId: string, vehicleId: string): Promise<{ message: string, assignment: DriverAssignment }> => {
        const response = await api.post('/vehicles/assign', { driver_id: driverId, vehicle_id: vehicleId });
        return response.data;
    },
    unassignDriver: async (driverId: string): Promise<{ message: string }> => {
        const response = await api.post(`/vehicles/unassign/${driverId}`);
        return response.data;
    }
};
