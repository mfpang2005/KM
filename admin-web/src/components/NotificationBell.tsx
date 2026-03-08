import React from 'react';
import { useNotifications } from '../hooks/useNotifications';

export const NotificationBell: React.FC = () => {
    const {
        showNotifs,
        notifs,
        unread,
        toggleNotifs,
        clearAll
    } = useNotifications();

    return (
        <div className="relative">
            <button
                onClick={toggleNotifs}
                className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border
                    ${unread > 0
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-200 animate-pulse'
                        : 'bg-white border-slate-100 text-slate-500 hover:text-indigo-600 shadow-sm'
                    }`}
            >
                <span className="material-icons-round text-[20px]">notifications</span>
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {showNotifs && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                        <h4 className="font-black text-slate-800 text-xs uppercase tracking-widest">New Orders</h4>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-blue-500 uppercase">{notifs.length} PENDING</span>
                            {notifs.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-xl font-black uppercase tracking-widest transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 no-scrollbar">
                        {notifs.length === 0 ? (
                            <div className="py-12 text-center text-slate-300">
                                <span className="material-icons-round text-4xl opacity-20">notifications_none</span>
                                <p className="text-[10px] font-black uppercase tracking-widest mt-2">Inbox is clear</p>
                            </div>
                        ) : notifs.map(n => (
                            <div key={n.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                        <span className="material-icons-round text-[18px] text-blue-600">receipt_long</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-slate-800 truncate">{n.customerName}</p>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-[10px] font-bold text-blue-600 tracking-tighter">RM {Number(n.amount).toFixed(2)}</p>
                                            <p className="text-[9px] text-slate-400 font-medium">
                                                {new Date(n.created_at).toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="px-6 py-4 border-t border-slate-50 bg-slate-50/50">
                        <button
                            onClick={clearAll}
                            className="w-full py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-800 transition-colors border border-dashed border-slate-200 rounded-2xl"
                        >
                            Mark all as seen
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
