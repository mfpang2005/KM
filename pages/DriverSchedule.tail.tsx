                    <div className="shrink-0 px-4 pb-8 pt-3 border-t border-white/5 flex items-center gap-3">
                        <button 
                            onMouseDown={handlePttDown} 
                            onMouseUp={handlePttUp} 
                            onTouchStart={(e) => { e.preventDefault(); handlePttDown(); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handlePttUp(); }}
                            disabled={pttStatus === 'CONNECTING' || pttStatus === 'IDLE'}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 shrink-0 shadow-xl active:scale-90 ${isTransmitting 
                                ? 'bg-sky-600 text-white animate-pulse ring-4 ring-sky-600/20' 
                                : 'bg-slate-800 text-slate-400 border border-white/10 hover:bg-slate-700'
                            }`}
                        >
                            <span className="material-icons-round text-xl">{isTransmitting ? 'mic' : 'mic_none'}</span>
                        </button>
                        <div className={`flex-1 flex items-center rounded-2xl px-6 py-3 border transition-all duration-300 gap-3 ${isTransmitting ? 'bg-sky-600/20 border-sky-600/40' : 'bg-slate-800 border-white/10'}`}>
                            <input 
                                type="text" 
                                value={driverChatInput} 
                                onChange={(e) => setDriverChatInput(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') sendDriverTextMessage(); }} 
                                placeholder={isTransmitting ? '正在发射 / TRANSMITTING...' : "输入文字消息..."} 
                                disabled={isTransmitting}
                                className={`flex-1 bg-transparent text-sm outline-none font-medium ${isTransmitting ? 'text-sky-400' : 'text-white'}`} 
                            />
                        </div>
                        <button onClick={sendDriverTextMessage} disabled={isTransmitting || !driverChatInput.trim()} className="w-12 h-12 bg-sky-600 disabled:bg-slate-700 rounded-2xl text-white flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-sky-600/20">
                            <span className="material-icons-round">send</span>
                        </button>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-3xl z-[150] flex flex-col justify-end animate-in fade-in duration-500 no-print">
                    <div className="absolute inset-0" onClick={() => setSelectedOrder(null)}></div>
                    <div className="bg-slate-900 w-full max-w-lg mx-auto rounded-t-[56px] p-12 shadow-[0_-20px_100px_rgba(0,0,0,0.8)] border-t border-white/10 animate-in slide-in-from-bottom-[50%] duration-700 max-h-[92vh] flex flex-col relative z-10">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 shrink-0"></div>
                        <header className="flex justify-between items-start mb-10 shrink-0">
                            <div>
                                <h2 className="text-3xl font-black text-white tracking-tighter">任务详情</h2>
                                <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.4em] mt-3 underline decoration-sky-500/30 underline-offset-4">订单编号: {selectedOrder.order_number || selectedOrder.id.slice(0, 12)}</p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="w-14 h-14 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 transition-all"><span className="material-icons-round">close</span></button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pb-10">
                            <div className="bg-white/[0.03] p-8 rounded-[40px] border border-white/5 space-y-6 backdrop-blur-xl">
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 bg-sky-500/10 rounded-2xl flex items-center justify-center text-sky-400 border border-sky-500/20">
                                        <span className="material-icons-round text-lg">person</span>
                                    </div>
                                    <span className="text-lg font-black text-white tracking-tight uppercase">{selectedOrder.customerName}</span>
                                </div>
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                        <span className="material-icons-round text-lg">phone</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-300 font-mono italic">{selectedOrder.customerPhone}</span>
                                </div>
                                <div className="flex items-start gap-5">
                                    <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                        <span className="material-icons-round text-lg">place</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-400 leading-tight tracking-tight">{selectedOrder.address}</span>
                                </div>
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                        <span className="material-icons-round text-lg">schedule</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-300 font-mono italic">
                                        {selectedOrder.dueTime ? (selectedOrder.dueTime.includes('T') ? new Date(selectedOrder.dueTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) : selectedOrder.dueTime) : (selectedOrder.eventTime || '未设置时间')}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] pl-4">配送清单</h4>
                                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-xl">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="p-6 flex justify-between items-center border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] transition-colors">
                                            <span className="text-[14px] font-black text-slate-100 uppercase tracking-tight">{item.name}</span>
                                            <span className="text-xs font-black font-mono text-sky-400 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">x{item.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-[32px] text-slate-950 flex justify-between items-center shadow-2xl transition-all">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-50">总计金额</span>
                               <h4 className="text-2xl font-mono font-black tracking-tighter italic">RM {selectedOrder.amount.toFixed(2)}</h4>
                            </div>
                        </div>
                        <div className="pt-4 flex gap-4 shrink-0">
                            <button onClick={() => { handleUpdateStatus(selectedOrder.id, selectedOrder.status === OrderStatus.READY ? OrderStatus.DELIVERING : OrderStatus.COMPLETED); setSelectedOrder(null); }} className="flex-1 h-16 bg-sky-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95">
                                {selectedOrder.status === OrderStatus.READY ? '确认接收工作' : '订单送达'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 顶层悬浮导航栏 */}
            <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900/80 backdrop-blur-3xl border border-white/10 flex justify-around items-center h-[76px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-[38px] no-print z-[80] overflow-hidden">
                <button 
                    onClick={() => setCurrentView('tasks')} 
                    className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-all relative ${currentView === 'tasks' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {currentView === 'tasks' && <div className="absolute inset-0 bg-sky-600/10"></div>}
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'tasks' ? 'text-sky-400 scale-110' : ''}`}>
                        <span className="material-icons-round text-[22px]">local_shipping</span>
                    </div>
                </button>
                <div className="w-[1px] h-6 bg-white/5"></div>
                <button 
                    onClick={() => setCurrentView('history')} 
                    className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-all relative ${currentView === 'history' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {currentView === 'history' && <div className="absolute inset-0 bg-sky-600/10"></div>}
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'history' ? 'text-sky-400 scale-110' : ''}`}>
                        <span className="material-icons-round text-[22px]">history</span>
                    </div>
                </button>
                <div className="w-[1px] h-6 bg-white/5"></div>
                <button 
                    onClick={() => setCurrentView('profile')} 
                    className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-all relative ${currentView === 'profile' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    {currentView === 'profile' && <div className="absolute inset-0 bg-sky-600/10"></div>}
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'profile' ? 'text-sky-400 scale-110' : ''}`}>
                        <span className="material-icons-round text-[22px]">person</span>
                    </div>
                </button>
            </nav>
        </div>
    );
};
export default DriverSchedule;
