
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface Product {
    id: string;
    code: string;
    name: string;
    category: string;
    price: string;
    stock: number;
    img: string;
}

const INITIAL_PRODUCTS: Product[] = [
    { id: '1', code: 'ML-001', name: 'Nasi Lemak Special', category: '主食', price: 'RM 12.00', stock: 150, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA-zYrJbrNpXyj1ZApJ21DVeh2-UWkEcE_zHD3xjzDR2ypdgdPvD0V_NL69ECXIOlhLNgD0KtB5kIQD9BmKz4dy44rGBOU_9xUudK04cTPlUWReSnKfgEzFUXYX-Joqdr6d5gY4GsDHkfXA9jT4XKdBfVSpO1QZTWNbRs6tMmgG0RaPE0KlUn-5pWnKcCLRk8kPCfvhENj41hNmOLyBRL5v6b4EwGTwo2XqKOECOtYGSdZF6JNSRoAXEVowdaw2NSMOOWFs7G5D3mvf' },
    { id: '2', code: 'ST-002', name: 'Chicken Satay (10)', category: '小吃', price: 'RM 15.00', stock: 80, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCr1A0UkYD47bPyjINVhOMMiB-pdO6Vk9GkIst7TGBPcENh6mor-beIE0m-zai1jb8ISvg0dfAHur75hz38kljvdLDYDhZL-2ExznnuKSVz_DC0ZJEAL2uTdFO5HUVg3AYRyECUgerFv4RSqf8DUrKNHpID4Dd5JhD0TnTCZbd2A9ZDW4MCHQT65EjZTHjvSdZf_OqT0CAh_1IQOS7JVmm59EG9tT5QDfeexTdpUkUFKHXXnZwE66rkmWOuJ0Q7WWSPtN1nUcxBxRf' },
    { id: '3', code: 'DR-003', name: 'Teh Tarik', category: '饮料', price: 'RM 3.50', stock: 200, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA-zYrJbrNpXyj1ZApJ21DVeh2-UWkEcE_zHD3xjzDR2ypdgdPvD0V_NL69ECXIOlhLNgD0KtB5kIQD9BmKz4dy44rGBOU_9xUudK04cTPlUWReSnKfgEzFUXYX-Joqdr6d5gY4GsDHkfXA9jT4XKdBfVSpO1QZTWNbRs6tMmgG0RaPE0KlUn-5pWnKcCLRk8kPCfvhENj41hNmOLyBRL5v6b4EwGTwo2XqKOECOtYGSdZF6JNSRoAXEVowdaw2NSMOOWFs7G5D3mvf' },
];

const ProductManagement: React.FC = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
    const [categories, setCategories] = useState<string[]>(['全部', '主食', '小吃', '饮料', '套餐']);
    const [activeCategory, setActiveCategory] = useState('全部');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddingProduct, setIsAddingProduct] = useState(false);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    
    const [newProduct, setNewProduct] = useState<Partial<Product>>({
        category: '主食',
        price: 'RM ',
        stock: 100
    });

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesCategory = activeCategory === '全部' || p.category === activeCategory;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                p.code.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, activeCategory, searchQuery]);

    const handleAddProduct = () => {
        if (!newProduct.name || !newProduct.code) return;
        
        const product: Product = {
            id: Date.now().toString(),
            code: newProduct.code || '',
            name: newProduct.name || '',
            category: newProduct.category || categories[1] || '其他',
            price: newProduct.price || 'RM 0.00',
            stock: Number(newProduct.stock) || 0,
            img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA-zYrJbrNpXyj1ZApJ21DVeh2-UWkEcE_zHD3xjzDR2ypdgdPvD0V_NL69ECXIOlhLNgD0KtB5kIQD9BmKz4dy44rGBOU_9xUudK04cTPlUWReSnKfgEzFUXYX-Joqdr6d5gY4GsDHkfXA9jT4XKdBfVSpO1QZTWNbRs6tMmgG0RaPE0KlUn-5pWnKcCLRk8kPCfvhENj41hNmOLyBRL5v6b4EwGTwo2XqKOECOtYGSdZF6JNSRoAXEVowdaw2NSMOOWFs7G5D3mvf'
        };
        
        setProducts([product, ...products]);
        setIsAddingProduct(false);
        setNewProduct({ category: categories[1] || '其他', price: 'RM ', stock: 100 });
    };

    const handleRemoveProduct = (id: string) => {
        if (window.confirm('确定要移除该商品吗？此操作不可撤销。')) {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    const handleAddCategory = () => {
        if (!newCatName.trim()) return;
        if (categories.includes(newCatName.trim())) {
            alert('分类已存在');
            return;
        }
        setCategories([...categories, newCatName.trim()]);
        setNewCatName('');
        setIsAddingCategory(false);
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

            <div className="bg-white px-4 py-3 flex items-center gap-2 sticky top-[132px] z-20 shadow-sm">
                <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-5 py-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                                activeCategory === cat 
                                    ? 'bg-primary text-white shadow-md' 
                                    : 'bg-white text-slate-400 border border-slate-100'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <button 
                    onClick={() => setIsAddingCategory(true)}
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100 active:scale-90 transition-transform"
                >
                    <span className="material-icons-round text-lg">add</span>
                </button>
            </div>

            <main className="flex-1 overflow-y-auto p-4 no-scrollbar pb-32">
                <div className="grid grid-cols-2 gap-4">
                    {filteredProducts.map((p) => (
                        <div key={p.id} className="bg-white rounded-[24px] overflow-hidden shadow-sm border border-slate-100/50 flex flex-col animate-in fade-in duration-300">
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
                                <img src={p.img} className="w-full h-full object-cover" alt={p.name} />
                            </div>
                            
                            <div className="p-4 flex-1 flex flex-col gap-2">
                                <div className="flex items-center">
                                    <span className="text-[9px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-md uppercase tracking-wider">{p.category}</span>
                                </div>
                                <h3 className="text-xs font-black text-slate-800 leading-tight">{p.name}</h3>
                                <div className="flex justify-between items-baseline mt-auto">
                                    <p className="text-primary font-black text-sm">{p.price}</p>
                                    <span className="text-[10px] text-slate-300 font-black uppercase">存: {p.stock}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            <button 
                onClick={() => setIsAddingProduct(true)}
                className="fixed bottom-10 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform z-40"
            >
                <span className="material-icons-round text-3xl">add</span>
            </button>

            {/* Modals remain mostly the same but with refined styles for consistency */}
            {isAddingCategory && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
                    <div className="bg-white w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-in zoom-in duration-200">
                        <h2 className="text-lg font-black text-slate-900 mb-4 tracking-tight">新增商品分类</h2>
                        <input 
                            autoFocus
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold placeholder:text-slate-300" 
                            placeholder="输入分类名称..."
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                        />
                        <div className="flex gap-3 mt-6">
                            <button 
                                onClick={() => setIsAddingCategory(false)}
                                className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleAddCategory}
                                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-xs shadow-lg shadow-primary/20"
                            >
                                确认添加
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAddingProduct && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col justify-end">
                    <div className="bg-white rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">新增商品</h2>
                            <button onClick={() => setIsAddingProduct(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <input 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold" 
                                    placeholder="商品编号 (Code)"
                                    value={newProduct.code}
                                    onChange={e => setNewProduct({...newProduct, code: e.target.value})}
                                />
                                <select 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold"
                                    value={newProduct.category}
                                    onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                                >
                                    {categories.filter(c => c !== '全部').map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <input 
                                className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold" 
                                placeholder="输入商品名称"
                                value={newProduct.name}
                                onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <input 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-primary" 
                                    placeholder="价格 RM 0.00"
                                    value={newProduct.price}
                                    onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                                />
                                <input 
                                    type="number"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold" 
                                    placeholder="初始库存"
                                    value={newProduct.stock}
                                    onChange={e => setNewProduct({...newProduct, stock: Number(e.target.value)})}
                                />
                            </div>
                        </div>
                        <button 
                            onClick={handleAddProduct}
                            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-primary/20 active:scale-95 transition-all"
                        >
                            保存商品
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductManagement;
