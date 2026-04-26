import React from 'react';
import { supabase } from '../src/lib/supabase';

const SystemLockPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-background-beige flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-8">
                {/* 动态光晕效果 */}
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse"></div>
                <div className="relative w-24 h-24 bg-white rounded-3xl shadow-2xl flex items-center justify-center border border-white">
                    <span className="material-icons-round text-5xl text-primary animate-bounce">lock</span>
                </div>
            </div>

            <h1 className="text-2xl font-black text-primary uppercase tracking-[0.3em] mb-4">系统暂未授权</h1>
            
            <div className="max-w-xs space-y-4">
                <p className="text-[10px] font-black text-primary-light/60 uppercase tracking-widest leading-relaxed">
                    SYSTEM ACCESS RESTRICTED. 
                    CURRENT SESSION REQUIRES ADMINISTRATIVE AUTHORIZATION TO PROCEED.
                </p>
                
                <div className="h-px bg-primary/10 w-12 mx-auto"></div>
                
                <p className="text-xs font-bold text-primary/80">
                    当前环境尚未开启访问权限。<br/>
                    请联系 <span className="font-black text-primary underline decoration-primary/30 underline-offset-4">超级管理员</span> 授权此终端进入管理总汇。
                </p>
            </div>

            <div className="mt-12 flex flex-col items-center gap-4">
                <div className="flex gap-1 opacity-30">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}></div>
                    ))}
                </div>
                <p className="text-[8px] font-black text-primary uppercase tracking-[0.4em] opacity-30">Waiting for Backend Signal</p>
                
                <button 
                    onClick={async () => {
                        console.log("[SystemLock] Signing out...");
                        await supabase.auth.signOut();
                        localStorage.clear(); // 清除本地缓存
                        sessionStorage.clear();
                        window.location.href = '/#/login';
                        window.location.reload(); 
                    }}
                    className="mt-4 px-8 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all"
                >
                    退出当前账号重新登录
                </button>
            </div>
        </div>
    );
};

export default SystemLockPage;
