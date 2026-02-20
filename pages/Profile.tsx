
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface ProfileProps {
    onLogout: () => void;
}

const Profile: React.FC<ProfileProps> = ({ onLogout }) => {
    const navigate = useNavigate();

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
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">设置</h3>
                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                        <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50">
                            <div className="flex items-center gap-3">
                                <span className="material-icons-round text-slate-400 text-lg">language</span>
                                <span className="text-sm font-medium">语言设置 (Language)</span>
                            </div>
                            <span className="text-xs text-slate-400">中文</span>
                        </button>
                        <button className="w-full p-4 flex items-center justify-between hover:bg-slate-50">
                            <div className="flex items-center gap-3">
                                <span className="material-icons-round text-slate-400 text-lg">verified_user</span>
                                <span className="text-sm font-medium">安全与隐私</span>
                            </div>
                            <span className="material-icons-round text-slate-300 text-sm">chevron_right</span>
                        </button>
                    </div>
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
