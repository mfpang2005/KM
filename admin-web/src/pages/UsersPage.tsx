import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SuperAdminService } from '../services/api';
import { UserRole } from '../types';
import type { User } from '../types';
import { supabase } from '../lib/supabase';

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

    // 双重确认弹窗状态
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [confirmDeleteInfo, setConfirmDeleteInfo] = useState<{ id: string; email: string } | null>(null);
    const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
    const [isDeleting, setIsDeleting] = useState(false);
    const [rtStatus, setRtStatus] = useState<string>('CONNECTING');

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
        const channel = supabase
            .channel('users-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadUsers())
            .subscribe((status) => setRtStatus(status));
        return () => { supabase.removeChannel(channel); };
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

    const handleDeleteUser = (userId: string, email: string) => {
        setConfirmDeleteInfo({ id: userId, email });
        setDeleteStep(1);
        setDeleteModalOpen(true);
    };

    const executeDelete = async () => {
        if (!confirmDeleteInfo) return;
        setIsDeleting(true);
        try {
            await SuperAdminService.deleteUser(confirmDeleteInfo.id);
            await loadUsers();
            setDeleteModalOpen(false);
            setConfirmDeleteInfo(null);
        } catch (error) {
            console.error('Failed to delete user', error);
            alert('Delete failed, please try again.');
        } finally {
            setIsDeleting(false);
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
        [UserRole.SUPER_ADMIN]: 'bg-gradient-to-r from-purple-500/10 to-indigo-500/10 text-purple-700 border-purple-200/50 shadow-sm shadow-purple-500/5',
        [UserRole.ADMIN]: 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-700 border-blue-200/50 shadow-sm shadow-blue-500/5',
        [UserRole.KITCHEN]: 'bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-700 border-orange-200/50 shadow-sm shadow-orange-500/5',
        [UserRole.DRIVER]: 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-200/50 shadow-sm shadow-emerald-500/5',
    };

    const statusColors: Record<string, string> = {
        'active': 'bg-emerald-50 text-emerald-600 border-emerald-100',
        'pending': 'bg-amber-50 text-amber-600 border-amber-100',
        'deleted': 'bg-slate-50 text-slate-400 border-slate-100',
    };

    return (
        <div className="min-h-screen bg-[#FDFDFF] pb-20 px-6">
            {/* Modern Header Section */}
            <div className="relative py-12">
                <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-blue-50/50 via-indigo-50/20 to-transparent -z-10"></div>
                
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <span className="w-16 h-16 rounded-[24px] bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
                                    <span className="material-icons-round text-[32px]">manage_accounts</span>
                                </span>
                                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md">
                                    <span className={`w-2.5 h-2.5 rounded-full ${rtStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-white/80 backdrop-blur-md border border-slate-100 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm w-fit">
                                        Identity Management
                                    </span>
                                    {rtStatus === 'SUBSCRIBED' && (
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-wider border border-emerald-100/50">
                                            Live
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight mt-1">
                                    用户管理 <span className="text-blue-600 font-serif italic text-3xl">.</span>
                                </h1>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="group relative flex items-center gap-3 px-10 py-5 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all duration-300 shadow-2xl shadow-slate-900/40 hover:shadow-blue-500/40 active:scale-95 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <span className="material-icons-round text-[20px] group-hover:scale-110 transition-transform">person_add</span>
                            Create Staff
                        </button>
                    </div>
                </div>
            </div>

            {/* Optimized Glass Search Bar */}
            <div className="sticky top-6 z-30 bg-white/40 backdrop-blur-3xl p-3 rounded-[32px] border border-white/60 shadow-2xl shadow-slate-200/50 mb-12 flex flex-col md:flex-row gap-3 items-center mx-auto max-w-7xl">
                <div className="relative flex-1 w-full group">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-[22px] group-focus-within:text-blue-500 transition-colors">search</span>
                    <input
                        type="text"
                        placeholder="搜索姓名、邮箱或工号..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-16 pr-8 py-5 bg-white/50 border-2 border-transparent rounded-[26px] text-base focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all font-bold placeholder:text-slate-300"
                    />
                </div>
                <button
                    onClick={() => { setSearchQuery(''); window.history.replaceState({}, '', window.location.pathname); }}
                    className="h-[68px] px-8 bg-white border-2 border-slate-50 flex items-center justify-center rounded-[26px] text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-red-500 hover:border-red-500/20 transition-all shadow-lg active:scale-95"
                >
                    Reset
                </button>
            </div>

            {/* User Cards Grid */}
            <div className="max-w-7xl mx-auto space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/50 backdrop-blur-md rounded-[32px] border border-white/60 shadow-xl">
                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        <p className="mt-4 text-slate-400 font-bold animate-pulse">Loading system identities...</p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/50 backdrop-blur-md rounded-[32px] border border-white/60 shadow-xl">
                        <span className="material-icons-round text-slate-200 text-[64px] mb-4">person_search</span>
                        <p className="text-slate-400 font-bold text-lg">No users found matching your search.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredUsers.map(user => (
                            <div key={user.id} className="group relative bg-white/60 backdrop-blur-xl border border-white/80 rounded-[22px] p-4 flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-500 hover:shadow-xl hover:shadow-blue-500/5 hover:bg-white hover:-translate-y-0.5 overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-slate-100 group-hover:bg-blue-500 transition-colors duration-500"></div>
                                
                                <div className="flex items-center gap-4 flex-1 w-full">
                                    <div className="relative shrink-0">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-100 flex items-center justify-center text-slate-400 font-black text-lg shadow-inner group-hover:from-blue-50 group-hover:to-indigo-50 group-hover:border-blue-100/50 group-hover:text-blue-500 transition-all duration-500 group-hover:scale-105">
                                            {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        {user.status === 'active' && !user.is_disabled && (
                                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md">
                                                <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 mb-0.5">
                                            <h3 className="text-lg font-black text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                                                {user.name || 'Anonymous User'}
                                            </h3>
                                            {user.employee_id && (
                                                <span className="shrink-0 px-2.5 py-1 bg-slate-900/5 text-[10px] text-slate-500 rounded-lg font-black uppercase tracking-wider">
                                                    ID: {user.employee_id}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold text-slate-400">
                                            <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
                                                <span className="material-icons-round text-[16px]">mail</span>
                                                {user.email}
                                            </div>
                                            {user.phone && (
                                                <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors border-l border-slate-100 pl-3 ml-0 md:ml-0">
                                                    <span className="material-icons-round text-[16px]">phone</span>
                                                    {user.phone}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-6 gap-y-3 w-full md:w-auto">
                                    <div className="flex flex-col items-center md:items-start gap-1 min-w-[110px]">
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">System Role</span>
                                        {editingUser === user.id ? (
                                            <select
                                                value={editRole}
                                                onChange={e => setEditRole(e.target.value)}
                                                className="w-full px-3 py-1.5 bg-white border-2 border-blue-100 rounded-lg text-[11px] font-bold text-blue-600 outline-none ring-4 ring-blue-500/5 transition-all"
                                            >
                                                <option value={UserRole.ADMIN}>Admin</option>
                                                <option value={UserRole.KITCHEN}>Kitchen</option>
                                                <option value={UserRole.DRIVER}>Driver</option>
                                                <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                                            </select>
                                        ) : (
                                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${roleColors[user.role] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                {user.role}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-center md:items-start gap-1 min-w-[90px]">
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Account Status</span>
                                        <div className="flex items-center gap-2">
                                            {user.is_disabled ? (
                                                <span className="px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                    Disabled
                                                </span>
                                            ) : (
                                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${statusColors[user.status || 'active']}`}>
                                                    {user.status || 'Active'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 ml-2">
                                        {user.status === 'pending' && (
                                            <button
                                                onClick={() => handleApproveUser(user.id)}
                                                className="h-10 px-4 bg-emerald-500 text-white hover:bg-emerald-600 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                                            >
                                                Approve
                                            </button>
                                        )}
                                        {editingUser === user.id ? (
                                            <div className="flex items-center gap-1.5">
                                                <button 
                                                    onClick={() => handleSaveRole(user.id)}
                                                    className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-90"
                                                >
                                                    <span className="material-icons-round text-[18px]">save</span>
                                                </button>
                                                <button 
                                                    onClick={() => setEditingUser(null)}
                                                    className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all active:scale-90"
                                                >
                                                    <span className="material-icons-round text-[18px]">close</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => { setEditingUser(user.id); setEditRole(user.role); }}
                                                    className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all rounded-xl shadow-sm active:scale-90"
                                                    title="Edit Role"
                                                >
                                                    <span className="material-icons-round text-[18px]">edit</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                                    className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50 transition-all rounded-xl shadow-sm active:scale-90"
                                                    title="Delete User"
                                                >
                                                    <span className="material-icons-round text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white/95 backdrop-blur-2xl rounded-[40px] shadow-2xl w-full max-xl overflow-hidden relative border border-white/60">
                        <div className="p-10 border-b border-slate-100 relative bg-gradient-to-br from-slate-50/50 to-white">
                            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-6 group hover:rotate-6 transition-transform">
                                <span className="material-icons-round text-[32px]">person_add</span>
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Create Identity <span className="text-blue-600 italic">.</span></h2>
                            <p className="text-slate-500 font-bold mt-2">Provision a new secure account within the system architecture.</p>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="absolute top-10 right-10 w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 transition-all active:scale-90"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleCreateInternalUser} className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Full Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all text-base font-bold placeholder:text-slate-300"
                                        placeholder="Enter legal name"
                                        value={newUserForm.name}
                                        onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Staff ID (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all text-base font-bold placeholder:text-slate-300"
                                        placeholder="KL-XXXX"
                                        value={newUserForm.employee_id}
                                        onChange={e => setNewUserForm({ ...newUserForm, employee_id: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Communication Channel</label>
                                <div className="grid grid-cols-2 gap-6">
                                    <input
                                        type="email"
                                        required
                                        className="w-full px-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all text-base font-bold placeholder:text-slate-300"
                                        placeholder="Corporate email"
                                        value={newUserForm.email}
                                        onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all text-base font-bold placeholder:text-slate-300"
                                        placeholder="Phone contact"
                                        value={newUserForm.phone}
                                        onChange={e => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Access Credentials</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        className="w-full px-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all text-base font-bold placeholder:text-slate-300"
                                        placeholder="Secret password"
                                        value={newUserForm.password}
                                        onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">System Privilege</label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500/10 focus:ring-8 focus:ring-blue-500/5 transition-all text-base font-bold text-slate-700 outline-none"
                                        value={newUserForm.role}
                                        onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                                    >
                                        <option value={UserRole.DRIVER}>Fleet Driver</option>
                                        <option value={UserRole.KITCHEN}>Kitchen Staff</option>
                                        <option value={UserRole.ADMIN}>Administrator</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-8 flex items-center justify-end gap-6 border-t border-slate-50">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-8 py-4 text-slate-400 hover:text-slate-600 font-black text-xs uppercase tracking-widest transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-10 py-5 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-2xl shadow-slate-900/20 disabled:opacity-50 flex items-center gap-3 active:scale-95"
                                >
                                    {loading ? <span className="material-icons-round animate-spin text-[20px]">autorenew</span> : <span className="material-icons-round text-[20px]">verified_user</span>}
                                    Deploy Identity
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 双重删除确认弹窗 */}
            {isDeleteModalOpen && confirmDeleteInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white rounded-[48px] shadow-2xl w-full max-w-sm overflow-hidden relative border border-white/60">
                        <div className="p-10 text-center">
                            <div className={`w-24 h-24 bg-red-50 rounded-[32px] flex items-center justify-center mx-auto mb-8 transition-all duration-500 ${deleteStep === 2 ? 'bg-red-600 text-white scale-110 shadow-2xl shadow-red-500/40' : 'text-red-500 shadow-xl shadow-red-500/5'}`}>
                                <span className={`material-icons-round text-5xl ${deleteStep === 2 ? 'animate-pulse' : ''}`}>
                                    {deleteStep === 1 ? 'person_remove' : 'gpp_maybe'}
                                </span>
                            </div>

                            <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">
                                {deleteStep === 1 ? 'Purge Identity?' : 'Critical Action!'}
                            </h3>

                            <p className="text-slate-400 font-bold leading-relaxed mb-10 px-4 text-sm">
                                {deleteStep === 1 ? (
                                    <>Are you sure you want to permanently delete <span className="text-slate-900 font-black">"{confirmDeleteInfo.email}"</span>?</>
                                ) : (
                                    <span className="text-red-500 font-black uppercase tracking-tighter">This action is irreversible. All access and records will be terminated immediately.</span>
                                )}
                            </p>

                            <div className="flex flex-col gap-4">
                                {deleteStep === 1 ? (
                                    <button
                                        onClick={() => setDeleteStep(2)}
                                        className="w-full py-5 bg-slate-900 hover:bg-red-600 text-white rounded-[24px] font-black text-xs uppercase tracking-widest transition-all active:scale-[0.95] shadow-2xl shadow-slate-900/20"
                                    >
                                        Execute Deletion
                                    </button>
                                ) : (
                                    <button
                                        onClick={executeDelete}
                                        disabled={isDeleting}
                                        className="w-full py-5 bg-red-600 hover:bg-red-700 text-white rounded-[24px] font-black text-xs uppercase tracking-widest transition-all active:scale-[0.95] shadow-2xl shadow-red-600/40 disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isDeleting && <span className="material-icons-round animate-spin">autorenew</span>}
                                        Confirm Final Purge
                                    </button>
                                )}

                                <button
                                    onClick={() => {
                                        setDeleteModalOpen(false);
                                        setConfirmDeleteInfo(null);
                                    }}
                                    disabled={isDeleting}
                                    className="w-full py-5 text-slate-400 hover:text-slate-800 font-black text-xs uppercase tracking-widest transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
