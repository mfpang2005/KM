import { UserRole } from '../../types';

export interface NavItem {
    label: string;
    path: string;
    icon: string;
}

export const NAV_CONFIG: Record<UserRole, NavItem[]> = {
    [UserRole.ADMIN]: [
        { label: '控制台', path: '/admin', icon: 'dashboard' },
        { label: '订单管理', path: '/admin/orders', icon: 'list_alt' },
        { label: '创建订单', path: '/admin/create-order', icon: 'add_shopping_cart' },
        { label: '商品管理', path: '/admin/products', icon: 'inventory_2' },
        { label: '司机调度', path: '/admin/drivers', icon: 'local_shipping' },
        { label: '财务报表', path: '/admin/finance', icon: 'analytics' },
        { label: '后厨汇总', path: '/admin/kitchen-summary', icon: 'kitchen' },
        { label: '消息中心', path: '/admin/notifications', icon: 'notifications' },
        { label: '个人中心', path: '/admin/profile', icon: 'person' },
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
        { label: '财务报表', path: '/admin/finance', icon: 'analytics' },
    ],
};
