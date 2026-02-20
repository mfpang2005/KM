
import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotificationCenter: React.FC = () => {
    const navigate = useNavigate();

    const notifications = [
        { title: '紧急缺货提醒', content: '鸡肉库存低于20%，请及时补货。', time: '10 分钟前', type: 'warning' },
        { title: '大额订单通知', content: '收到来自 KL Sentral 的 RM 2,000 订单。', time: '30 分钟前', type: 'info' },
        { title: '配送延迟告警', order: '#1024', content: '司机 阿杰 遇到堵车，预计延迟 15 分钟。', time: '1 小时前', type: 'error' },
    ];

    return (
        <div className="flex flex-col h-full bg-background-light">
            <header className="pt-12 pb-4 px-6 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="text-slate-400">
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold">消息中心</h1>
                </div>
                <button className="text-[10px] font-bold text-primary">全部已读</button>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                {notifications.map((n, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-1 h-full ${
                            n.type === 'warning' ? 'bg-orange-400' : n.type === 'error' ? 'bg-primary' : 'bg-blue-400'
                        }`}></div>
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="text-sm font-bold text-slate-800">{n.title}</h3>
                            <span className="text-[9px] text-slate-400 font-bold uppercase">{n.time}</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">{n.content}</p>
                    </div>
                ))}
            </main>
        </div>
    );
};

export default NotificationCenter;
