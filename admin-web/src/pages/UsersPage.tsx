import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SuperAdminService } from '../services/api';
import { UserRole } from '../types';
import type { User } from '../types';

export const UsersPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

    // Sync state with URL parameters
    useEffect(() => {
        const search = searchParams.get('search');
        if (search !== null) setSearchQuery(search);
    }, [searchParams]);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<string>('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newUserForm, setNewUserForm] = useState<{ email: string; role: UserRole; name: string; password?: string; employee_id?: string; phone?: string }>({
        email: '',
        role: UserRole.DRIVER,
        name: '',
        password: '',
        employee_id: '',
        phone: ''
    });

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await SuperAdminService.getUsers();
            setUsers(data || []);
        } catch (error: any) {
            console.error('Failed to load users', error);
            if (error.response?.status === 403) {
                setUsers([]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const handleSaveRole = async (userId: string) => {
        try {
            await SuperAdminService.updateUser(userId, { role: editRole });
            setEditingUser(null);
            await loadUsers();
        } catch (error) {
            console.error('Failed to update user', error);
            alert('Update failed, please try again.');
        }
    };

    const handleDeleteUser = async (userId: string, email: string) => {
        if (!window.confirm(`Are you sure you want to delete ${email}?`)) return;
        try {
            await SuperAdminService.deleteUser(userId);
            await loadUsers();
        } catch (error) {
            console.error('Failed to delete user', error);
            alert('Delete failed, please try again.');
        }
    };

    const handleApproveUser = async (userId: string) => {
        try {
            await SuperAdminService.updateUserStatus(userId, 'active');
            await loadUsers();
        } catch (error) {
            console.error('Failed to approve user', error);
            alert('Approve failed, please try again.');
        }
    };

    const handleCreateInternalUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserForm.password || newUserForm.password.length < 6) {
            alert('Password must be at least 6 characters.');
            return;
        }
        try {
            setLoading(true);
            await SuperAdminService.createInternalUser(newUserForm);
            setShowAddModal(false);
            setNewUserForm({ email: '', role: UserRole.DRIVER, name: '', password: '', employee_id: '', phone: '' });
            await loadUsers();
        } catch (error) {
            console.error('Failed to create user', error);
            alert('Failed to create internal user.');
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u => {
        const search = (searchQuery || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        const empId = (u.employee_id || '').toLowerCase();

        return email.includes(search) || name.includes(search) || empId.includes(search);
    });

    const roleColors: Record<string, string> = {
        [UserRole.SUPER_ADMIN]: 'bg-purple-100 text-purple-800 border-purple-200',
        [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        [UserRole.KITCHEN]: 'bg-orange-100 text-orange-800 border-orange-200',
        [UserRole.DRIVER]: 'bg-blue-100 text-blue-800 border-blue-200',
    };

    const statusColors: Record<string, string> = {
        'active': 'bg-green-100 text-green-700',
        'pending': 'bg-amber-100 text-amber-700',
        'deleted': 'bg-slate-100 text-slate-500',
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">User Management</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage all internal roles and remote drivers</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            // Clear URL params
                            window.history.replaceState({}, '', window.location.pathname);
                        }}
                        className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all flex items-center gap-2"
                        title="Reset search"
                    >
                        <span className="material-icons-round text-[18px]">restart_alt</span>
                        <span className="hidden md:inline">重置</span>
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-bold text-sm hover:shadow-[0_8px_20px_rgba(220,38,38,0.3)] hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <span className="material-icons-round text-[18px]">person_add</span>
                        Create Staff Account
                    </button>
                    <div className="relative w-64">
                        <span className="material-icons-round absolute left-3 top-2.5 text-slate-400">search</span>
                        <label htmlFor="user-search" className="sr-only">Search users</label>
                        <input
                            id="user-search"
                            name="user-search"
                            type="text"
                            placeholder="Search email, name or ID..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="px-6 py-4 w-1/3">User Info</th>
                            <th className="px-6 py-4 w-1/4">Role</th>
                            <th className="px-6 py-4 w-1/4">Status</th>
                            <th className="px-6 py-4 w-1/6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                </td>
                            </tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">No users found.</td>
                            </tr>
                        ) : (
                            filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                                                {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 flex items-center gap-2">
                                                    {user.name || 'No Name'}
                                                    {user.employee_id && (
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-mono tracking-tighter">
                                                            {user.employee_id}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-slate-500 flex items-center gap-2">
                                                    {user.email}
                                                    {user.phone && (
                                                        <>
                                                            <span className="text-slate-300">•</span>
                                                            <span className="text-slate-400">{user.phone}</span>
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {editingUser === user.id ? (
                                            <select
                                                value={editRole}
                                                onChange={e => setEditRole(e.target.value)}
                                                className="px-2 py-1 border border-slate-300 rounded text-xs bg-white outline-none"
                                            >
                                                <option value={UserRole.ADMIN}>Admin</option>
                                                <option value={UserRole.KITCHEN}>Kitchen</option>
                                                <option value={UserRole.DRIVER}>Driver</option>
                                                <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                                            </select>
                                        ) : (
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${roleColors[user.role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                {user.role}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1 items-start">
                                            {user.status && (
                                                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${statusColors[user.status] || 'bg-slate-100 text-slate-500'}`}>
                                                    {user.status}
                                                </span>
                                            )}
                                            {user.is_disabled && (
                                                <span className="text-red-600 font-bold text-[11px] bg-red-50 px-2 py-1 rounded uppercase">Disabled</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                                        {user.status === 'pending' && (
                                            <button
                                                onClick={() => handleApproveUser(user.id)}
                                                className="px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 font-bold text-xs rounded-lg transition-colors shadow-md shadow-green-500/20"
                                            >
                                                Approve
                                            </button>
                                        )}
                                        {editingUser === user.id ? (
                                            <>
                                                <button onClick={() => handleSaveRole(user.id)} className="text-primary hover:text-blue-700 font-bold text-xs">Save</button>
                                                <button onClick={() => setEditingUser(null)} className="text-slate-500 hover:text-slate-700 font-bold text-xs">Cancel</button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => { setEditingUser(user.id); setEditRole(user.role); }}
                                                    className="text-primary hover:text-blue-700 font-bold text-xs transition-colors"
                                                >
                                                    Edit Role
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                                    className="text-red-500 hover:text-red-700 font-bold text-xs transition-colors"
                                                >
                                                    Delete
                                                </button>
                                                {user.role === UserRole.DRIVER && (
                                                    <a
                                                        href="/drivers"
                                                        className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold hover:bg-blue-100 transition-colors inline-flex items-center gap-1"
                                                    >
                                                        <span className="material-icons-round text-[14px]">local_shipping</span>
                                                        调度
                                                    </a>
                                                )}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden relative border border-slate-100">
                        <div className="p-6 border-b border-slate-100 relative bg-slate-50/50">
                            <h2 className="text-xl font-bold text-slate-800">Create Staff Account</h2>
                            <p className="text-sm text-slate-500 mt-1">This will create a new Supabase Auth account and profile</p>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleCreateInternalUser} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Full Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                        placeholder="John Doe"
                                        value={newUserForm.name}
                                        onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Staff ID (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                        placeholder="KL-001"
                                        value={newUserForm.employee_id}
                                        onChange={e => setNewUserForm({ ...newUserForm, employee_id: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Phone Number</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                    placeholder="012XXXXXXXX"
                                    value={newUserForm.phone}
                                    onChange={e => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Email Address *</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                    placeholder="kitchen1@kimlong.com"
                                    value={newUserForm.email}
                                    onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Initial Password * (Min 6 chars)</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                    placeholder="••••••••"
                                    value={newUserForm.password}
                                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Assign Role *</label>
                                <select
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-bold text-slate-700"
                                    value={newUserForm.role}
                                    onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                                >
                                    <option value={UserRole.DRIVER}>Driver</option>
                                    <option value={UserRole.KITCHEN}>Kitchen Staff</option>
                                    <option value={UserRole.ADMIN}>Administrator</option>
                                </select>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-5 py-2.5 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading ? <span className="material-icons-round animate-spin text-[18px]">autorenew</span> : null}
                                    Create Account
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
