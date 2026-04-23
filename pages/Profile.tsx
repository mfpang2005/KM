import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserService } from '../src/services/api';
import { supabase } from '../src/lib/supabase';
import type { User } from '../types';

interface ProfileProps {
    onLogout: () => void;
}

const Profile: React.FC<ProfileProps> = ({ onLogout }) => {
    const navigate = useNavigate();
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    
    // Editable state
    const [email, setEmail] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [isEditingPassword, setIsEditingPassword] = React.useState(false);
    const [isEditingMode, setIsEditingMode] = React.useState(false);
    const [message, setMessage] = React.useState<{type: 'success' | 'error', text: string} | null>(null);

    React.useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.id) {
                    const profile = await UserService.getCurrentUser(session.user.id);
                    setUser(profile);
                    setEmail(profile.email || '');
                    setPhone(profile.phone || '');
                }
            } catch (err) {
                console.error("Failed to fetch profile", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setMessage(null);
        try {
            const updates: Partial<User> = {
                email,
                phone
            };
            
            // If password is provided, update it via Supabase Auth
            if (password) {
                const { error: authError } = await supabase.auth.updateUser({ password });
                if (authError) throw authError;
            }

            await UserService.updateProfile(user.id, updates);
            setMessage({ type: 'success', text: '个人资料已更新' });
            setPassword(''); // Clear password field after success
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || '更新失败，请重试' });
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        onLogout();
        navigate('/login');
    };

    return (
        <div className="flex flex-col h-full bg-background-light">
            <header className="pt-12 pb-6 px-6 bg-white flex flex-col items-center border-b border-slate-100">
                <div className="w-24 h-24 rounded-full border-4 border-primary/10 p-1 mb-4 relative overflow-hidden group">
                    <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center overflow-hidden">
                        {user?.avatar_url ? (
                            <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-icons-round text-slate-400 text-4xl">
                                {user?.role === 'driver' ? 'local_shipping' : 'person'}
                            </span>
                        )}
                    </div>
                    {/* Badge for role */}
                    <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full border-2 border-white flex items-center justify-center shadow-lg">
                        <span className="material-icons-round text-white text-[14px]">
                            {user?.role === 'super_admin' ? 'verified_user' : 'badge'}
                        </span>
                    </div>
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {user?.name || user?.email?.split('@')[0] || '加载中...'}
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {user?.role?.replace('_', ' ')} ID: #{user?.employee_id || '000'}
                </p>
            </header>

            <main className="flex-1 p-6">
                {!isEditingMode ? (
                    /* Display Mode - Simple & Clean */
                    <div className="flex flex-col items-center justify-center pt-8 space-y-8 animate-in fade-in duration-500">
                        <div className="w-full bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col items-center gap-6">
                            <div className="flex flex-col items-center text-center">
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Account Status</span>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Active & Verified
                                </div>
                            </div>
                            
                            <div className="w-full h-px bg-slate-50"></div>
                            
                            <button 
                                onClick={() => setIsEditingMode(true)}
                                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                <span className="material-icons-round text-lg">edit</span>
                                编辑资料 (Edit Profile)
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Editing Mode - Full Form */
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">编辑个人资料 (Editing Mode)</h3>
                            <button onClick={() => setIsEditingMode(false)} className="text-[10px] font-black text-primary uppercase underline">取消编辑</button>
                        </div>
                        
                        {message && (
                            <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                <span className="material-icons-round text-sm">{message.type === 'success' ? 'check_circle' : 'error'}</span>
                                {message.text}
                            </div>
                        )}

                        <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
                            <div className="p-8 space-y-8">
                                {/* Email - Static */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">电子邮箱 (Email)</label>
                                        <span className="material-icons-round text-[14px] text-slate-200">lock</span>
                                    </div>
                                    <div className="px-4 py-3 bg-slate-50/50 rounded-xl border border-slate-50 text-sm font-black text-slate-400 italic">
                                        {email || '未设置'}
                                    </div>
                                </div>

                                {/* Phone - Static */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">联系电话 (Phone)</label>
                                        <span className="material-icons-round text-[14px] text-slate-200">lock</span>
                                    </div>
                                    <div className="px-4 py-3 bg-slate-50/50 rounded-xl border border-slate-50 text-sm font-black text-slate-400 italic">
                                        {phone || '未设置'}
                                    </div>
                                </div>

                                {/* Password Area */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">修改密码 (Password)</label>
                                        <button 
                                            onClick={() => setIsEditingPassword(!isEditingPassword)}
                                            className="text-[10px] font-black text-primary uppercase tracking-widest"
                                        >
                                            {isEditingPassword ? '取消修改' : '点击修改 (CHANGE)'}
                                        </button>
                                    </div>
                                    
                                    {isEditingPassword ? (
                                        <input
                                            type="password"
                                            autoFocus
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="输入新密码"
                                            className="w-full px-4 py-3.5 bg-white border-2 border-primary/20 rounded-2xl text-sm font-black text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                                        />
                                    ) : (
                                        <div className="px-4 py-3 bg-slate-50/50 rounded-xl border border-slate-50 text-sm font-black text-slate-200 tracking-[0.4em]">
                                            ••••••••
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button className="w-full p-6 flex items-center justify-between bg-slate-50/50 border-t border-slate-50">
                                <div className="flex items-center gap-3">
                                    <span className="material-icons-round text-slate-400 text-lg">language</span>
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-600">语言设置 (Language)</span>
                                </div>
                                <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-1 rounded-md">中文</span>
                            </button>
                        </div>

                        <button 
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full py-5 bg-primary text-white rounded-[24px] font-black text-sm uppercase tracking-[0.1em] shadow-2xl shadow-primary/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                        >
                            {saving ? (
                                <span className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    <span className="material-icons-round text-xl">save</span>
                                    保存更改 (Save Profile)
                                </>
                            )}
                        </button>
                    </div>
                )}

                <div className="mt-12 px-2">
                    <button 
                        onClick={handleLogout}
                        className="w-full py-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-primary transition-colors flex items-center justify-center gap-2"
                    >
                        <span className="material-icons-round text-lg">logout</span>
                        退出登录 (Sign Out)
                    </button>
                </div>
            </main>

            <nav className="bg-white border-t border-slate-100 px-6 py-4 flex justify-between items-center safe-bottom">
                <button onClick={() => navigate('/admin')} className="flex flex-col items-center gap-1 text-slate-400">
                    <span className="material-icons-round">dashboard</span>
                    <span className="text-[10px] font-medium">控制台</span>
                </button>
                <button onClick={() => navigate('/admin/finance')} className="flex flex-col items-center gap-1 text-slate-400">
                    <span className="material-icons-round">analytics</span>
                    <span className="text-[10px] font-medium">报表</span>
                </button>
                <button onClick={() => navigate('/admin/notifications')} className="flex flex-col items-center gap-1 text-slate-400">
                    <span className="material-icons-round">notifications</span>
                    <span className="text-[10px] font-medium">消息</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-primary">
                    <span className="material-icons-round">person</span>
                    <span className="text-[10px] font-bold">我的</span>
                </button>
            </nav>
        </div>
    );
};

export default Profile;
