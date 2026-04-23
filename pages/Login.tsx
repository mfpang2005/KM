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
        <div className="flex flex-col min-h-screen bg-background-beige text-primary selection:bg-primary/10 relative overflow-y-auto no-scrollbar">
            {/* Visual Accents */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary-warm/5 blur-[120px] rounded-full pointer-events-none translate-y-1/2 -translate-x-1/4"></div>

            <div className="pt-16 sm:pt-24 pb-8 flex flex-col items-center relative z-10 transition-all">
                <h1 className="text-[9px] sm:text-sm font-black text-primary-light mb-2 uppercase tracking-[0.4em] sm:tracking-[0.6em] animate-in fade-in duration-1000">Welcome Back</h1>
                <p className="text-[24px] sm:text-[32px] font-black text-primary tracking-tighter uppercase text-center px-6 sm:px-10 leading-none italic animate-in slide-in-from-bottom-4 duration-700">
                    KIM LONG CENTRAL
                </p>
            </div>

            <div className="px-6 sm:px-8 mb-8 sm:mb-10 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150">
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {[
                        { role: UserRole.ADMIN, icon: 'admin_panel_settings', label: 'ADMIN' },
                        { role: UserRole.KITCHEN, icon: 'soup_kitchen', label: 'KITCHEN' },
                        { role: UserRole.DRIVER, icon: 'local_shipping', label: 'DRIVER' }
                    ].map((item) => (
                        <button
                            key={item.role}
                            onClick={() => setSelectedRole(item.role)}
                            className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-[24px] sm:rounded-[32px] border transition-all h-28 sm:h-32 active:scale-95 duration-500 ${selectedRole === item.role
                                ? 'border-primary/20 bg-white shadow-2xl shadow-primary/5'
                                : 'border-primary/5 bg-primary/[0.02] opacity-40 grayscale'
                                }`}
                        >
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl mb-3 sm:mb-4 transition-all duration-500 ${selectedRole === item.role
                                ? 'bg-primary text-white shadow-xl' : 'bg-surface-beige text-primary-light'
                                }`}>
                                <span className="material-icons-round text-xl sm:text-2xl">{item.icon}</span>
                            </div>
                            <span className={`text-[8px] sm:text-[10px] font-black tracking-widest ${selectedRole === item.role ? 'text-primary' : 'text-primary-light'}`}>
                                {item.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-6 sm:px-8 flex-1 flex flex-col gap-4 sm:gap-5 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 sm:pl-5 flex items-center pointer-events-none text-primary-light/50 transition-colors group-focus-within:text-primary">
                        <span className="material-icons-round text-base sm:text-lg">alternate_email</span>
                    </div>
                    <input
                        className="block w-full pl-12 sm:pl-14 pr-6 py-5 sm:py-6 bg-white border border-primary/5 rounded-[20px] sm:rounded-[24px] text-[10px] sm:text-[11px] font-black text-primary focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all outline-none placeholder-primary-light/30 uppercase tracking-widest shadow-sm"
                        placeholder="Username Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 sm:pl-5 flex items-center pointer-events-none text-primary-light/50 transition-colors group-focus-within:text-primary">
                        <span className="material-icons-round text-base sm:text-lg">lock_open</span>
                    </div>
                    <input
                        className="block w-full pl-12 sm:pl-14 pr-12 sm:pr-14 py-5 sm:py-6 bg-white border border-primary/5 rounded-[20px] sm:rounded-[24px] text-[10px] sm:text-[11px] font-black text-primary focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all outline-none placeholder-primary-light/30 uppercase tracking-widest shadow-sm"
                        placeholder="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLogin();
                        }}
                    />
                </div>


                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full py-5 sm:py-6 mt-4 sm:mt-6 bg-primary text-white rounded-[28px] sm:rounded-[32px] shadow-xl shadow-primary/20 text-xs sm:text-sm font-black active:scale-[0.97] transition-all uppercase tracking-[0.4em] sm:tracking-[0.5em] disabled:opacity-30 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                    <span className="relative z-10">{loading ? 'SUBMITTING...' : 'SUBMIT'}</span>
                </button>

                <div className="mt-16 mb-8 flex flex-col items-center gap-4 opacity-30">
                    <p className="text-[8px] sm:text-[9px] text-center text-primary font-black leading-relaxed uppercase tracking-[0.3em] italic">
                        Restricted Access. <br /> Private Network Property of Kim Long Catering Sdn Bhd
                    </p>
                    <div className="flex gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary/20"></div>
                        <div className="w-1 h-1 rounded-full bg-primary/20"></div>
                        <div className="w-1 h-1 rounded-full bg-primary/20"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;