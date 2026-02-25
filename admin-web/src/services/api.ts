import axios from 'axios';
import { supabase } from '../lib/supabase';
import type { Order, OrderStatus, User, StatsOverview, AuditLog, SystemConfig } from '../types';
// 使用完整的后端地址避免跨域问题，如果配置了 CORS 的话。
const API_URL = 'http://localhost:8000';

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
};

// 后续扩展 Order 接口
export const AdminOrderService = {
    getAll: async (): Promise<Order[]> => {
        const response = await api.get('/orders');
        return response.data;
    },
    updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
        const response = await api.post(`/orders/${id}/status?status=${status}`);
        return response.data;
    },
}
