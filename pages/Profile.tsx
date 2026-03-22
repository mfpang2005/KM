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

    const handleLogout = () => {
        onLogout();
        navigate('/login');
    };

    return (
        <div className="flex flex-col h-full bg-background-light">
            <header className="pt-12 pb-6 px-6 bg-white flex flex-col items-center border-b border-slate-100">
                <div className="w-24 h-24 rounded-full border-4 border-primary/10 p-1 mb-4">
                    <div className="w-full h-full bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="material-icons-round text-slate-400 text-4xl">person</span>
                    </div>
                </div>
                <h2 className="text-xl font-bold text-slate-900">系统管理员</h2>
                <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Admin ID: #001</p>
            </header>

            <main className="flex-1 p-6 space-y-6">
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">个人资料与设置 (Personal Info)</h3>
                    
                    {message && (
                        <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                            <span className="material-icons-round text-sm">{message.type === 'success' ? 'check_circle' : 'error'}</span>
                            {message.text}
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
                        <div className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400导致 uppercase tracking-widest ml-1">电子邮箱 (Email)</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all text-sm font-bold"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400导致 uppercase tracking-widest ml-1">联系电话 (Phone)</label>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all text-sm font-bold"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400导致 uppercase tracking-widest ml-1">修改密码 (Password)</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all text-sm font-bold"
                                />
                            </div>
                        </div>

                        <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50">
                            <div className="flex items-center gap-3">
                                <span className="material-icons-round text-slate-400 text-lg">language</span>
                                <span className="text-sm font-medium">语言设置 (Language)</span>
                            </div>
                            <span className="text-xs text-slate-400">中文</span>
                        </button>
                    </div>

                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                <span className="material-icons-round text-lg">save</span>
                                保存更改 (Save Profile)
                            </>
                        )}
                    </button>
                </div>

                <button 
                    onClick={handleLogout}
                    className="w-full py-4 bg-white border border-red-100 rounded-2xl text-primary font-bold text-sm shadow-sm active:bg-red-50 transition-colors"
                >
                    退出登录
                </button>
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
