export const UserRole = {
    ADMIN: 'admin',
    KITCHEN: 'kitchen',
    DRIVER: 'driver',
    SUPER_ADMIN: 'super_admin'
} as const;
export type UserRole = typeof UserRole[keyof typeof UserRole];

export const OrderStatus = {
    PENDING: 'pending',
    PREPARING: 'preparing',
    READY: 'ready',
    DELIVERING: 'delivering',
    COMPLETED: 'completed'
} as const;
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

export const PaymentMethod = {
    CASH: 'cash',
    BANK_TRANSFER: 'bank_transfer',
    EWALLET: 'ewallet',
    CHEQUE: 'cheque'
} as const;
export type PaymentMethod = typeof PaymentMethod[keyof typeof PaymentMethod];

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
    paymentMethod?: PaymentMethod;
    paymentStatus?: 'paid' | 'pending' | 'unpaid';
    created_at?: string;
    delivery_photos?: string[];
    equipments?: Record<string, number>;
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
    equipments?: Record<string, number>;
}

export interface User {
    id: string;
    email: string;
    role: UserRole;
    status?: 'pending' | 'active' | 'deleted';
    name?: string;
    phone?: string;
    avatar_url?: string;
    is_disabled?: boolean;
    employee_id?: string;
    vehicle_model?: string;
    vehicle_plate?: string;
    vehicle_type?: string;
    vehicle_status?: string;
}

export interface SystemConfig {
    key: string;
    value: Record<string, any>;
    updated_at?: string;
    updated_by?: string;
}

export interface AuditLog {
    id: string;
    actor_id: string;
    actor_role: string;
    action: string;
    target?: string;
    detail?: Record<string, any>;
    created_at: string;
}

export interface StatsOverview {
    total_orders: number;
    total_revenue: number;
    total_users: number;
    orders_by_status: Record<string, number>;
    recent_orders: Order[];
}

export interface Product {
    id: string;
    code: string;
    name: string;
    price: number;
    category?: string;
    image_url?: string;
}

export interface Transaction {
    id: string;
    type: string;
    amount: number;
    time: string;
    status: 'paid' | 'pending' | 'unpaid';
    method: 'cash' | 'transfer' | 'cheque';
}

export interface Vehicle {
    id: string;
    plate_no: string;
    model?: string;
    type?: string;
    status: 'available' | 'busy' | 'repair';
    road_tax_expiry?: string;
    capacity?: number;
    notes?: string;
}

export interface DriverAssignment {
    id: string;
    driver_id: string;
    vehicle_id: string;
    assigned_at: string;
    returned_at?: string;
    status: 'active' | 'completed';
}
