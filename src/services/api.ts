import axios from 'axios';
import { Order, OrderCreate, OrderStatus, Product, User, UserRole } from '../../types';

const API_URL = 'http://localhost:8000'; // Adjust if backend port is different

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
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
