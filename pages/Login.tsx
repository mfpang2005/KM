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
        <div className="flex flex-col h-full bg-white dark:bg-[#2a0a0a] border-t-[6px] border-primary">
            <div className="pt-24 pb-12 flex flex-col items-center">
                <h1 className="text-3xl font-black text-slate-900 mb-3">欢迎回来</h1>
                <p className="text-3xl font-black text-primary tracking-tighter uppercase text-center px-6 leading-tight">
                    KIM LONG CATERING <br /> SDN BHD
                </p>
                <p className="text-[11px] text-slate-400 font-bold tracking-widest uppercase mt-8">选择登录角色</p>
            </div>

            <div className="px-8 mb-10">
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { role: UserRole.ADMIN, icon: 'admin_panel_settings', label: '管理员' },
                        { role: UserRole.KITCHEN, icon: 'soup_kitchen', label: '后厨' },
                        { role: UserRole.DRIVER, icon: 'local_shipping', label: '司机' }
                    ].map((item) => (
                        <button
                            key={item.role}
                            onClick={() => setSelectedRole(item.role)}
                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all h-28 ${selectedRole === item.role
                                ? 'border-primary bg-[#FAF0F0] shadow-xl shadow-primary/10 ring-4 ring-primary/5 scale-105'
                                : 'border-slate-50 bg-slate-50 opacity-60'
                                }`}
                        >
                            <div className={`w-12 h-12 flex items-center justify-center rounded-full mb-3 shadow-sm ${selectedRole === item.role
                                ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'
                                }`}>
                                <span className="material-icons-round text-2xl">{item.icon}</span>
                            </div>
                            <span className={`text-[11px] font-black ${selectedRole === item.role ? 'text-slate-900' : 'text-slate-400'}`}>
                                {item.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-8 flex-1 flex flex-col gap-4">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <span className="material-icons-round text-sm">email</span>
                    </div>
                    <input
                        className="block w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/10 focus:border-primary/20 transition-all outline-none"
                        placeholder="请输入邮箱账号"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <span className="material-icons-round text-sm">lock</span>
                    </div>
                    <input
                        className="block w-full pl-10 pr-10 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/10 focus:border-primary/20 transition-all outline-none"
                        placeholder="请输入密码"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLogin();
                        }}
                    />
                </div>

                <div className="flex justify-end items-center px-1">
                    <button className="text-[10px] font-black text-slate-400 uppercase tracking-wider hover:text-primary transition-colors">
                        忘记密码？
                    </button>
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full py-5 mt-4 bg-primary text-white rounded-2xl shadow-2xl shadow-primary/30 text-base font-black hover:bg-primary-dark active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50"
                >
                    {loading ? '请稍候...' : '立即登录'}
                </button>

                <p className="text-[9px] text-center text-slate-300 font-bold mt-12 pb-12 leading-relaxed">
                    仅供 Kim Long 内部员工登录使用 <br />
                    如需重置，请联系系统管理员
                </p>
            </div>
        </div>
    );
};

export default Login;