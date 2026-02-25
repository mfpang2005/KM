import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PaymentMethod, OrderStatus } from '../types';
import { OrderService } from '../src/services/api';

const PhotoConfirmation: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const orderId = location.state?.orderId;
    const [photos, setPhotos] = useState<Record<string, string>>({});
    const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const steps = [
        { id: 'receipt', label: '顾客签收底单', sub: 'Receipt Sign-off', icon: 'receipt_long', color: 'bg-blue-500' },
        { id: 'food', label: '食物摆设拍照', sub: 'Food Arrangement', icon: 'lunch_dining', color: 'bg-orange-500' },
        { id: 'payment', label: '还款记录截图', sub: 'Payment Proof', icon: 'account_balance_wallet', color: 'bg-purple-500' }
    ];

    const paymentOptions = [
        { id: PaymentMethod.CASH, label: 'CASH', icon: 'payments', desc: '现金结余' },
        { id: PaymentMethod.BANK_TRANSFER, label: 'BANK', icon: 'account_balance', desc: '银行转账' },
        { id: PaymentMethod.EWALLET, label: 'E-WALLET', icon: 'account_balance_wallet', desc: '电子钱包' },
        { id: PaymentMethod.CHEQUE, label: 'CHEQUE', icon: 'description', desc: '支票付款' }
    ];

    const allPhotosCaptured = Object.keys(photos).length === steps.length;

    // Prototype interaction for capturing
    const handleCapture = (id: string) => {
        setPhotos(prev => ({ ...prev, [id]: 'data:image/png;base64,...' }));
    };

    const canSubmit = allPhotosCaptured && selectedPayment !== null && !!orderId && !isSubmitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setIsSubmitting(true);
        try {
            const order = await OrderService.getById(orderId);
            const updated = {
                ...order,
                status: OrderStatus.COMPLETED,
                paymentMethod: selectedPayment as PaymentMethod
            };
            await OrderService.update(orderId, updated);
            navigate('/driver');
        } catch (error) {
            console.error("Failed to complete delivery", error);
            alert("交付确认失败，请重试");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#fdfdfd] text-slate-900 font-sans">
            {/* Elegant Sticky Header */}
            <header className="pt-12 pb-6 px-8 bg-white/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between border-b border-slate-100">
                <button
                    onClick={() => navigate('/driver')}
                    className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
                >
                    <span className="material-icons-round text-xl">arrow_back_ios_new</span>
                </button>
                <div className="text-center">
                    <h1 className="text-base font-black tracking-tight uppercase">交付确认详情</h1>
                    <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mt-0.5">Delivery Proofing</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                    <span className="material-icons-round text-xl">verified</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 space-y-10 no-scrollbar pb-40">
                {/* 1. Order Context Hero */}
                <section className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl shadow-slate-200">
                        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/20 blur-[60px] rounded-full"></div>
                        <div className="relative z-10 flex justify-between items-start">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Active Delivery</span>
                                <h2 className="text-3xl font-black tracking-tighter">#{orderId || 'UNKNOWN'}</h2>
                                <p className="text-xs font-medium text-slate-400 mt-2 flex items-center gap-2">
                                    <span className="material-icons-round text-sm">person</span>
                                    Alice Wong (黄小姐)
                                </p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="bg-white/10 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/5">RM 240.00</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. Modern Payment Selection */}
                <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">顾客付款状态 (PAYMENT)</h3>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${selectedPayment ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500 animate-pulse'}`}>
                            {selectedPayment ? 'Selection OK' : 'Required'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {paymentOptions.map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setSelectedPayment(opt.id)}
                                className={`group p-5 rounded-[32px] border-2 transition-all flex flex-col items-start gap-4 relative overflow-hidden active:scale-95 ${selectedPayment === opt.id
                                        ? 'bg-primary/5 border-primary shadow-xl shadow-primary/10'
                                        : 'bg-white border-slate-50 text-slate-400 hover:border-slate-100 shadow-sm'
                                    }`}
                            >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${selectedPayment === opt.id ? 'bg-primary text-white scale-110' : 'bg-slate-50 text-slate-400'
                                    }`}>
                                    <span className="material-icons-round text-2xl">{opt.icon}</span>
                                </div>
                                <div>
                                    <p className={`text-[11px] font-black uppercase tracking-tight transition-colors ${selectedPayment === opt.id ? 'text-slate-900' : 'text-slate-400'}`}>
                                        {opt.label}
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-300 mt-0.5">{opt.desc}</p>
                                </div>
                                {selectedPayment === opt.id && (
                                    <div className="absolute top-4 right-4 animate-in zoom-in duration-300">
                                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white shadow-lg">
                                            <span className="material-icons-round text-xs">done</span>
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </section>

                {/* 3. High-Quality Photo Capture Tiles */}
                <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">现场拍照存证 (EVIDENCE)</h3>
                        <div className="flex gap-1">
                            {[1, 2, 3].map(i => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${Object.keys(photos).length >= i ? 'bg-primary' : 'bg-slate-200'}`}></div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        {steps.map((step) => {
                            const isCaptured = !!photos[step.id];
                            return (
                                <button
                                    key={step.id}
                                    onClick={() => handleCapture(step.id)}
                                    className={`w-full group rounded-[36px] p-1 border-2 transition-all flex items-center gap-5 active:scale-[0.98] ${isCaptured
                                            ? 'bg-green-50/50 border-green-500/20'
                                            : 'bg-white border-slate-50 shadow-sm'
                                        }`}
                                >
                                    <div className={`w-24 h-24 rounded-[30px] flex items-center justify-center transition-all flex-shrink-0 ${isCaptured ? 'bg-green-500 text-white shadow-xl shadow-green-200' : 'bg-slate-50 text-slate-400'
                                        }`}>
                                        <span className="material-icons-round text-3xl">
                                            {isCaptured ? 'photo_camera' : 'add_a_photo'}
                                        </span>
                                    </div>

                                    <div className="text-left flex-1 py-4 pr-6">
                                        <h4 className={`text-sm font-black transition-colors ${isCaptured ? 'text-green-800' : 'text-slate-800'}`}>
                                            {step.label}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                            {step.sub}
                                        </p>
                                        {isCaptured && (
                                            <div className="flex items-center gap-1.5 mt-2 animate-in fade-in slide-in-from-left duration-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                                <span className="text-[9px] font-black text-green-600 uppercase">Evidence Saved</span>
                                            </div>
                                        )}
                                    </div>

                                    {!isCaptured && (
                                        <div className="pr-8">
                                            <div className="w-10 h-10 rounded-full border-2 border-slate-100 flex items-center justify-center text-slate-200 group-hover:border-primary/20 group-hover:text-primary transition-colors">
                                                <span className="material-icons-round text-lg">chevron_right</span>
                                            </div>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Compliance Info */}
                <div className="bg-primary/5 rounded-[32px] p-6 border border-primary/10 flex items-start gap-4 animate-in fade-in duration-500 delay-300">
                    <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                        <span className="material-icons-round text-xl">shield</span>
                    </div>
                    <p className="text-[10px] text-primary font-black leading-relaxed uppercase tracking-tight">
                        重要提示：作为公司数字化合规流程，您必须完成所有拍照项并准确选择收款方式，否则财务将无法完成今日自动清账。
                    </p>
                </div>
            </main>

            {/* Floating Confirm Footer */}
            <footer className="fixed bottom-0 left-0 right-0 p-8 bg-white/90 backdrop-blur-2xl border-t border-slate-50 z-50 safe-bottom">
                <div className="max-w-md mx-auto">
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={`w-full py-5 rounded-[28px] font-black text-base flex items-center justify-center gap-4 transition-all uppercase tracking-widest shadow-2xl relative overflow-hidden group ${canSubmit
                                ? 'bg-primary text-white shadow-primary/30 active:scale-95'
                                : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-80'
                            }`}
                    >
                        {canSubmit && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                        )}
                        {isSubmitting ? '处理中...' : '确认交付完成'}
                        <span className="material-icons-round text-xl">rocket_launch</span>
                    </button>
                    {!canSubmit && (
                        <p className="text-center text-[9px] font-black text-slate-300 uppercase mt-4 tracking-widest">
                            需完成 {3 - Object.keys(photos).length} 张照片 & 选择付款方式
                        </p>
                    )}
                </div>
            </footer>
        </div>
    );
};

export default PhotoConfirmation;