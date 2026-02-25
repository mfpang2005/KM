import axios from 'axios';
import { Order, OrderCreate, OrderStatus, Product, User, UserRole } from '../../types';
import { supabase } from '../lib/supabase';

const API_URL = 'http://localhost:8000';

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
        const response = await api.get(`/orders/${id}`);
        return response.data;
    },
    create: async (order: OrderCreate): Promise<Order> => {
        const response = await api.post('/orders', order);
        return response.data;
    },
    update: async (id: string, order: OrderCreate): Promise<Order> => {
        const response = await api.put(`/orders/${id}`, order);
        return response.data;
    },
    updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
        const response = await api.post(`/orders/${id}/status?status=${status}`);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await api.delete(`/orders/${id}`);
    },
};

export const ProductService = {
    getAll: async (): Promise<Product[]> => {
        const response = await api.get('/products');
        return response.data;
    },
    create: async (product: Product): Promise<Product> => {
        const response = await api.post('/products', product);
        return response.data;
    }
};

export const UserService = {
    login: async (email: string, role: UserRole): Promise<User> => {
        const response = await api.post(`/users/login?email=${email}&role=${role}`);
        return response.data;
    }
};

/**
 * Super Admin 专属 API 服务
 * 所有请求需携带有效的 super_admin 角色 JWT Token
 */
export const SuperAdminService = {
    /** 获取全局统计总览 */
    getStats: async () => {
        const response = await api.get('/super-admin/stats');
        return response.data;
    },

    /** 获取所有用户列表 */
    getUsers: async () => {
        const response = await api.get('/super-admin/users');
        return response.data;
    },

    /** 修改用户角色或状态 */
    updateUser: async (userId: string, update: { role?: string; name?: string; is_disabled?: boolean }) => {
        const response = await api.patch(`/super-admin/users/${userId}`, update);
        return response.data;
    },

    /** 删除用户 */
    deleteUser: async (userId: string) => {
        const response = await api.delete(`/super-admin/users/${userId}`);
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
};

