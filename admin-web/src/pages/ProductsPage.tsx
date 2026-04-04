import React, { useState, useEffect, useRef } from 'react';
import { api, ProductService } from '../services/api';
import type { Product } from '../types';
import { PageHeader } from '../components/PageHeader';
import { NotificationBell } from '../components/NotificationBell';

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

    // 双重确认弹窗状态
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [confirmDeleteInfo, setConfirmDeleteInfo] = useState<{ id: string; name: string } | null>(null);
    const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
    const [isDeleting, setIsDeleting] = useState(false);

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

    const handleDelete = (id: string, name: string) => {
        setConfirmDeleteInfo({ id, name });
        setDeleteStep(1);
        setDeleteModalOpen(true);
    };

    const executeDelete = async () => {
        if (!confirmDeleteInfo) return;
        setIsDeleting(true);
        try {
            await ProductService.delete(confirmDeleteInfo.id);
            await loadProducts();
            setDeleteModalOpen(false);
            setConfirmDeleteInfo(null);
        } catch (error) {
            console.error('Failed to delete product', error);
            alert('Delete failed.');
        } finally {
            setIsDeleting(false);
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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageUploading(true);
        try {
            const localPreview = URL.createObjectURL(file);
            setImagePreview(localPreview);

            const formData = new FormData();
            formData.append('file', file);

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
        const payload: Record<string, any> = {
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
                await ProductService.update(editingProduct.id, payload);
            } else {
                await ProductService.create(payload as any);
            }
            setShowModal(false);
            await loadProducts();
        } catch (error: any) {
            console.error('Failed to save product', error);
            const msg = error.message || JSON.stringify(error);
            alert(`保存失败: ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mt-10 mx-auto max-w-[1600px] px-4 pb-20">
            <PageHeader
                title="Products Management"
                subtitle="Configure item details and pricing globally"
                showStats={false}
                actions={
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleOpenModal()}
                            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
                        >
                            <span className="material-icons-round text-[20px]">add</span>
                            Add Product
                        </button>
                        <NotificationBell />
                    </div>
                }
            />

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
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Price (RM)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 text-sm font-medium"
                                        placeholder="留空为面议"
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
                                <button
                                    type="submit"
                                    disabled={isSubmitting || imageUploading}
                                    className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-lg disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting && <span className="material-icons-round animate-spin text-[18px]">autorenew</span>}
                                    {editingProduct ? 'Save Changes' : 'Publish Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && confirmDeleteInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden relative border border-slate-100">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className={`material-icons-round text-red-500 text-4xl ${deleteStep === 2 ? 'animate-pulse' : ''}`}>
                                    {deleteStep === 1 ? 'help_outline' : 'report_problem'}
                                </span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">
                                {deleteStep === 1 ? 'Confirm Delete?' : 'Final Warning!'}
                            </h3>
                            <p className="text-slate-500 font-bold leading-relaxed mb-8 px-4">
                                {deleteStep === 1 ? (
                                    <>Are you sure you want to remove <span className="text-slate-900 font-black">"{confirmDeleteInfo.name}"</span>?</>
                                ) : (
                                    <span className="text-red-500">This action is permanent and will remove this product from all active menus. Click again to confirm.</span>
                                )}
                            </p>
                            <div className="flex flex-col gap-3">
                                {deleteStep === 1 ? (
                                    <button
                                        onClick={() => setDeleteStep(2)}
                                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-xl"
                                    >
                                        Yes, I'm Sure
                                    </button>
                                ) : (
                                    <button
                                        onClick={executeDelete}
                                        disabled={isDeleting}
                                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isDeleting && <span className="material-icons-round animate-spin">autorenew</span>}
                                        Confirm Permanent Delete
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setDeleteModalOpen(false);
                                        setConfirmDeleteInfo(null);
                                    }}
                                    disabled={isDeleting}
                                    className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
