import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SuperAdminService } from '../services/api';
import { UserRole } from '../types';
import type { User } from '../types';
import { supabase } from '../lib/supabase';

const PERMISSION_ITEMS = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'financial', label: 'Financial', icon: 'account_balance_wallet' },
    { id: 'create_order', label: 'Create New Order', icon: 'add_shopping_cart' },
    { id: 'order', label: 'Order', icon: 'receipt_long' },
    { id: 'event_calendar', label: 'Event Calendar', icon: 'calendar_month' },
    { id: 'fleet', label: 'Fleet Central', icon: 'local_shipping' },
    { id: 'walkie_talkie', label: 'Walkie Talkie', icon: 'settings_voice' },
    { id: 'kitchen', label: 'Kitchen Management', icon: 'precision_manufacturing' },
    { id: 'product', label: 'Product', icon: 'inventory_2' },
    { id: 'inventory', label: 'Stock Inventory', icon: 'inventory' },
    { id: 'user', label: 'User', icon: 'people' },
    { id: 'audit', label: 'Audit Log', icon: 'history' },
];

export const UsersPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [isScrolled, setIsScrolled] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Focus search input when expanded
    useEffect(() => {
        if (isSearchExpanded && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchExpanded]);

    // Scroll listener for collapsible header
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 40);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Sync state with URL parameters
    useEffect(() => {
        const search = searchParams.get('search');
        if (search !== null) setSearchQuery(search);
    }, [searchParams]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newUserForm, setNewUserForm] = useState<{ email: string; role: UserRole; name: string; password?: string; employee_id?: string; phone?: string; department?: string; position?: string; avatar_url?: string; permissions?: Record<string, boolean> }>({
        email: '',
        role: UserRole.DRIVER,
        name: '',
        password: '',
        employee_id: '',
        phone: '',
        department: '',
        position: '',
        permissions: {},
        avatar_url: ''
    });
    
    const [showEditModal, setShowEditModal] = useState(false);
    const [editUserForm, setEditUserForm] = useState<{ id: string; email: string; role: UserRole; name: string; password?: string; employee_id?: string; phone?: string; department?: string; position?: string; status?: 'active' | 'pending' | 'deleted'; avatar_url?: string; permissions?: Record<string, boolean> }>({
        id: '',
        email: '',
        role: UserRole.DRIVER,
        name: '',
        password: '',
        employee_id: '',
        phone: '',
        department: '',
        position: '',
        status: 'active',
        permissions: {},
        avatar_url: ''
    });

    // 双重确认弹窗状态
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [confirmDeleteInfo, setConfirmDeleteInfo] = useState<{ id: string; email: string } | null>(null);
    const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
    const [isDeleting, setIsDeleting] = useState(false);
    const [rtStatus, setRtStatus] = useState<string>('CONNECTING');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadUsers())
            .subscribe((status) => setRtStatus(status));
        return () => { supabase.removeChannel(channel); };
    }, [loadUsers]);

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

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('Image size must be less than 2MB');
            return;
        }

        setIsUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            if (isEdit) {
                setEditUserForm(prev => ({ ...prev, avatar_url: publicUrl }));
            } else {
                setNewUserForm(prev => ({ ...prev, avatar_url: publicUrl }));
            }
        } catch (error: any) {
            console.error('Error uploading avatar:', error);
            alert(`Upload failed: ${error.message || 'Check if "avatars" bucket exists and is public.'}`);
        } finally {
            setIsUploading(false);
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
            setNewUserForm({ email: '', role: UserRole.DRIVER, name: '', password: '', employee_id: '', phone: '', department: '', position: '', permissions: {} });
            await loadUsers();
        } catch (error) {
            console.error('Failed to create user', error);
            alert('Failed to create internal user.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editUserForm.password && editUserForm.password.length > 0 && editUserForm.password.length < 6) {
            alert('Password must be at least 6 characters if provided.');
            return;
        }
        try {
            setLoading(true);
            const { id, ...updateData } = editUserForm;
            // Only send password if it has been touched/changed
            if (!updateData.password) {
                delete updateData.password;
            }
            // Provide all modified fields. API allows updating password if present.
            await SuperAdminService.updateUser(id, updateData);
            setShowEditModal(false);
            await loadUsers();
        } catch (error: any) {
            console.error('Failed to update user', error);
            const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
            alert(`Failed to update user: ${errorMsg}`);
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
        [UserRole.ACCOUNT]: 'bg-gradient-to-r from-rose-500/10 to-pink-500/10 text-rose-700 border-rose-200/50 shadow-sm shadow-rose-500/5',
    };


    return (
        <div className="mt-10 mx-auto max-w-[1600px] px-4 min-h-screen bg-[#FDFDFF] pb-20">
            {/* Modern Header Section - Collapsible & Balanced */}
            <div className={`sticky top-0 z-[10] transition-all duration-500 ease-in-out ${
                isScrolled 
                ? 'bg-white/90 backdrop-blur-2xl border-b border-slate-100 py-2 shadow-sm' 
                : 'bg-transparent py-5'
            }`}>
                <div className="absolute top-0 left-0 w-full h-[140px] bg-gradient-to-b from-blue-50/40 via-indigo-50/5 to-transparent -z-10 opacity-100 transition-opacity duration-500" style={{ opacity: isScrolled ? 0 : 1 }}></div>
                
                <div className={`max-w-7xl mx-auto px-6 flex items-center justify-between transition-all duration-500 ${isScrolled ? 'gap-4' : 'gap-8'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`relative transition-all duration-500 ${isScrolled ? 'scale-75 origin-left' : 'scale-90 origin-left'}`}>
                            <span className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
                                <span className="material-icons-round text-[22px]">manage_accounts</span>
                            </span>
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-md">
                                <span className={`w-1.5 h-1.5 rounded-full ${rtStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                            </div>
                        </div>
                        
                        <div className="flex flex-col justify-center">
                            <div className="flex items-center gap-4">
                                <h1 className={`font-black text-slate-900 tracking-tight transition-all duration-500 flex items-center ${isScrolled ? 'text-lg' : 'text-xl lg:text-3xl'}`}>
                                    用户管理 <span className="text-blue-600 ml-1">.</span>
                                </h1>
                                
                                {/* Dynamic Search Bar - Smooth Expansion to the left */}
                                <div className="flex items-center ml-2">
                                    <div className={`flex items-center transition-all duration-500 ease-in-out overflow-hidden ${
                                        isSearchExpanded ? 'w-[180px] md:w-[320px] opacity-100 pointer-events-auto' : 'w-0 opacity-0 pointer-events-none'
                                    }`}>
                                        <div className="relative w-full">
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                placeholder="搜索姓名、邮箱..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                className="w-full pl-4 pr-9 py-1.5 bg-white/50 backdrop-blur-md border border-slate-200 rounded-xl text-[11px] font-bold focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all placeholder:text-slate-300"
                                            />
                                            {searchQuery && (
                                                <button 
                                                    onClick={() => setSearchQuery('')}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                                >
                                                    <span className="material-icons-round text-sm">cancel</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ml-1 ${
                                            isSearchExpanded ? 'text-blue-600 bg-blue-50 border border-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent'
                                        }`}
                                        title={isSearchExpanded ? "Close Search" : "Search Member"}
                                    >
                                        <span className="material-icons-round text-[20px]">{isSearchExpanded ? 'close' : 'search'}</span>
                                    </button>
                                </div>
                            </div>
                            
                            <div className={`flex items-center gap-2 transition-all duration-500 ${isScrolled ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 mt-1'}`}>
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-indigo-100/50">
                                    Identity Management
                                </span>
                                {rtStatus === 'SUBSCRIBED' && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-wider border border-emerald-100/50">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                        Live
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowAddModal(true)}
                            className={`group relative flex items-center justify-center bg-slate-900 text-white rounded-[18px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all duration-300 shadow-xl shadow-slate-900/10 hover:shadow-blue-500/20 active:scale-95 overflow-hidden ${
                                isScrolled ? 'px-4 py-2 text-[8px] gap-2' : 'px-6 py-3 text-[9px] gap-2.5'
                            }`}
                        >
                            <span className="material-icons-round text-[16px]">person_add</span>
                            <span>Add Member</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-6 pt-10">

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
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {filteredUsers.map(user => (
                                <div key={user.id} className="group relative bg-white/80 backdrop-blur-2xl border border-white rounded-[24px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-500 hover:shadow-[0_15px_40px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:bg-white">
                                    {/* Accent Line */}
                                    <div className="absolute top-6 left-0 w-1 h-8 bg-slate-100 group-hover:bg-blue-600 rounded-r-full transition-all duration-500 group-hover:h-12"></div>
                                    
                                    <div className="flex items-center gap-4 flex-1 min-w-0 ml-1">
                                        <div className="relative shrink-0">
                                            <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/50 flex items-center justify-center overflow-hidden shadow-inner group-hover:rotate-2 group-hover:scale-105 transition-all duration-500">
                                                {user.avatar_url ? (
                                                    <img 
                                                        src={user.avatar_url} 
                                                        alt={user.name} 
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="text-slate-400 font-black text-xl group-hover:text-blue-600 transition-colors">
                                                        {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                                    </span>
                                                )}
                                            </div>
                                            {user.status === 'active' && !user.is_disabled && (
                                                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-white z-10">
                                                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <h3 className="text-lg font-black text-slate-800 truncate group-hover:text-blue-600 transition-colors tracking-tight">
                                                    {user.name || 'Anonymous User'}
                                                </h3>
                                                <div className="flex items-center gap-1.5">
                                                    {user.employee_id && (
                                                        <span className="px-2 py-0.5 bg-slate-900 text-white text-[8px] rounded-lg font-black uppercase tracking-widest">
                                                            {user.employee_id}
                                                        </span>
                                                    )}
                                                    {user.department && (
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] rounded-lg font-black uppercase tracking-widest border border-blue-100">
                                                            {user.department}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col gap-0.5 text-xs font-bold text-slate-400">
                                                <div className="flex items-center gap-2 group/email hover:text-slate-700 transition-colors">
                                                    <span className="material-icons-round text-sm text-slate-300 group-hover/email:text-blue-500 transition-colors">alternate_email</span>
                                                    <span className="truncate">{user.email}</span>
                                                </div>
                                                {user.phone && (
                                                    <div className="flex items-center gap-2 group/phone hover:text-slate-700 transition-colors">
                                                        <span className="material-icons-round text-sm text-slate-300 group-hover/phone:text-blue-500 transition-colors">call</span>
                                                        <span>{user.phone}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-50">
                                        <div className="flex flex-col items-start sm:items-end">
                                            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">System Role</span>
                                            <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all duration-300 ${roleColors[user.role] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                {user.role}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 relative z-20">
                                            {user.status === 'pending' && (
                                                <button
                                                    onClick={() => handleApproveUser(user.id)}
                                                    className="h-10 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-500/10 active:scale-95 flex items-center gap-1.5 group border border-emerald-400/10"
                                                >
                                                    <span className="material-icons-round text-sm group-hover:scale-110 transition-transform">check_circle</span>
                                                    <span>Approve</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setEditUserForm({
                                                        id: user.id,
                                                        email: user.email || '',
                                                        role: user.role,
                                                        name: user.name || '',
                                                        password: '',
                                                        employee_id: user.employee_id || '',
                                                        phone: user.phone || '',
                                                        department: user.department || '',
                                                        position: user.position || '',
                                                        status: user.status || 'active',
                                                        avatar_url: user.avatar_url || '',
                                                        permissions: user.permissions || {}
                                                    });
                                                    setShowEditModal(true);
                                                }}
                                                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all rounded-xl shadow-sm active:scale-90"
                                                title="Edit Member"
                                            >
                                                <span className="material-icons-round text-lg">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id, user.email)}
                                                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50 transition-all rounded-xl shadow-sm active:scale-90"
                                                title="Delete User"
                                            >
                                                <span className="material-icons-round text-lg">delete_outline</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add User Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden relative border border-slate-100 animate-in zoom-in-95 duration-300">
                            {/* Compact Header */}
                            <div className="p-8 border-b border-slate-50 bg-gradient-to-br from-slate-50/50 to-white flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                        <span className="material-icons-round text-2xl">person_add</span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-slate-900 tracking-tight">添加新成员</h2>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Add Member</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 transition-all active:scale-95"
                                >
                                    <span className="material-icons-round">close</span>
                                </button>
                            </div>

                            <form onSubmit={handleCreateInternalUser} className="p-8 space-y-6">
                                {/* Group: Basic Info */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">姓名 (Full Name)</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="输入员工姓名"
                                                value={newUserForm.name}
                                                onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">工号 (Staff ID)</label>
                                            <input
                                                type="text"
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="KL-XXXX"
                                                value={newUserForm.employee_id}
                                                onChange={e => setNewUserForm({ ...newUserForm, employee_id: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">电子邮箱 (Email)</label>
                                            <input
                                                type="email"
                                                required
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="staff@kimlong.com"
                                                value={newUserForm.email}
                                                onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">联系电话 (Phone)</label>
                                            <input
                                                type="text"
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="012-3456789"
                                                value={newUserForm.phone}
                                                onChange={e => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Group: Security & Permissions */}
                                <div className="pt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">登录密码 (Password)</label>
                                            <input
                                                type="password"
                                                required
                                                minLength={6}
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="至少 6 位密码"
                                                value={newUserForm.password}
                                                onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">系统角色 (Role)</label>
                                            <select
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold outline-none cursor-pointer"
                                                value={newUserForm.role}
                                                onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                                            >
                                                <option value={UserRole.DRIVER}>Fleet Driver (司机)</option>
                                                <option value={UserRole.KITCHEN}>Kitchen Staff (厨房)</option>
                                                <option value={UserRole.ACCOUNT}>Accounts / Finance (财务)</option>
                                                <option value={UserRole.ADMIN}>Administrator (管理员)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">归属部门 (Department)</label>
                                            <select
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold outline-none cursor-pointer"
                                                value={newUserForm.department}
                                                onChange={e => setNewUserForm({ ...newUserForm, department: e.target.value })}
                                            >
                                                <option value="">未分配 (None)</option>
                                                <option value="Kitchen Department">Kitchen Department</option>
                                                <option value="Driver Department">Driver Department</option>
                                                <option value="Admin Department">Admin Department</option>
                                                <option value="Account Department">Account Department</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 pt-6">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="flex-1 py-4 bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 font-black text-[11px] uppercase tracking-widest rounded-2xl transition-all"
                                    >
                                        取消 (Cancel)
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        {loading ? (
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                        ) : (
                                            <span className="material-icons-round text-sm">verified_user</span>
                                        )}
                                        添加新成员 (Add Member)
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Edit User Modal */}
                {showEditModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden relative border border-slate-100 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                            <div className="sticky top-0 z-10 p-8 border-b border-slate-50 bg-gradient-to-br from-slate-50/90 to-white/90 backdrop-blur-xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                        <span className="material-icons-round text-2xl">manage_accounts</span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-slate-900 tracking-tight">更改员工资讯</h2>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Edit Member Profile</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowEditModal(false)}
                                    className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 transition-all active:scale-95"
                                >
                                    <span className="material-icons-round">close</span>
                                </button>
                            </div>

                            <div className="px-8 pt-6">
                                <div className="flex flex-col items-center">
                                    <div className="relative group/avatar">
                                        <div className="w-24 h-24 rounded-[32px] bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover/avatar:border-blue-400 group-hover/avatar:bg-blue-50/30">
                                            {editUserForm.avatar_url ? (
                                                <img src={editUserForm.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                                            ) : (
                                                <span className="material-icons-round text-3xl text-slate-300">add_a_photo</span>
                                            )}
                                            {isUploading && (
                                                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                                                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="absolute -bottom-2 -right-2 w-10 h-10 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center hover:bg-blue-700 transition-all active:scale-90"
                                        >
                                            <span className="material-icons-round text-lg">camera_alt</span>
                                        </button>
                                        <input 
                                            ref={fileInputRef}
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={(e) => handleAvatarUpload(e, true)}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">点击图标上传头像 (Max 2MB)</p>
                                </div>
                            </div>

                            <form onSubmit={handleUpdateUser} className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">姓名 (Full Name)</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="输入员工姓名"
                                                value={editUserForm.name}
                                                onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">状态 (Status)</label>
                                            <select
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold outline-none cursor-pointer"
                                                value={editUserForm.status}
                                                onChange={e => setEditUserForm({ ...editUserForm, status: e.target.value as 'active' | 'pending' | 'deleted' })}
                                            >
                                                <option value="active">Active (激活)</option>
                                                <option value="pending">Pending (待审核)</option>
                                                <option value="deleted">Deleted (已停用)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">电子邮箱 (Email)</label>
                                            <input
                                                type="email"
                                                required
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="staff@kimlong.com"
                                                value={editUserForm.email}
                                                onChange={e => setEditUserForm({ ...editUserForm, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">联系电话 (Phone)</label>
                                            <input
                                                type="text"
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold"
                                                placeholder="012-3456789"
                                                value={editUserForm.phone}
                                                onChange={e => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1.5 pt-2 border-t border-slate-100 mt-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">新登录密码 (Set New Password)</label>
                                        <input
                                            type="text"
                                            className="w-full px-5 py-3.5 bg-rose-50/50 border border-rose-100 rounded-xl focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/5 transition-all text-sm font-bold placeholder:text-rose-300"
                                            placeholder="如有需要可在此输入新密码 (留空则不修改)"
                                            value={editUserForm.password}
                                            onChange={e => setEditUserForm({ ...editUserForm, password: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">系统角色 (Role)</label>
                                            <select
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold outline-none cursor-pointer"
                                                value={editUserForm.role}
                                                onChange={e => setEditUserForm({ ...editUserForm, role: e.target.value as UserRole })}
                                            >
                                                <option value={UserRole.DRIVER}>Fleet Driver (司机)</option>
                                                <option value={UserRole.KITCHEN}>Kitchen Staff (厨房)</option>
                                                <option value={UserRole.ACCOUNT}>Accounts / Finance (财务)</option>
                                                <option value={UserRole.ADMIN}>Administrator (管理员)</option>
                                                <option value={UserRole.SUPER_ADMIN}>Super Admin (超级管理)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">归属部门 (Department)</label>
                                            <select
                                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold outline-none cursor-pointer"
                                                value={editUserForm.department}
                                                onChange={e => setEditUserForm({ ...editUserForm, department: e.target.value })}
                                            >
                                                <option value="">未分配 (None)</option>
                                                <option value="Kitchen Department">Kitchen Department</option>
                                                <option value="Driver Department">Driver Department</option>
                                                <option value="Admin Department">Admin Department</option>
                                                <option value="Account Department">Account Department</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">职位等级 (Position)</label>
                                        <select
                                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all text-sm font-bold outline-none cursor-pointer"
                                            value={editUserForm.position}
                                            onChange={e => setEditUserForm({ ...editUserForm, position: e.target.value })}
                                        >
                                            <option value="">未分配 (None)</option>
                                            <option value="HEAD OF DEPARTMENT - HOD">HEAD OF DEPARTMENT - HOD</option>
                                            <option value="ASSITANT HOD">ASSITANT HOD</option>
                                            <option value="EXECUTIVE">EXECUTIVE</option>
                                            <option value="SENIOR">SENIOR</option>
                                            <option value="JUNIOR">JUNIOR</option>
                                            <option value="INTERN">INTERN</option>
                                        </select>
                                    </div>
                                    
                                    {/* 授权进入页面 (Page Access Authorization) - Clean & Young Design */}
                                    <div className="pt-8 border-t border-slate-100 mt-2">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-6 bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.3)]"></div>
                                                <div>
                                                    <h3 className="text-sm font-black text-slate-800 tracking-tight">授权进入页面</h3>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">Access Privileges</p>
                                                </div>
                                            </div>
                                            {editUserForm.role === UserRole.SUPER_ADMIN && (
                                                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-wider border border-blue-100">Full Access</span>
                                            )}
                                        </div>
                                        
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {PERMISSION_ITEMS.map((item) => {
                                                const isEnabled = editUserForm.permissions?.[item.id] || false;
                                                const isSuperAdmin = editUserForm.role === UserRole.SUPER_ADMIN;
                                                
                                                return (
                                                    <div 
                                                        key={item.id}
                                                        onClick={() => {
                                                            if (isSuperAdmin) return;
                                                            const newPerms = { ...editUserForm.permissions, [item.id]: !isEnabled };
                                                            setEditUserForm({ ...editUserForm, permissions: newPerms });
                                                        }}
                                                        className={`group relative flex items-center gap-2.5 p-2.5 rounded-[20px] border transition-all duration-500 cursor-pointer ${
                                                            isSuperAdmin 
                                                                ? 'bg-slate-50 border-slate-100 opacity-60 grayscale cursor-not-allowed'
                                                                : isEnabled 
                                                                    ? 'bg-gradient-to-br from-blue-50 to-white border-blue-200 shadow-sm' 
                                                                    : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'
                                                        }`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-500 ${
                                                            isEnabled ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-50 text-slate-400'
                                                        }`}>
                                                            <span className="material-icons-round text-lg">{item.icon}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-[9px] font-black uppercase tracking-tight truncate transition-colors ${isEnabled ? 'text-blue-700' : 'text-slate-500'}`}>
                                                                {item.label}
                                                            </p>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                                            isEnabled ? 'bg-blue-600 border-blue-600 scale-110 shadow-md shadow-blue-500/20' : 'border-slate-200'
                                                        }`}>
                                                            {isEnabled && <span className="material-icons-round text-[12px] text-white font-bold">check</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {editUserForm.role === UserRole.SUPER_ADMIN && (
                                            <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                                                    <span className="material-icons-round text-blue-600 text-sm">auto_awesome</span>
                                                </div>
                                                <p className="text-[10px] text-blue-600 font-bold leading-tight">
                                                    超级管理员自动拥有所有页面权限，无需手动配置。
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 pt-8">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="flex-1 py-4 bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 font-black text-[11px] uppercase tracking-widest rounded-2xl transition-all"
                                    >
                                        取消 (Cancel)
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        {loading ? (
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                        ) : (
                                            <span className="material-icons-round text-sm">save</span>
                                        )}
                                        确认更改 (Save Profile)
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
        </div>
    );
};
