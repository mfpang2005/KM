import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { UserRole } from '../types';

interface LoginProps {
    onLogin: (role: UserRole) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.ADMIN);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const navigateByRole = (role: UserRole) => {
        if (role === UserRole.SUPER_ADMIN) navigate('/super-admin');
        if (role === UserRole.ADMIN) navigate('/admin');
        if (role === UserRole.KITCHEN) navigate('/kitchen');
        if (role === UserRole.DRIVER) navigate('/driver');
    };

    // NOTE: 页面加载时检查是否已有有效 session（实现“刷新不登出”）
    React.useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const role = session.user.user_metadata?.role;
                if (role) navigateByRole(role as UserRole);
            }
        });
    }, [navigate]);

    const handleLogin = async () => {
        if (!email || !password) {
            alert('请输入邮箱和密码');
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            const { data: profile } = await supabase
                .from('users')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (profile?.role === UserRole.SUPER_ADMIN) {
                await supabase.auth.signOut();
                alert('检测到超管权限：请前往管理端后台登录。');
                return;
            }

            // 如果 profile 中有角色，以 profile 为准
            const finalRole = profile?.role || selectedRole;

            onLogin(finalRole as UserRole);
            navigateByRole(finalRole as UserRole);
        } catch (error) {
            console.error('登录失败:', error);
            alert(`登录失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0f18] text-white selection:bg-indigo-500/30 relative overflow-hidden">
            {/* Visual Accents */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-fuchsia-600/5 blur-[120px] rounded-full pointer-events-none translate-y-1/2 -translate-x-1/4"></div>

            <div className="pt-24 pb-12 flex flex-col items-center relative z-10 transition-all">
                <div className="w-16 h-16 bg-white rounded-[24px] flex items-center justify-center mb-8 shadow-3xl shadow-white/10 border border-white/20 animate-in zoom-in duration-700">
                    <span className="material-icons-round text-3xl text-slate-950">diamond</span>
                </div>
                <h1 className="text-sm font-black text-slate-500 mb-2 uppercase tracking-[0.6em] animate-in fade-in duration-1000">Welcome Back</h1>
                <p className="text-[32px] font-black text-white tracking-tighter uppercase text-center px-10 leading-none italic animate-in slide-in-from-bottom-4 duration-700">
                    KIM LONG CENTRAL <br /> <span className="text-indigo-500">ECOSYSTEM</span>
                </p>
                <div className="h-1 w-12 bg-indigo-600 rounded-full mt-8 shadow-glow shadow-indigo-500/50"></div>
            </div>

            <div className="px-8 mb-10 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150">
                <p className="text-[10px] text-slate-600 font-black tracking-[0.4em] uppercase mb-6 pl-2">Select Your Operations Portal</p>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { role: UserRole.ADMIN, icon: 'admin_panel_settings', label: 'ADMIN' },
                        { role: UserRole.KITCHEN, icon: 'soup_kitchen', label: 'CATERING' },
                        { role: UserRole.DRIVER, icon: 'local_shipping', label: 'LOGISTICS' }
                    ].map((item) => (
                        <button
                            key={item.role}
                            onClick={() => setSelectedRole(item.role)}
                            className={`flex flex-col items-center justify-center p-4 rounded-[32px] border transition-all h-32 active:scale-95 duration-500 ${selectedRole === item.role
                                ? 'border-white/20 bg-white shadow-3xl'
                                : 'border-white/5 bg-white/[0.02] opacity-40 grayscale'
                                }`}
                        >
                            <div className={`w-12 h-12 flex items-center justify-center rounded-2xl mb-4 transition-all duration-500 ${selectedRole === item.role
                                ? 'bg-slate-950 text-white shadow-xl' : 'bg-slate-800 text-slate-500'
                                }`}>
                                <span className="material-icons-round text-2xl">{item.icon}</span>
                            </div>
                            <span className={`text-[10px] font-black tracking-widest ${selectedRole === item.role ? 'text-slate-950' : 'text-slate-500'}`}>
                                {item.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-8 flex-1 flex flex-col gap-5 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-500 transition-colors group-focus-within:text-indigo-400">
                        <span className="material-icons-round text-lg">alternate_email</span>
                    </div>
                    <input
                        className="block w-full pl-14 pr-6 py-6 bg-white/[0.03] border border-white/5 rounded-[24px] text-[11px] font-black text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all outline-none placeholder-slate-700 uppercase tracking-widest"
                        placeholder="SECURITY EMAIL IDENTIFIER"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-500 transition-colors group-focus-within:text-indigo-400">
                        <span className="material-icons-round text-lg">lock_open</span>
                    </div>
                    <input
                        className="block w-full pl-14 pr-14 py-6 bg-white/[0.03] border border-white/5 rounded-[24px] text-[11px] font-black text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all outline-none placeholder-slate-700 uppercase tracking-widest"
                        placeholder="DECRYPT ACCESS KEY"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLogin();
                        }}
                    />
                </div>

                <div className="flex justify-between items-center px-2">
                    <div className="flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-glow shadow-emerald-500/50"></div>
                         <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest">Network Status: Secured</p>
                    </div>
                    <button className="text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-indigo-400 transition-all border-b border-white/5 pb-0.5">
                        RECOVERY ACCESS
                    </button>
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full py-6 mt-6 bg-white text-slate-950 rounded-[32px] shadow-3xl text-sm font-black active:scale-[0.97] transition-all uppercase tracking-[0.5em] disabled:opacity-30 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                    <span className="relative z-10">{loading ? 'AUTHENTICATING...' : 'ESTABLISH LINK'}</span>
                </button>

                <div className="mt-12 mb-12 flex flex-col items-center gap-4">
                    <p className="text-[10px] text-center text-slate-600 font-black leading-relaxed uppercase tracking-[0.2em] italic">
                        Restricted Access. <br /> Private Network Property of Kim Long.
                    </p>
                    <div className="flex gap-2">
                        <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                        <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                        <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;