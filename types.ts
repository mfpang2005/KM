
export enum UserRole {
    ADMIN = 'admin',
    KITCHEN = 'kitchen',
    DRIVER = 'driver',
    SUPER_ADMIN = 'super_admin'
}

export enum OrderStatus {
    PENDING = 'pending',
    PREPARING = 'preparing',
    READY = 'ready',
    DELIVERING = 'delivering',
    COMPLETED = 'completed'
}

// Added PaymentMethod enum as required by DriverSchedule.tsx and updated for OrderManagement
export enum PaymentMethod {
    CASH = 'cash',
    BANK_TRANSFER = 'bank_transfer',
    EWALLET = 'ewallet',
    CHEQUE = 'cheque'
}

export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    note?: string;
}

export interface Order {
    id: string;
    customerName: string;
    customerPhone: string;
    address: string;
    items: OrderItem[];
    status: OrderStatus;
    dueTime: string;
    amount: number;
    type: 'dine-in' | 'takeaway' | 'delivery';
    batch?: string;
    driverId?: string;
    // Added paymentMethod and paymentStatus to resolve property existence errors
    paymentMethod?: PaymentMethod;
    paymentStatus?: 'paid' | 'pending' | 'unpaid';
}

export interface OrderCreate {
    customerName: string;
    customerPhone: string;
    address: string;
    items: { id: string; quantity: number }[];
    status: OrderStatus;
    dueTime: string;
    amount: number;
    type: 'dine-in' | 'takeaway' | 'delivery';
    paymentMethod?: PaymentMethod;
    driverId?: string;
}

export interface Transaction {
    id: string;
    type: string;
    amount: number;
    time: string;
    status: 'paid' | 'pending' | 'unpaid';
    method: 'cash' | 'transfer' | 'cheque';
}

export interface Product {
    id: string;
    code: string;
    name: string;
    price: number;
    category?: string;
    image_url?: string;
}

export interface User {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
    phone?: string;
    avatar_url?: string;
}
