from typing import List, Optional
from enum import Enum
from pydantic import BaseModel
from datetime import datetime

class UserRole(str, Enum):
    ADMIN = 'admin'
    KITCHEN = 'kitchen'
    DRIVER = 'driver'

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
    price: Optional[float] = 0.0 # Added price for backend calculation if needed

class OrderBase(BaseModel):
    customerName: str
    customerPhone: str
    address: str
    items: List[OrderItem]
    status: OrderStatus
    dueTime: str
    amount: float
    type: str # 'dine-in' | 'takeaway' | 'delivery'
    batch: Optional[str] = None
    driverId: Optional[str] = None
    paymentMethod: Optional[PaymentMethod] = None
    paymentStatus: Optional[str] = 'pending' # 'paid' | 'pending' | 'unpaid'

class OrderCreate(OrderBase):
    pass

class Order(OrderBase):
    id: str
    created_at: Optional[datetime] = None

class Product(BaseModel):
    id: str
    code: str
    name: str
    price: float
    category: Optional[str] = None
    image_url: Optional[str] = None

class User(BaseModel):
    id: str
    email: str
    role: UserRole
    name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
