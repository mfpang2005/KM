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
        <div className="flex flex-col h-full bg-[#fdfdfd] text-slate-900 font-sans">
            {/* 隐藏的 file input，capture="environment" 指向后置相机 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
            />
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
                                <h2 className="text-3xl font-black tracking-tighter">#{orderId?.slice(0,8).toUpperCase() || 'UNKNOWN'}</h2>
                                <p className="text-xs font-medium text-slate-400 mt-2 flex items-center gap-2">
                                    <span className="material-icons-round text-sm text-primary">person</span>
                                    {isLoading ? '加载客户中...' : (order?.customerName || '未关联客户')}
                                </p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="bg-primary px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all active:scale-95">
                                    {isLoading ? '...' : `RM ${order?.amount?.toFixed(2) || '0.00'}`}
                                </span>
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
                                    <div className={`w-24 h-24 rounded-[30px] flex items-center justify-center transition-all flex-shrink-0 overflow-hidden ${isCaptured ? 'shadow-xl shadow-green-200' : 'bg-slate-50 text-slate-400'}`}>
                                        {uploadingStep === step.id ? (
                                            <span className="material-icons-round animate-spin text-2xl text-primary">autorenew</span>
                                        ) : isCaptured ? (
                                            <img src={photos[step.id].localUrl} alt={step.label} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-icons-round text-3xl">add_a_photo</span>
                                        )}
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
                                                <span className="text-[9px] font-black text-green-600 uppercase">Captured ✓ Tap to retake</span>
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