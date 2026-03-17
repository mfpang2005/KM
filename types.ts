
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
    product_name?: string;
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
    remark?: string;
    order_number?: string;
    eventDate?: string;
    eventTime?: string;
    mapsLink?: string;
    payment_received?: number;
    balance?: number;
}

export interface OrderCreate {
    customerName: string;
    customerPhone: string;
    address: string;
    items: {
        id: string;
        quantity: number;
        price?: number;
        original_price?: number;
        name?: string;
        note?: string;
    }[];
    status: OrderStatus;
    dueTime: string;
    amount: number;
    type: 'dine-in' | 'takeaway' | 'delivery';
    paymentMethod?: PaymentMethod;
    driverId?: string;
    equipments?: Record<string, number>;
    payment_received?: number;
    balance?: number;
    order_number?: string;
    eventDate?: string;
    eventTime?: string;
    mapsLink?: string;
    remarks?: string;
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
    stock?: number;
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

export interface Vehicle {
    id: string;
    plate_no: string;
    model?: string;
    type?: string;
    status: 'available' | 'busy' | 'repair';
    road_tax_expiry?: string;
    capacity?: number;
    notes?: string;
    driver_name?: string;
}

export interface DriverAssignment {
    id: string;
    driver_id: string;
    vehicle_id: string;
    assigned_at: string;
    returned_at?: string;
    status: 'active' | 'completed';
}
