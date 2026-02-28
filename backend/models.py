from typing import List, Optional
from enum import Enum
from pydantic import BaseModel
from datetime import datetime


class UserRole(str, Enum):
    ADMIN = 'admin'
    KITCHEN = 'kitchen'
    DRIVER = 'driver'
    SUPER_ADMIN = 'super_admin'


class VehicleStatus(str, Enum):
    AVAILABLE = 'available'
    BUSY = 'busy'
    REPAIR = 'repair'


class UserStatus(str, Enum):
    PENDING = 'pending'
    ACTIVE = 'active'
    DELETED = 'deleted'


class OrderStatus(str, Enum):
    PENDING = 'pending'
    PREPARING = 'preparing'
    READY = 'ready'
    DELIVERING = 'delivering'
    COMPLETED = 'completed'


class PaymentMethod(str, Enum):
    CASH = 'cash'
    BANK_TRANSFER = 'bank_transfer'
    EWALLET = 'ewallet'
    CHEQUE = 'cheque'


class OrderItem(BaseModel):
    id: str
    name: str
    quantity: int
    note: Optional[str] = None
    price: Optional[float] = 0.0


class OrderBase(BaseModel):
    customerName: str
    customerPhone: str
    address: str
    items: List[OrderItem]
    status: OrderStatus
    dueTime: str
    amount: float
    type: str  # 'dine-in' | 'takeaway' | 'delivery'
    batch: Optional[str] = None
    driverId: Optional[str] = None
    paymentMethod: Optional[PaymentMethod] = None
    paymentStatus: Optional[str] = 'pending'
    delivery_photos: Optional[List[str]] = []
    equipments: Optional[dict] = {}
    calendar_event_id: Optional[str] = None


class OrderCreate(OrderBase):
    id: Optional[str] = None


class OrderUpdate(BaseModel):
    id: Optional[str] = None
    customerName: Optional[str] = None
    customerPhone: Optional[str] = None
    address: Optional[str] = None
    status: Optional[OrderStatus] = None
    dueTime: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    batch: Optional[str] = None
    driverId: Optional[str] = None
    paymentMethod: Optional[PaymentMethod] = None
    paymentStatus: Optional[str] = None


class Order(OrderBase):
    id: str
    created_at: Optional[datetime] = None


class Product(BaseModel):
    id: str
    code: str
    name: str
    price: Optional[float] = None
    category: Optional[str] = None
    image_url: Optional[str] = None


class User(BaseModel):
    id: str
    email: str
    role: UserRole
    status: Optional[UserStatus] = UserStatus.PENDING
    name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_status: Optional[str] = 'idle'
    employee_id: Optional[str] = None


# ── Super Admin 专用模型 ──


class UserUpdate(BaseModel):
    """
    Super Admin 修改用户信息时使用的请求体
    """
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    is_disabled: Optional[bool] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_status: Optional[str] = None
    employee_id: Optional[str] = None

class UserCreateInternal(BaseModel):
    email: str
    password: str
    role: UserRole
    name: Optional[str] = None
    employee_id: Optional[str] = None


class SystemConfig(BaseModel):
    """
    系统配置键值对
    """
    key: str
    value: dict
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class SystemConfigUpdate(BaseModel):
    """
    更新系统配置的请求体
    """
    value: dict


class AuditLog(BaseModel):
    """
    审计日志记录
    """
    id: Optional[str] = None
    actor_id: str
    actor_role: str
    action: str
    target: Optional[str] = None
    detail: Optional[dict] = None
    created_at: Optional[datetime] = None


class StatsOverview(BaseModel):
    """
    Super Admin 统计总览
    """
    total_orders: int
    total_revenue: float
    total_users: int
    orders_by_status: dict
    recent_orders: List[Order] = []


class DailyRevenue(BaseModel):
    date: str
    revenue: float
    order_count: int


class FinancialStats(BaseModel):
    total_revenue: float
    revenue_by_method: dict
    daily_revenue: List[DailyRevenue]
    growth_rate: Optional[float] = 0.0


class VehicleBase(BaseModel):
    plate_no: str
    model: Optional[str] = None
    type: Optional[str] = None
    status: Optional[VehicleStatus] = VehicleStatus.AVAILABLE
    road_tax_expiry: Optional[str] = None
    capacity: Optional[float] = None
    notes: Optional[str] = None

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    plate_no: Optional[str] = None
    model: Optional[str] = None
    type: Optional[str] = None
    status: Optional[VehicleStatus] = None
    road_tax_expiry: Optional[str] = None
    capacity: Optional[float] = None
    notes: Optional[str] = None

class Vehicle(VehicleBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class DriverAssignmentBase(BaseModel):
    driver_id: str
    vehicle_id: str

class DriverAssignment(DriverAssignmentBase):
    id: str
    assigned_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    status: str

