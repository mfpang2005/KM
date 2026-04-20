import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Order, PaymentMethod, OrderStatus } from '../types';
import { OrderService } from '../src/services/api';
import { supabase } from '../src/lib/supabase';

/**
 * 客户端图片压缩 (1280px / 0.7 质量)
 * 显著降低上载物理负载，让交付确认快如闪电
 */
const compressImage = (file: File, maxWidth = 1200, quality = 0.75): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas 转换失败'));
                }, 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const PhotoConfirmation: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const orderId = location.state?.orderId;
    const [order, setOrder] = useState<Order | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // photos: { stepId -> { localUrl, storageUrl } }
    const [photos, setPhotos] = useState<Record<string, { localUrl: string; storageUrl: string }>>({});
    const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadingStep, setUploadingStep] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingStepId, setPendingStepId] = useState<string | null>(null);

    React.useEffect(() => {
        if (!orderId) {
            setIsLoading(false);
            return;
        }
        const fetchOrder = async () => {
            try {
                const data = await OrderService.getById(orderId);
                setOrder(data);
            } catch (err: any) {
                console.error('Failed to fetch order', err);
                // 核心加固：如果初次加载就找不到订单，立即拦截并强制导回
                if (err.response?.status === 404) {
                    alert(`找不到订单 #${orderId?.slice(0,8).toUpperCase()}。\n可能已被管理员取消或指派关系已变更，正在返回行程表...`);
                    navigate('/driver');
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchOrder();
    }, [orderId]);

    const steps = [
        { id: 'receipt', label: '顾客签收底单', sub: 'Receipt Sign-off', icon: 'receipt_long', color: 'bg-indigo-500' },
        { id: 'food', label: '食物摆设拍照', sub: 'Food Arrangement', icon: 'lunch_dining', color: 'bg-violet-500' },
        { id: 'payment', label: '还款记录截图', sub: 'Payment Proof', icon: 'account_balance_wallet', color: 'bg-fuchsia-500' }
    ];

    const paymentOptions = [
        { id: PaymentMethod.CASH, label: 'CASH', icon: 'payments', desc: '现金结余' },
        { id: PaymentMethod.BANK_TRANSFER, label: 'BANK', icon: 'account_balance', desc: '银行转账' },
        { id: PaymentMethod.EWALLET, label: 'E-WALLET', icon: 'account_balance_wallet', desc: '电子钱包' },
        { id: PaymentMethod.CHEQUE, label: 'CHEQUE', icon: 'description', desc: '支票付款' }
    ];

    const allPhotosCaptured = Object.keys(photos).length === steps.length;

    /**
     * 打开相机拍摄界面：记录当前步骤 ID，然后触发隐藏 file input
     */
    const handleCapture = (id: string) => {
        setPendingStepId(id);
        fileInputRef.current?.click();
    };

    /**
     * 用户选择或拍摄照片后：上传至 Supabase Storage，将返回的公开 URL 存入 state
     */
    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pendingStepId || !orderId) return;

        setUploadingStep(pendingStepId);
        try {
            // 1. 本地预览直接使用原始 File 的 Blob URL
            const localUrl = URL.createObjectURL(file);

            // 2. 核心优化：在上传前进行极速压强处理 (压缩体积 > 90%)
            const compressedBlob = await compressImage(file);

            // 3. 上传压缩后的 Blob 数据至 Supabase
            const path = `${orderId}/${pendingStepId}-${Date.now()}.jpg`;
            const { error } = await supabase.storage
                .from('delivery-photos')
                .upload(path, compressedBlob, { 
                    upsert: true, 
                    contentType: 'image/jpeg' 
                });

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from('delivery-photos')
                .getPublicUrl(path);

            const storageUrl = urlData.publicUrl;
            setPhotos(prev => ({ ...prev, [pendingStepId]: { localUrl, storageUrl } }));
        } catch (err) {
            console.error('Upload failed', err);
            alert('照片压缩或上载失败，请检查网络后重试。');
        } finally {
            setUploadingStep(null);
            setPendingStepId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const canSubmit = allPhotosCaptured && selectedPayment !== null && !!orderId && !isSubmitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setIsSubmitting(true);
        try {
            // 1. 核心优化：确保图片数组顺序固定 [0:底单, 1:食物, 2:证据]
            // 这让财务对帐时图标永远对应实物
            const photoUrls = steps.map(s => photos[s.id]?.storageUrl || "");
            await OrderService.updateOrderPhotos(orderId, photoUrls);

            // 2. 调用新接口完成订单（允许司机权限）
            await OrderService.completeOrder(orderId, selectedPayment);
            navigate('/driver');
        } catch (error: any) {
            console.error("Failed to complete delivery", error);
            const detail = error.response?.data?.detail || error.message || "Unknown error";
            alert(`交付确认失败: ${detail}\n请确保已运行最新的数据库脚本并重启后端。`);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0f18] text-white font-sans selection:bg-indigo-500/30 overflow-hidden">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
            />

            {/* Elegant Sticky Header */}
            <header className="pt-14 pb-8 px-8 bg-slate-900/60 backdrop-blur-3xl sticky top-0 z-[60] flex items-center justify-between border-b border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                <button
                    onClick={() => navigate('/driver')}
                    className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:bg-white/10"
                >
                    <span className="material-icons-round text-xl">arrow_back_ios_new</span>
                </button>
                <div className="text-center">
                    <h1 className="text-base font-black tracking-tight uppercase leading-none mb-1">交付确认详情</h1>
                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.25em] mt-1 underline underline-offset-4 decoration-indigo-500/30">Delivery Evidence</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-glow shadow-indigo-500/20">
                    <span className="material-icons-round text-xl">verified</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-6 py-8 space-y-10 no-scrollbar pb-44 relative z-10">
                {/* 装饰背景轴 */}
                <div className="fixed top-1/3 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="fixed bottom-1/4 -left-20 w-80 h-80 bg-fuchsia-600/5 rounded-full blur-[120px] pointer-events-none"></div>

                {/* 1. Order Status Hero */}
                <section className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="bg-slate-950/40 rounded-[48px] p-10 text-white relative overflow-hidden border border-white/10 shadow-3xl shadow-black/60 group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-40 group-hover:opacity-60 transition-opacity"></div>
                        <div className="relative z-10 flex justify-between items-start">
                            <div className="space-y-3">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Current Mission</p>
                                <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none">#{orderId?.slice(0,8).toUpperCase() || 'UNKNOWN'}</h2>
                                <div className="flex items-center gap-2 pt-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center shadow-lg">
                                        <span className="material-icons-round text-xs text-indigo-400 font-bold">person</span>
                                    </div>
                                    <p className="text-xs font-black text-slate-300 tracking-tight uppercase">
                                        {isLoading ? 'Retrieving Data...' : (order?.customerName || 'No Client Name')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="bg-white px-5 py-2.5 rounded-[22px] flex flex-col items-end shadow-2xl shadow-indigo-500/10 border border-indigo-500/20">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Balance</span>
                                    <span className="text-lg font-mono font-black text-slate-950 leading-none">
                                        {isLoading ? '...' : `RM ${order?.amount?.toFixed(2) || '0.00'}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. Modern Payment Selection */}
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                    <div className="flex justify-between items-center px-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">收款方式 / PAYMENT METHOD</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        {paymentOptions.map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setSelectedPayment(opt.id)}
                                className={`group p-6 rounded-[40px] border transition-all flex flex-col items-start gap-5 relative overflow-hidden active:scale-95 duration-300 ${selectedPayment === opt.id
                                    ? 'bg-indigo-600/10 border-indigo-500/40 shadow-2xl shadow-indigo-500/20 ring-4 ring-indigo-500/10'
                                    : 'bg-white/[0.03] border-white/5 text-slate-500 hover:bg-white/[0.06] hover:border-white/10'
                                    }`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-2xl ${selectedPayment === opt.id ? 'bg-indigo-600 text-white scale-110 shadow-indigo-500/40' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                    <span className="material-icons-round text-2xl">{opt.icon}</span>
                                </div>
                                <div className="pl-1">
                                    <p className={`text-[11px] font-black uppercase tracking-[0.2em] transition-colors mb-1 ${selectedPayment === opt.id ? 'text-white' : 'text-slate-400'}`}>
                                        {opt.label}
                                    </p>
                                    <p className="text-[9px] font-black text-slate-600 tracking-widest">{opt.desc}</p>
                                </div>
                                {selectedPayment === opt.id && (
                                    <div className="absolute top-6 right-6 animate-in zoom-in duration-500">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                                            <span className="material-icons-round text-sm">check</span>
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </section>

                {/* 3. High-Quality Photo Capture Tiles */}
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                    <div className="flex justify-between items-center px-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">任务存证 / MISSION PROOF</h3>
                        <div className="flex gap-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className={`w-2 h-2 rounded-full border transition-all duration-500 ${Object.keys(photos).length >= i ? 'bg-emerald-500 border-emerald-500/50 shadow-glow-sm' : 'bg-white/5 border-white/10'}`}></div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-5">
                        {steps.map((step) => {
                            const isCaptured = !!photos[step.id];
                            return (
                                <button
                                    key={step.id}
                                    onClick={() => handleCapture(step.id)}
                                    className={`w-full group rounded-[48px] p-2 border transition-all flex items-center gap-6 active:scale-[0.98] relative overflow-hidden backdrop-blur-2xl ${isCaptured
                                        ? 'bg-emerald-500/5 border-emerald-500/30 shadow-2xl shadow-emerald-900/10'
                                        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'
                                        }`}
                                >
                                    <div className={`w-28 h-28 rounded-[40px] flex items-center justify-center transition-all flex-shrink-0 overflow-hidden relative shadow-2xl ${isCaptured ? 'border-2 border-emerald-500/40' : 'bg-slate-800 text-slate-500 border border-white/5'}`}>
                                        {uploadingStep === step.id ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="material-icons-round animate-spin text-2xl text-indigo-400">autorenew</span>
                                                <span className="text-[8px] font-black text-indigo-500 tracking-tighter uppercase">Syncing...</span>
                                            </div>
                                        ) : isCaptured ? (
                                            <img src={photos[step.id].localUrl} alt={step.label} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" />
                                        ) : (
                                            <span className="material-icons-round text-3xl opacity-40">add_a_photo</span>
                                        )}
                                        {isCaptured && <div className="absolute inset-0 bg-black/10"></div>}
                                    </div>

                                    <div className="text-left flex-1 py-4 pr-6">
                                        <h4 className={`text-base font-black tracking-tight mb-1 uppercase transition-colors ${isCaptured ? 'text-emerald-400' : 'text-white'}`}>
                                            {step.label}
                                        </h4>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                                            {step.sub}
                                        </p>
                                        {isCaptured && (
                                            <div className="flex items-center gap-2 mt-4 animate-in fade-in slide-in-from-left duration-500 bg-emerald-500/10 px-3 py-1 rounded-full w-fit border border-emerald-500/20 ring-4 ring-emerald-500/5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-glow shadow-emerald-500/50"></span>
                                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Verified ✓ Tap to Update</span>
                                            </div>
                                        )}
                                    </div>

                                    {!isCaptured && (
                                        <div className="pr-10">
                                            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-600 group-hover:text-indigo-400 group-hover:border-indigo-500/20 transition-all">
                                                <span className="material-icons-round text-xl">chevron_right</span>
                                            </div>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>

                <div className="bg-indigo-500/5 rounded-[40px] p-8 border border-indigo-500/10 flex items-start gap-5 animate-in fade-in duration-500 delay-300 backdrop-blur-3xl shadow-xl">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-indigo-600/30 shadow-[0_10px_20px] shrink-0 border border-white/20">
                        <span className="material-icons-round text-2xl">shield</span>
                    </div>
                    <div>
                        <p className="text-[11px] text-indigo-300 font-black leading-relaxed uppercase tracking-[0.1em]">Compliance Policy</p>
                        <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase tracking-tighter mt-1">
                            Ensure all imagery is clear and verifiable. Inaccurate reporting results in automated payroll reconciliation failures and asset tracking flags.
                        </p>
                    </div>
                </div>
            </main>

            {/* Floating Confirm Footer */}
            <footer className="fixed bottom-0 left-0 right-0 p-8 bg-slate-900/40 backdrop-blur-3xl border-t border-white/5 z-[100] safe-bottom shadow-[0_-20px_50px_rgba(0,0,0,0.5)] rounded-t-[48px]">
                <div className="max-w-md mx-auto">
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={`w-full py-6 rounded-[32px] font-black text-base flex items-center justify-center gap-4 transition-all uppercase tracking-[0.4em] shadow-3xl relative overflow-hidden group ${canSubmit
                            ? 'bg-white text-slate-950 shadow-white/20 active:scale-95'
                            : 'bg-white/5 text-slate-700 cursor-not-allowed border border-white/5'
                            }`}
                    >
                        {canSubmit && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-950/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                        )}
                        <span className="relative z-10">{isSubmitting ? 'Syncing...' : 'Complete Mission'}</span>
                        <span className="material-icons-round text-xl relative z-10 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1">rocket_launch</span>
                    </button>
                    {!canSubmit && (
                        <div className="flex items-center justify-center gap-2 mt-5 animate-pulse opacity-40">
                             <div className="h-[1px] w-6 bg-slate-700"></div>
                             <p className="text-center text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                                Requires {3 - Object.keys(photos).length} Proofs & Payment
                             </p>
                             <div className="h-[1px] w-6 bg-slate-700"></div>
                        </div>
                    )}
                </div>
            </footer>
        </div>
    );
};

export default PhotoConfirmation;