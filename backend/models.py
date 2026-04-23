from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, field_validator, model_validator
from datetime import datetime


class UserRole(str, Enum):
    ADMIN = 'admin'
    KITCHEN = 'kitchen'
    DRIVER = 'driver'
    ACCOUNT = 'account'
    SUPER_ADMIN = 'super_admin'

class Department(str, Enum):
    KITCHEN = 'Kitchen Department'
    DRIVER = 'Driver Department'
    ADMIN = 'Admin Department'
    ACCOUNT = 'Account Department'

class Position(str, Enum):
    HOD = 'HEAD OF DEPARTMENT - HOD'
    ASSISTANT_HOD = 'ASSITANT HOD'
    EXECUTIVE = 'EXECUTIVE'
    SENIOR = 'SENIOR'
    JUNIOR = 'JUNIOR'
    INTERN = 'INTERN'



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


class Ingredient(BaseModel):
    name: str
    baseQty: float
    unit: str


class Recipe(BaseModel):
    id: Optional[str] = None
    name: str
    ingredients: List[Ingredient]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class OrderItem(BaseModel):
    id: Optional[str] = None
    name: str
    quantity: int
    note: Optional[str] = None
    price: Optional[float] = 0.0


class OrderBase(BaseModel):
    customerName: Optional[str] = None
    customerPhone: Optional[str] = None
    address: Optional[str] = None
    items: Optional[List[OrderItem]] = []
    status: OrderStatus
    dueTime: Optional[str] = None
    amount: float
    driverId: Optional[str] = None
    paymentMethod: Optional[PaymentMethod] = None
    paymentStatus: Optional[str] = 'unpaid'
    delivery_photos: Optional[List[str]] = []
    equipments: Optional[dict] = {}
    calendar_event_id: Optional[str] = None
    payment_received: Optional[float] = 0.0
    balance: Optional[float] = 0.0
    remark: Optional[str] = None
    order_number: Optional[str] = None
    eventDate: Optional[str] = None
    eventTime: Optional[str] = None
    mapsLink: Optional[str] = None
    billingUnit: Optional[str] = 'PAX'
    billingQuantity: Optional[float] = 0.0
    billingPricePerUnit: Optional[float] = 0.0

    @model_validator(mode='after')
    def validate_finance_logic(self) -> 'OrderBase':
        # Formula: Balance = Amount - Payment Received
        self.balance = round((self.amount or 0.0) - (self.payment_received or 0.0), 2)
        
        # Automation: Status based on Balance
        if self.balance <= 0:
            self.paymentStatus = 'paid'
        else:
            # If there's a balance, it's unpaid (unless specifically handled otherwise)
            self.paymentStatus = 'unpaid'
        
        return self


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
    driverId: Optional[str] = None
    paymentMethod: Optional[PaymentMethod] = None
    paymentStatus: Optional[str] = None
    payment_received: Optional[float] = None
    balance: Optional[float] = None
    remark: Optional[str] = None
    order_number: Optional[str] = None
    eventDate: Optional[str] = None
    eventTime: Optional[str] = None
    mapsLink: Optional[str] = None
    billingUnit: Optional[str] = None
    billingQuantity: Optional[float] = None
    billingPricePerUnit: Optional[float] = None
    items: Optional[List[OrderItem]] = None
    automated: Optional[bool] = False
    start_time: Optional[datetime] = None

    @model_validator(mode='after')
    def validate_finance_update(self) -> 'OrderUpdate':
        # If both amount and payment are provided, we can re-calculate balance
        if self.amount is not None and self.payment_received is not None:
            self.balance = round(self.amount - self.payment_received, 2)
            if self.balance <= 0:
                self.paymentStatus = 'paid'
            else:
                self.paymentStatus = 'unpaid'
        return self


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
    department: Optional[str] = None
    position: Optional[str] = None
    permissions: Optional[dict] = None


class CustomerBase(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    remark: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    remark: Optional[str] = None

class Customer(CustomerBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ── Super Admin 专用模型 ──


class UserUpdate(BaseModel):
    """
    Super Admin 修改用户信息时使用的请求体
    """
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    is_disabled: Optional[bool] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_status: Optional[str] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    permissions: Optional[dict] = None
    avatar_url: Optional[str] = None

class UserCreateInternal(BaseModel):
    email: str
    password: str
    role: UserRole
    name: Optional[str] = None
    employee_id: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    permissions: Optional[dict] = None
    avatar_url: Optional[str] = None


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
    today_orders: int = 0
    today_revenue: float = 0.0
    month_revenue: float = 0.0
    month_orders: int = 0
    total_users: int
    total_unpaid: float = 0.0
    orders_by_status: dict
    recent_orders: List[Order] = []
    monthly_sales: List[float] = [] # Monthly sales history for line graph


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
    manufacturing_date: Optional[str] = None
    insurance_company: Optional[str] = None
    capacity: Optional[float] = None
    notes: Optional[str] = None

    @field_validator('capacity', 'road_tax_expiry', 'manufacturing_date', mode='before')
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    plate_no: Optional[str] = None
    model: Optional[str] = None
    type: Optional[str] = None
    status: Optional[VehicleStatus] = None
    road_tax_expiry: Optional[str] = None
    manufacturing_date: Optional[str] = None
    insurance_company: Optional[str] = None
    capacity: Optional[float] = None
    notes: Optional[str] = None

    @field_validator('capacity', 'road_tax_expiry', 'manufacturing_date', mode='before')
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v

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


class InventoryItem(BaseModel):
    id: str
    code: str
    name: str
    category: Optional[str] = None
    unit: Optional[str] = None
    unit_price: float = 0.0
    stock_quantity: float = 0.0
    min_threshold: float = 0.0
    max_threshold: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class InventoryLog(BaseModel):
    id: str
    item_id: str
    type: str # 'IN', 'OUT', 'ADJUST'
    quantity: float
    user_id: str
    remark: Optional[str] = None
    created_at: Optional[datetime] = None

class InventoryItemCreate(BaseModel):
    code: str
    name: str
    category: Optional[str] = None
    unit: Optional[str] = "kg"
    unit_price: float = 0.0
    stock_quantity: float = 0.0
    min_threshold: float = 0.0
    max_threshold: float = 0.0

class InventoryAdjustment(BaseModel):
    item_id: str
    type: str # 'IN', 'OUT', 'ADJUST'
    quantity: float
    remark: Optional[str] = None

