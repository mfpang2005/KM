import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductService, PRESET_CATEGORIES } from '../src/services/api';
import { supabase } from '../src/lib/supabase';
import type { Product } from '../types';
import PullToRefresh from '../src/components/PullToRefresh';

const ProductManagement: React.FC = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>(['全部']);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddingProduct, setIsAddingProduct] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const [form, setForm] = useState<{
        code: string;
        name: string;
        price: number | '';
        category: string;
        image_url: string;
        stock: number | '';
    }>({
        code: '',
        name: '',
        price: '',
        category: '',
        image_url: '',
        stock: 100
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string>('');
    const [showCustomCategory, setShowCustomCategory] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    const imageInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const fetchedProducts = await ProductService.getAll();
            setProducts(fetchedProducts);
            const dynamicCats = Array.from(new Set(fetchedProducts.map(p => p.category).filter(Boolean))) as string[];
            setCategories(['全部', ...dynamicCats]);
        } catch (error) {
            console.error('Failed to load products', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const channel = supabase
            .channel('product-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                loadData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesCategory = activeCategory === '全部' || p.category === activeCategory;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchesCategory && matchesSearch;
        });
    }, [products, activeCategory, searchQuery]);

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setForm({
                code: product.code,
                name: product.name,
                price: product.price ?? '',
                category: product.category || '',
                image_url: product.image_url || '',
                stock: product.stock ?? 100
            });
            setImagePreview(product.image_url || '');
            const isPreset = PRESET_CATEGORIES.includes(product.category || '');
            setShowCustomCategory(!isPreset && !!product.category);
            setCustomCategory(!isPreset ? (product.category || '') : '');
        } else {
            setEditingProduct(null);
            setForm({ code: '', name: '', price: '', category: '', image_url: '', stock: 100 });
            setImagePreview('');
            setShowCustomCategory(false);
            setCustomCategory('');
        }
        setIsAddingProduct(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageUploading(true);
        try {
            const localPreview = URL.createObjectURL(file);
            setImagePreview(localPreview);
            const url = await ProductService.uploadImage(file);
            setForm(prev => ({ ...prev, image_url: url }));
        } catch (err) {
            console.error('Image upload failed', err);
            alert('图片上传失败');
        } finally {
            setImageUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.code) {
            alert('请填写必填字段');
            return;
        }

        setIsSubmitting(true);
        const finalCategory = showCustomCategory ? customCategory : form.category;
        const payload = {
            code: form.code,
            name: form.name,
            price: form.price === '' ? null : Number(form.price),
            category: finalCategory || '其他',
            image_url: form.image_url || null
        };

        try {
            if (editingProduct) {
                await ProductService.update(editingProduct.id, payload as any);
            } else {
                await ProductService.create(payload);
            }
            setIsAddingProduct(false);
            loadData();
        } catch (error: any) {
            console.error('Failed to save product', error);
            const detail = error.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : (error.message || '未知错误');
            alert(`保存失败: ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveProduct = async (id: string) => {
        if (window.confirm('确定要移除该商品吗？此操作不可撤销。')) {
            try {
                await ProductService.delete(id);
                loadData();
            } catch (error) {
                console.error('Failed to delete product', error);
                alert('删除失败');
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-background-light relative">
            <header className="pt-12 pb-4 px-6 bg-white sticky top-0 z-30 shadow-sm border-b border-slate-50">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                                <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">商品管理</h1>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Products Management</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest">{products.length} 项</span>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-300">
                            <span className="material-icons-round text-sm">search</span>
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-9 pr-4 py-2 bg-[#f1f3f5] border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-primary/20 placeholder:text-slate-300"
                            placeholder="搜寻商品名称或编号 (Code)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <div className="bg-white sticky top-[132px] z-20 shadow-sm border-b border-slate-50">
                <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <div className="flex gap-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-5 py-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${activeCategory === cat
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-white text-slate-400 border border-slate-100'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
                <PullToRefresh onRefresh={loadData}>
                    <div className="max-w-[1600px] mx-auto p-2 lg:p-6">
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-1.5 lg:gap-4">
                        {isLoading ? (
                            Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-lg h-32 shadow-sm border border-slate-100 flex flex-col animate-pulse">
                                    <div className="aspect-square bg-slate-100 rounded-t-lg" />
                                </div>
                            ))
                        ) : filteredProducts.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => handleOpenModal(p)}
                                className="bg-white rounded-lg overflow-hidden shadow-sm border border-slate-100/50 flex flex-col animate-in fade-in duration-300 active:scale-95 transition-transform"
                            >
                                <div className="relative aspect-square">
                                    <div className="absolute top-0.5 left-0.5 bg-black/70 backdrop-blur-sm px-1 py-0.5 rounded-[2px] text-[5px] font-black text-white z-10 uppercase tracking-tighter scale-90 origin-top-left">
                                        {p.code}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveProduct(p.id);
                                        }}
                                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-white/90 text-red-500 rounded-full flex items-center justify-center shadow-sm z-10 active:scale-90 transition-transform border border-red-50 scale-90"
                                    >
                                        <span className="material-icons-round text-[10px]">delete</span>
                                    </button>
                                    {p.image_url ? (
                                        <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                                    ) : (
                                        <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                            <span className="material-icons-round text-slate-200 text-2xl">fastfood</span>
                                        </div>
                                    )}
                                </div>

                                <div className="p-1 flex-1 flex flex-col gap-0.5">
                                    <div className="flex items-center">
                                        <span className="text-[6px] font-black bg-primary/5 text-primary/60 px-0.5 py-0.5 rounded-[1px] uppercase tracking-tighter leading-none truncate max-w-full">{p.category}</span>
                                    </div>
                                    <h3 className="text-[8px] font-black text-slate-800 leading-tight truncate">{p.name}</h3>
                                    <div className="flex justify-between items-baseline mt-auto">
                                        {typeof p.price === 'number' && p.price > 0 ? (
                                            <p className="text-primary font-black text-[8px]">RM{p.price.toFixed(2)}</p>
                                        ) : (
                                            <p className="text-slate-300 font-bold text-[7px]">面议</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                </PullToRefresh>
            </main>

            <button
                onClick={() => handleOpenModal()}
                className="fixed bottom-28 right-6 w-14 h-14 bg-gradient-to-br from-primary to-primary-warm text-white rounded-full shadow-[0_10px_30px_rgba(128,0,0,0.3)] flex items-center justify-center active:scale-90 transition-all z-[60] border-4 border-white"
            >
                <span className="material-icons-round text-3xl font-black">add</span>
            </button>

            {/* Product Edit / Add Modal */}
            {isAddingProduct && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col justify-end">
                    <div className="bg-white rounded-t-[32px] p-5 space-y-4 animate-in slide-in-from-bottom duration-300 max-h-[95vh] overflow-y-auto no-scrollbar pb-12">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">{editingProduct ? '编辑商品' : '新增商品'}</h2>
                            <button onClick={() => setIsAddingProduct(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <span className="material-icons-round text-sm">close</span>
                            </button>
                        </div>

                        <div className="space-y-4 px-1">
                            {/* Image Upload Area */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">商品图片 (拍照或上传)</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                                <div
                                    onClick={() => imageInputRef.current?.click()}
                                    className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50 flex items-center justify-center group overflow-hidden relative"
                                >
                                    {imagePreview ? (
                                        <>
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white font-bold text-[10px]">点击重拍或更换</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center">
                                            <span className="material-icons-round text-2xl text-slate-200 group-hover:text-primary transition-colors">photo_camera</span>
                                            <p className="text-[9px] font-bold text-slate-300 mt-1">点击开启相机/上传</p>
                                        </div>
                                    )}
                                    {imageUploading && (
                                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                            <span className="material-icons-round animate-spin text-primary">autorenew</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">商品编号 *</label>
                                <input
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-1 focus:ring-primary/20"
                                    placeholder="如: CF01"
                                    value={form.code}
                                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">商品名称 *</label>
                                <input
                                    className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-1 focus:ring-primary/20"
                                    placeholder="输入完整商品名称"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">价格 RM *</label>
                                <input
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-primary focus:ring-1 focus:ring-primary/20 placeholder:text-slate-300 placeholder:font-normal"
                                    placeholder="留空为面议价"
                                    type="number"
                                    step="0.01"
                                    value={form.price}
                                    onChange={e => setForm({ ...form, price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">品类分区</label>
                                {!showCustomCategory ? (
                                    <div className="flex gap-2">
                                        <select
                                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-1 focus:ring-primary/20"
                                            value={form.category}
                                            onChange={e => setForm({ ...form, category: e.target.value })}
                                        >
                                            <option value="">— 选择品类 —</option>
                                            {PRESET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        </select>
                                        <button
                                            onClick={() => setShowCustomCategory(true)}
                                            className="px-4 bg-slate-100 text-[10px] font-black text-slate-400 rounded-xl uppercase"
                                        >
                                            自定义
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            autoFocus
                                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-1 focus:ring-primary/20"
                                            placeholder="输入分类名..."
                                            value={customCategory}
                                            onChange={e => setCustomCategory(e.target.value)}
                                        />
                                        <button
                                            onClick={() => { setShowCustomCategory(false); setCustomCategory(''); }}
                                            className="w-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center"
                                        >
                                            <span className="material-icons-round">list</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || imageUploading}
                                className="w-full py-5 bg-primary text-white rounded-[24px] font-black text-lg shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {isSubmitting && <span className="material-icons-round animate-spin">autorenew</span>}
                                {editingProduct ? '保存更新' : '立即发布'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductManagement;
