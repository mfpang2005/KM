import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminService } from '../services/api';
import { UserRole } from '../types';
import type { User } from '../types';

export const UsersPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<string>('');

    const loadUsers = useCallback(async () => {
        try {
            const data = await SuperAdminService.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users', error);
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

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const roleColors: Record<string, string> = {
        [UserRole.SUPER_ADMIN]: 'bg-amber-100 text-amber-800 border bg-opacity-50',
        [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-800 border bg-opacity-50',
        [UserRole.KITCHEN]: 'bg-green-100 text-green-800 border bg-opacity-50',
        [UserRole.DRIVER]: 'bg-blue-100 text-blue-800 border bg-opacity-50',
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-xl font-bold text-slate-800">User Management</h1>
                <div className="relative w-full md:w-64">
                    <span className="material-icons-round absolute left-3 top-2.5 text-slate-400">search</span>
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="px-6 py-4 w-1/3">User</th>
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
                                        <p className="font-bold text-slate-800">{user.name || 'No Name'}</p>
                                        <p className="text-xs text-slate-500">{user.email}</p>
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
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${roleColors[user.role] || 'bg-slate-100 text-slate-600'}`}>
                                                {user.role}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {user.is_disabled ? (
                                            <span className="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded">Disabled</span>
                                        ) : (
                                            <span className="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">Active</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
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
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
