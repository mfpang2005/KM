import { UserRole } from '../../types';

export interface NavItem {
    label: string;
    path: string;
    icon: string;
}

export const NAV_CONFIG: Record<UserRole, NavItem[]> = {
    [UserRole.ADMIN]: [
        { label: '控制台 (Dashboard)', path: '/admin', icon: 'dashboard' },
        { label: '订单追踪 (Orders)', path: '/admin/orders', icon: 'list_alt' },
        { label: '账目管理 (Account)', path: '/admin/finance', icon: 'account_balance_wallet' },
        { label: '司机调度 (Drivers)', path: '/admin/drivers', icon: 'local_shipping' },
        { label: '商品管理 (Products)', path: '/admin/products', icon: 'inventory_2' },
        { label: '人工建单 (Create)', path: '/admin/create-order', icon: 'add_shopping_cart' },
        { label: '个人中心 (Profile)', path: '/admin/profile', icon: 'person' },
    ],
    [UserRole.KITCHEN]: [
        { label: '后厨备餐', path: '/kitchen', icon: 'kitchen' },
    ],
    [UserRole.DRIVER]: [
        { label: '配送排程', path: '/driver', icon: 'local_shipping' },
        { label: '拍照确认', path: '/driver/confirm', icon: 'camera_alt' },
    ],
    [UserRole.SUPER_ADMIN]: [
        { label: '总览', path: '/super-admin', icon: 'shield' },
        { label: '用户管理', path: '/super-admin/users', icon: 'group' },
        { label: '系统配置', path: '/super-admin/config', icon: 'settings' },
        { label: '审计日志', path: '/super-admin/audit', icon: 'history' },
        { label: '订单管理', path: '/admin/orders', icon: 'list_alt' },
        { label: '商品管理', path: '/admin/products', icon: 'inventory_2' },
        { label: '账目管理', path: '/admin/finance', icon: 'account_balance_wallet' },
    ],
};
