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
            price: form.price === '' ? 0 : Number(form.price),
            category: finalCategory || '其他',
            stock: form.stock === '' ? 0 : Number(form.stock),
            image_url: form.image_url
        };

        try {
            if (editingProduct) {
                await ProductService.update(editingProduct.id, payload as any);
            } else {
                await ProductService.create(payload);
            }
            setIsAddingProduct(false);
            loadData();
        } catch (error) {
            console.error('Failed to save product', error);
            alert('保存失败');
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
            <header className="pt-12 pb-4 px-6 bg-white flex flex-col sticky top-0 z-30 shadow-sm border-b border-slate-50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/admin')} className="text-slate-400 p-1 active:scale-90 transition-transform">
                            <span className="material-icons-round">arrow_back</span>
                        </button>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">商品管理</h1>
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
            </header>

            <div className="bg-white px-4 py-3 flex items-center gap-2 sticky top-[132px] z-20 shadow-sm overflow-x-auto no-scrollbar border-b border-slate-50">
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

            <main className="flex-1 overflow-y-auto p-4 no-scrollbar pb-32">
                <PullToRefresh onRefresh={loadData}>
                    <div className="grid grid-cols-2 gap-4">
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-[24px] h-64 shadow-sm border border-slate-100 flex flex-col animate-pulse">
                                    <div className="aspect-square bg-slate-100 rounded-t-[24px]" />
                                    <div className="p-4 space-y-2">
                                        <div className="h-2 w-1/2 bg-slate-100 rounded" />
                                        <div className="h-3 w-3/4 bg-slate-100 rounded" />
                                        <div className="flex justify-between mt-auto">
                                            <div className="h-4 w-1/3 bg-slate-100 rounded" />
                                            <div className="h-2 w-1/4 bg-slate-100 rounded" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : filteredProducts.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => handleOpenModal(p)}
                                className="bg-white rounded-[24px] overflow-hidden shadow-sm border border-slate-100/50 flex flex-col animate-in fade-in duration-300 active:scale-95 transition-transform"
                            >
                                <div className="relative aspect-square">
                                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-md text-[8px] font-black text-white z-10 uppercase tracking-widest">
                                        {p.code}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveProduct(p.id);
                                        }}
                                        className="absolute top-2 right-2 w-8 h-8 bg-white text-red-500 rounded-full flex items-center justify-center shadow-md z-10 active:scale-90 transition-transform border border-red-50"
                                    >
                                        <span className="material-icons-round text-[18px]">delete</span>
                                    </button>
                                    {p.image_url ? (
                                        <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                                    ) : (
                                        <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                            <span className="material-icons-round text-slate-200 text-6xl">fastfood</span>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 flex-1 flex flex-col gap-2">
                                    <div className="flex items-center">
                                        <span className="text-[9px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-md uppercase tracking-wider">{p.category}</span>
                                    </div>
                                    <h3 className="text-xs font-black text-slate-800 leading-tight">{p.name}</h3>
                                    <div className="flex justify-between items-baseline mt-auto">
                                        <p className="text-primary font-black text-sm">RM {typeof p.price === 'number' ? p.price.toFixed(2) : p.price}</p>
                                        <span className="text-[10px] text-slate-300 font-black uppercase">存: {p.stock}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </PullToRefresh>
            </main>

            <button
                onClick={() => handleOpenModal()}
                className="fixed bottom-10 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform z-40"
            >
                <span className="material-icons-round text-3xl">add</span>
            </button>

            {/* Product Edit / Add Modal */}
            {isAddingProduct && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col justify-end">
                    <div className="bg-white rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">{editingProduct ? '编辑商品' : '新增商品'}</h2>
                            <button onClick={() => setIsAddingProduct(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <div className="space-y-6 px-1">
                            {/* Image Upload Area */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品图片</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                                <div
                                    onClick={() => imageInputRef.current?.click()}
                                    className="w-full h-40 rounded-3xl border-2 border-dashed border-slate-100 bg-slate-50 flex items-center justify-center group overflow-hidden relative"
                                >
                                    {imagePreview ? (
                                        <>
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white font-bold text-xs">点击更换图片</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center">
                                            <span className="material-icons-round text-3xl text-slate-200 group-hover:text-primary transition-colors">add_photo_alternate</span>
                                            <p className="text-[10px] font-bold text-slate-300 mt-1">上传图片</p>
                                        </div>
                                    )}
                                    {imageUploading && (
                                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                            <span className="material-icons-round animate-spin text-primary">autorenew</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">库存状态</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-1 focus:ring-primary/20"
                                        placeholder="初始库存"
                                        value={form.stock}
                                        onChange={e => setForm({ ...form, stock: e.target.value === '' ? '' : parseInt(e.target.value) })}
                                    />
                                </div>
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
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-primary focus:ring-1 focus:ring-primary/20"
                                    placeholder="0.00"
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
