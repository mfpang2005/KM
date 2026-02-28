import React, { useState, useEffect, useRef } from 'react';
import { api, ProductService } from '../services/api';
import type { Product } from '../types';

// NOTE: 预设品类选项，可根据供应商菜单扩展
const PRESET_CATEGORIES = [
    '主食 Mains',
    '饮品 Beverages',
    '小食 Snacks',
    '甜点 Desserts',
    '汤品 Soups',
    '素食 Vegetarian',
    '海鲜 Seafood',
    '肉类 Meat',
    '套餐 Set Meals',
    '其他 Others',
];

interface ProductForm {
    code: string;
    name: string;
    price: number | '';
    category: string;
    image_url: string;
}

export const ProductsPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [form, setForm] = useState<ProductForm>({ code: '', name: '', price: '', category: '', image_url: '' });

    // NOTE: 将提交状态与列表加载状态分离，避免表单 submit 按钮被列表 loading 影响
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string>('');
    const [customCategory, setCustomCategory] = useState('');
    const [showCustomCategory, setShowCustomCategory] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const loadProducts = async () => {
        setLoading(true);
        try {
            const data = await ProductService.getAll();
            setProducts(data);
        } catch (error) {
            console.error('Failed to load products', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, []);

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
        try {
            await ProductService.delete(id);
            await loadProducts();
        } catch (error) {
            console.error('Failed to delete product', error);
            alert('Delete failed.');
        }
    };

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setForm({ code: product.code, name: product.name, price: product.price ?? '', category: product.category || '', image_url: product.image_url || '' });
            setImagePreview(product.image_url || '');
            setShowCustomCategory(!PRESET_CATEGORIES.includes(product.category || ''));
            setCustomCategory(!PRESET_CATEGORIES.includes(product.category || '') ? (product.category || '') : '');
        } else {
            setEditingProduct(null);
            setForm({ code: '', name: '', price: '', category: '', image_url: '' });
            setImagePreview('');
            setShowCustomCategory(false);
            setCustomCategory('');
        }
        setShowModal(true);
    };

    /**
     * 上传产品图片至 Supabase Storage product-images bucket
     */
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageUploading(true);
        try {
            const localPreview = URL.createObjectURL(file);
            setImagePreview(localPreview);

            const formData = new FormData();
            formData.append('file', file);

            // POST to backend
            const response = await api.post('/products/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setForm(prev => ({ ...prev, image_url: response.data.url }));
        } catch (err) {
            console.error('Image upload failed', err);
            alert('图片上传失败，请重试。');
            setImagePreview(form.image_url);
        } finally {
            setImageUploading(false);
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const finalCategory = showCustomCategory ? customCategory : form.category;
        // NOTE: 清理空字段，防止后端拒绝 null/空字段导致失败
        const payload: Record<string, unknown> = {
            code: form.code,
            name: form.name,
            category: finalCategory || undefined,
            image_url: form.image_url || undefined,
        };
        if (form.price !== '' && form.price !== null) {
            payload.price = form.price;
        }

        try {
            setIsSubmitting(true);
            if (editingProduct) {
                await ProductService.update(editingProduct.id, payload as Parameters<typeof ProductService.update>[1]);
            } else {
                await ProductService.create(payload as Parameters<typeof ProductService.create>[0]);
            }
            setShowModal(false);
            await loadProducts();
        } catch (error: unknown) {
            console.error('Failed to save product', error);
            const msg = error instanceof Error ? error.message : JSON.stringify(error);
            alert(`保存失败: ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Products Management</h1>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-bold text-sm hover:shadow-[0_8px_20px_rgba(220,38,38,0.3)] hover:-translate-y-0.5 transition-all flex items-center gap-2"
                >
                    <span className="material-icons-round text-[20px]">add</span>
                    Add Product
                </button>
            </div>

            <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgba(220,38,38,0.04)] border border-red-50 overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100/60 text-slate-500 font-bold">
                            <th className="px-8 py-5">Code</th>
                            <th className="px-8 py-5">Name & Category</th>
                            <th className="px-8 py-5">Price</th>
                            <th className="px-8 py-5 text-right w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-8 py-16 text-center text-slate-400">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-8 py-16 text-center text-slate-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="material-icons-round text-6xl text-slate-200">inventory_2</span>
                                        <p className="font-bold">No products found. Start by adding one!</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            products.map(product => (
                                <tr key={product.id} className="hover:bg-red-50/30 transition-colors group">
                                    <td className="px-8 py-5 font-mono font-bold text-slate-500">{product.code}</td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                                                {product.image_url ? (
                                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="material-icons-round text-slate-300">fastfood</span>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800">{product.name}</p>
                                                {product.category && <p className="text-xs text-slate-400 mt-0.5">{product.category}</p>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="font-black text-slate-700">
                                            {product.price != null ? (
                                                <><span className="text-xs text-slate-400 mr-1">RM</span>{product.price.toFixed(2)}</>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">面议价</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleOpenModal(product)}
                                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors mr-2 inline-flex items-center justify-center"
                                        >
                                            <span className="material-icons-round text-[18px]">edit</span>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product.id, product.name)}
                                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors inline-flex items-center justify-center"
                                        >
                                            <span className="material-icons-round text-[18px]">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal for Add / Edit Product */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden relative border border-slate-100">
                        <div className="p-6 border-b border-slate-100 relative">
                            <h2 className="text-xl font-bold text-slate-800">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                            <p className="text-sm text-slate-500 mt-1">Configure item details and pricing globally</p>
                            <button
                                onClick={() => setShowModal(false)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* 图片上传区 */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">Product Image</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                                <div
                                    onClick={() => imageInputRef.current?.click()}
                                    className="w-full h-36 rounded-2xl border-2 border-dashed border-slate-200 hover:border-red-400 transition-colors cursor-pointer overflow-hidden flex items-center justify-center bg-slate-50 group relative"
                                >
                                    {imagePreview ? (
                                        <>
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white font-bold text-sm flex items-center gap-1.5">
                                                    <span className="material-icons-round">photo_camera</span>
                                                    Change Photo
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center text-slate-400">
                                            {imageUploading ? (
                                                <span className="material-icons-round animate-spin text-3xl text-red-400">autorenew</span>
                                            ) : (
                                                <>
                                                    <span className="material-icons-round text-3xl group-hover:text-red-400 transition-colors">add_photo_alternate</span>
                                                    <p className="text-xs font-bold mt-1 group-hover:text-red-500 transition-colors">Click to upload image</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {imageUploading && <p className="text-xs text-red-500 mt-1 animate-pulse">Uploading...</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Product Code *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                        placeholder="e.g. CF01"
                                        value={form.code}
                                        onChange={e => setForm({ ...form, code: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Price (RM) <span className="text-slate-300">选填</span></label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                        placeholder="面议价 / 留空"
                                        value={form.price}
                                        onChange={e => setForm({ ...form, price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">Product Name *</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                    placeholder="e.g. Classic Beef Burger"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            {/* 品类选择 - 预设下拉 + 自定义选项 */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5">Category</label>
                                {!showCustomCategory ? (
                                    <div className="flex gap-2">
                                        <select
                                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium text-slate-700"
                                            value={form.category}
                                            onChange={e => setForm({ ...form, category: e.target.value })}
                                        >
                                            <option value="">— Select Category —</option>
                                            {PRESET_CATEGORIES.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowCustomCategory(true)}
                                            className="px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors whitespace-nowrap"
                                            title="自定义分类"
                                        >
                                            + 自定义
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                            placeholder="输入自定义分类名..."
                                            value={customCategory}
                                            onChange={e => setCustomCategory(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setShowCustomCategory(false); setCustomCategory(''); }}
                                            className="px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                            title="返回预设选项"
                                        >
                                            <span className="material-icons-round text-[16px]">list</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-2.5 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                {/* NOTE: 使用独立的 isSubmitting 而非列表 loading，避免初始加载时按钮被禁用 */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting || imageUploading}
                                    className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting && <span className="material-icons-round animate-spin text-[18px]">autorenew</span>}
                                    {editingProduct ? 'Save Changes' : 'Publish Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
