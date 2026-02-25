import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { UserRole } from '../types';

interface LoginProps {
    onLogin: (role: UserRole) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.ADMIN);
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    /**
     * 根据用户选择的角色跳转到对应页面
     */
    const navigateByRole = (role: UserRole) => {
        if (role === UserRole.ADMIN) navigate('/admin');
        if (role === UserRole.KITCHEN) navigate('/kitchen');
        if (role === UserRole.DRIVER) navigate('/driver');
    };

    /**
     * 邮件密码登录 —— 使用 Supabase signInWithPassword
     */
    const handleLogin = async () => {
        if (!email || !password) {
            alert('请输入邮箱和密码');
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            // NOTE: App.tsx 的 onAuthStateChange 会自动触发 onLogin，
            // 此处手动调用是为了同步传递角色偏好
            onLogin(selectedRole);
            navigateByRole(selectedRole);
        } catch (error) {
            console.error('登录失败:', error);
            alert(`登录失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
    };

    /**
     * 邮件密码注册 —— 使用 Supabase signUp
     */
    const handleRegister = async () => {
        if (!email || !password) {
            alert('请输入邮箱和密码');
            return;
        }
        if (password.length < 6) {
            alert('密码至少需要 6 位字符');
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    // NOTE: 用户元数据中保存角色，供后续权限判断使用
                    data: { role: selectedRole }
                }
            });
            if (error) throw error;
            alert('注册成功！请查收验证邮件后再登录。\n（如管理员已关闭邮件验证，可直接登录）');
            setMode('login');
        } catch (error) {
            console.error('注册失败:', error);
            alert(`注册失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
    };

    /**
     * 社交登录（Google / Facebook）
     * 需要在 Supabase Dashboard 中提前启用对应 Provider
     */
    const handleSocialLogin = async (platform: 'Google' | 'Facebook') => {
        const confirmLogin = window.confirm(`确定要使用 ${platform} 登录吗？`);
        if (!confirmLogin) return;

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: platform.toLowerCase() as 'google' | 'facebook',
                options: {
                    // NOTE: OAuth 完成后重定向回本应用，App.tsx 的
                    // onAuthStateChange 会捕获 session 并自动完成登录
                    redirectTo: window.location.origin + window.location.pathname
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error(`${platform} 登录失败:`, error);
            alert(`登录失败: ${(error as Error).message}`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#2a0a0a] border-t-[6px] border-primary">
            {/* 顶部标题区 */}
            <div className="pt-24 pb-12 flex flex-col items-center">
                <h1 className="text-3xl font-black text-slate-900 mb-3">
                    {mode === 'login' ? '欢迎回来' : '开启您的账号'}
                </h1>
                <p className="text-3xl font-black text-primary tracking-tighter uppercase text-center px-6 leading-tight">
                    KIM LONG CATERING <br /> SDN BHD
                </p>
                <p className="text-[11px] text-slate-400 font-bold tracking-widest uppercase mt-8">选择登录角色</p>
            </div>

            {/* 角色选择 */}
            <div className="px-8 mb-10">
                <div className="grid grid-cols-3 gap-4">
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
                            <div className={`w-12 h-12 flex items-center justify-center rounded-full mb-3 shadow-sm ${selectedRole === item.role ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'
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

            {/* 表单区域 */}
            <div className="px-8 flex-1 flex flex-col gap-4">
                {/* 邮箱输入 */}
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

                {/* 密码输入 */}
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <span className="material-icons-round text-sm">lock</span>
                    </div>
                    <input
                        className="block w-full pl-10 pr-10 py-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/10 focus:border-primary/20 transition-all outline-none"
                        placeholder="请输入密码（至少6位）"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleRegister();
                        }}
                    />
                </div>

                <div className="flex justify-between items-center px-1">
                    <button
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                        className="text-[10px] font-black text-slate-400 uppercase tracking-wider hover:text-primary transition-colors"
                    >
                        {mode === 'login' ? '注册新用户' : '已有账号？登录'}
                    </button>
                    <button className="text-[10px] font-black text-slate-400 uppercase tracking-wider hover:text-primary transition-colors">
                        忘记密码？
                    </button>
                </div>

                {/* 提交按钮 */}
                <button
                    onClick={mode === 'login' ? handleLogin : handleRegister}
                    disabled={loading}
                    className="w-full py-5 mt-4 bg-primary text-white rounded-2xl shadow-2xl shadow-primary/30 text-base font-black hover:bg-primary-dark active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? '请稍候...' : mode === 'login' ? '立即登录' : '提交注册'}
                </button>

                {/* 社交登录分割线 */}
                <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] font-black text-slate-300 uppercase bg-white px-4">
                        或通过以下方式登入
                    </div>
                </div>

                {/* 社交登录按钮 */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleSocialLogin('Google')}
                        className="flex items-center justify-center gap-2 py-4 border border-slate-100 rounded-xl bg-white active:scale-95 transition-all shadow-sm hover:bg-slate-50"
                    >
                        <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="Google" />
                        <span className="text-[11px] font-black text-slate-700">Google</span>
                    </button>
                    <button
                        onClick={() => handleSocialLogin('Facebook')}
                        className="flex items-center justify-center gap-2 py-4 border border-slate-100 rounded-xl bg-white active:scale-95 transition-all shadow-sm hover:bg-slate-50"
                    >
                        <img src="https://upload.wikimedia.org/wikipedia/commons/b/b8/2021_Facebook_icon.svg" className="w-5 h-5" alt="Facebook" />
                        <span className="text-[11px] font-black text-slate-700">Facebook</span>
                    </button>
                </div>

                <p className="text-[9px] text-center text-slate-300 font-bold mt-12 pb-12 leading-relaxed">
                    点击登入即代表您同意我们的 <br />
                    <span className="text-slate-400 underline cursor-pointer">服务条款</span> 与 <span className="text-slate-400 underline cursor-pointer">隐私政策</span>
                </p>
            </div>
        </div>
    );
};

export default Login;