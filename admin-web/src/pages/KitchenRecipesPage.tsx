import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminOrderService } from '../services/api';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
    name: string;
    baseQty: number;
    unit: string;
}

interface Recipe {
    id: string;
    name: string;
    ingredients: Ingredient[];
}

const KitchenRecipesPage: React.FC = () => {
    const navigate = useNavigate();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [isAddingRecipe, setIsAddingRecipe] = useState(false);
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [newRecipeIngredients, setNewRecipeIngredients] = useState<Ingredient[]>([{ name: '', baseQty: 0, unit: '' }]);

    const fetchRecipes = useCallback(async () => {
        try {
            const data = await AdminOrderService.getRecipes();
            setRecipes(data);
        } catch (e) {
            console.error('Failed to fetch recipes', e);
        }
    }, []);

    useEffect(() => {
        fetchRecipes();
    }, [fetchRecipes]);

    const handleOpenAddModal = () => {
        setEditingRecipeId(null);
        setNewRecipeName('');
        setNewRecipeIngredients([{ name: '', baseQty: 0, unit: '' }]);
        setIsAddingRecipe(true);
    };

    const handleOpenEditModal = (recipe: Recipe) => {
        setEditingRecipeId(recipe.id);
        setNewRecipeName(recipe.name);
        setNewRecipeIngredients(recipe.ingredients.length > 0 ? [...recipe.ingredients] : [{ name: '', baseQty: 0, unit: '' }]);
        setIsAddingRecipe(true);
    };

    const handleDeleteRecipe = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this recipe?')) {
            try {
                await AdminOrderService.deleteRecipe(id);
                fetchRecipes();
            } catch (e) {
                console.error('Failed to delete recipe', e);
            }
        }
    };

    const handleAddOrUpdateRecipe = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const validIngredients = newRecipeIngredients.filter(ing => ing.name.trim() !== '');
        try {
            if (editingRecipeId) {
                await AdminOrderService.updateRecipe(editingRecipeId, {
                    name: newRecipeName,
                    ingredients: validIngredients
                });
            } else {
                await AdminOrderService.addRecipe({
                    name: newRecipeName,
                    ingredients: validIngredients
                });
            }
            fetchRecipes();
            setIsAddingRecipe(false);
            setEditingRecipeId(null);
            setNewRecipeName('');
            setNewRecipeIngredients([{ name: '', baseQty: 0, unit: '' }]);
        } catch (e) {
            console.error('Failed to save recipe', e);
            alert('保存失败，请重试');
        }
    };

    const handleExportExcel = () => {
        const exportData = recipes.flatMap(recipe =>
            recipe.ingredients.map(ing => ({
                'Recipe Name (菜名)': recipe.name,
                'Ingredient (配料)': ing.name,
                'Unit (单位)': ing.unit,
                'Volume (分量/10pax)': ing.baseQty
            }))
        );
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Recipes');
        XLSX.writeFile(wb, `KimLong_Recipes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result as string;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data: any[] = XLSX.utils.sheet_to_json(ws);
            const importedMap: Record<string, Ingredient[]> = {};
            data.forEach(row => {
                const name = row['Recipe Name (菜名)'] || row['菜名'];
                const ingName = row['Ingredient (配料)'] || row['配料'];
                const unit = row['Unit (单位)'] || row['单位'];
                const qty = parseFloat(row['Volume (分量/10pax)'] || row['分量']);
                if (name && ingName) {
                    if (!importedMap[name]) importedMap[name] = [];
                    importedMap[name].push({ name: ingName, unit: unit || '', baseQty: qty || 0 });
                }
            });
            const newRecipes = Object.entries(importedMap).map(([name, ingredients]) => ({
                id: 'r-import-' + Math.random().toString(36).substr(2, 9),
                name,
                ingredients
            }));
            const currentNames = new Set(recipes.map(r => r.name));
            const filtered = newRecipes.filter(r => !currentNames.has(r.name));

            Promise.all(filtered.map(r => AdminOrderService.addRecipe({
                name: r.name,
                ingredients: r.ingredients
            }))).then(() => {
                fetchRecipes();
                alert(`Imported ${filtered.length} new recipes!`);
            }).catch(e => {
                console.error('Failed to import recipes', e);
                alert('部分或全部菜谱导入失败');
            });
        };
        reader.readAsBinaryString(file);
    };

    const addIngredientRow = () => setNewRecipeIngredients([...newRecipeIngredients, { name: '', baseQty: 0, unit: '' }]);

    const removeIngredientRow = (index: number) => {
        if (newRecipeIngredients.length > 1) {
            const updated = [...newRecipeIngredients];
            updated.splice(index, 1);
            setNewRecipeIngredients(updated);
        }
    };

    const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
        const updated = [...newRecipeIngredients];
        updated[index] = { ...updated[index], [field]: value };
        setNewRecipeIngredients(updated);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 rounded-[32px] overflow-hidden border border-slate-200 shadow-xl">
            <header className="pt-8 pb-6 px-10 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <button 
                        onClick={() => navigate('/kitchen-prep')}
                        className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                    >
                        <span className="material-icons-round">arrow_back</span>
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <span className="material-icons-round text-blue-600 text-sm">menu_book</span>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Recipe Management</h1>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Organize and maintain kitchen proportions</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <label className="bg-emerald-50 text-emerald-600 px-5 py-3 rounded-2xl flex items-center gap-2.5 cursor-pointer hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100 shadow-sm">
                        <span className="material-icons-round text-lg">upload_file</span>
                        <span className="text-xs font-black uppercase tracking-wider">Import Excel</span>
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                    </label>
                    <button onClick={handleExportExcel} className="bg-slate-50 text-slate-600 px-5 py-3 rounded-2xl flex items-center gap-2.5 hover:bg-slate-100 transition-all active:scale-95 border border-slate-200/50 shadow-sm">
                        <span className="material-icons-round text-lg">download</span>
                        <span className="text-xs font-black uppercase tracking-wider">Export List</span>
                    </button>
                    <button onClick={handleOpenAddModal} className="bg-blue-600 text-white px-5 py-3 rounded-2xl flex items-center gap-2.5 hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-500/20">
                        <span className="material-icons-round text-lg">add_circle</span>
                        <span className="text-xs font-black uppercase tracking-wider">Add New Recipe</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-10 no-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                    {recipes.map((recipe) => (
                        <div key={recipe.id} className="group bg-white border border-slate-100/80 rounded-[40px] p-8 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-2 transition-all duration-500 cursor-pointer flex flex-col gap-6 shadow-sm">
                            <div className="flex flex-col gap-6" onClick={() => setSelectedRecipe(recipe)}>
                                <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-inner">
                                    <span className="material-icons-round text-[32px]">restaurant_menu</span>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-slate-800 tracking-tight truncate group-hover:text-blue-600 transition-colors uppercase mb-2">{recipe.name}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="px-3 py-1 bg-slate-100 text-[10px] font-black text-slate-500 rounded-full uppercase tracking-widest">{recipe.ingredients.length} Ingredients</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-auto pt-6 border-t border-slate-50">
                                <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(recipe); }} className="py-3.5 bg-slate-50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                                    <span className="material-icons-round text-sm">edit</span> Edit
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }} className="py-3.5 bg-slate-50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2">
                                    <span className="material-icons-round text-sm">delete_outline</span> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {recipes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-40 text-slate-300">
                        <span className="material-icons-round text-8xl mb-6 opacity-20">inventory_2</span>
                        <p className="text-sm font-black uppercase tracking-[0.2em]">No recipes found.</p>
                        <button onClick={handleOpenAddModal} className="mt-8 text-blue-600 font-bold border-b-2 border-blue-600/20 hover:border-blue-600 pb-1 transition-all">Create your first recipe →</button>
                    </div>
                )}
            </main>

            {/* ── Recipe Details Modal ── */}
            {selectedRecipe && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-lg rounded-[56px] p-12 shadow-2xl animate-in zoom-in duration-300 flex flex-col max-h-[85vh]">
                        <header className="flex justify-between items-start mb-10 flex-shrink-0">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="material-icons-round text-blue-600 text-sm">calculate</span>
                                    <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Recipe Specs</h2>
                                </div>
                                <h3 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">{selectedRecipe.name}</h3>
                            </div>
                            <button onClick={() => setSelectedRecipe(null)} className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all active:scale-90 shadow-sm border border-slate-200/50">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 mb-10 pr-2">
                            {selectedRecipe.ingredients.map((ing, idx) => (
                                <div key={idx} className="bg-slate-50 p-8 rounded-[40px] border border-white flex items-center justify-between shadow-sm">
                                    <span className="text-base font-black text-slate-700 uppercase tracking-tight">{ing.name}</span>
                                    <div className="text-right flex items-baseline gap-2">
                                        <span className="text-3xl font-black text-slate-900 tabular-nums">{ing.baseQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ing.unit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setSelectedRecipe(null)} className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/30 hover:bg-slate-800 transition-all active:scale-[0.98]">
                            Confirm Proportions
                        </button>
                    </div>
                </div>
            )}

            {/* ── Add/Edit Recipe Modal ── */}
            {isAddingRecipe && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <form onSubmit={handleAddOrUpdateRecipe} className="bg-white w-full max-w-2xl rounded-[56px] p-12 shadow-2xl animate-in zoom-in duration-300 flex flex-col max-h-[85vh]">
                        <header className="flex justify-between items-center mb-10 shrink-0">
                            <div>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">{editingRecipeId ? 'Edit Recipe' : 'New Recipe'}</h3>
                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">Define standard proportions per 10 pax</p>
                            </div>
                            <button type="button" onClick={() => setIsAddingRecipe(false)} className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all active:scale-90 shadow-sm border border-slate-200/50">
                                <span className="material-icons-round">close</span>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto no-scrollbar pr-2 space-y-8">
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Recipe Name (菜品名称)</label>
                                <input
                                    required
                                    type="text"
                                    value={newRecipeName}
                                    onChange={(e) => setNewRecipeName(e.target.value)}
                                    placeholder="e.g. CURRY CHICKEN"
                                    className="w-full h-16 bg-slate-50 border-2 border-slate-100 rounded-[28px] px-8 text-lg font-black text-slate-800 focus:border-blue-500/30 focus:bg-white outline-none transition-all placeholder:text-slate-300"
                                />
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Ingredients List (配料表)</label>
                                    <button type="button" onClick={addIngredientRow} className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:text-blue-700 transition-all">
                                        <span className="material-icons-round text-sm">add_circle</span> Add Row
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {newRecipeIngredients.map((ing, idx) => (
                                        <div key={idx} className="flex gap-3 group">
                                            <input
                                                required
                                                type="text"
                                                placeholder="Ingredient Name"
                                                value={ing.name}
                                                onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                                                className="flex-1 h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 text-sm font-bold text-slate-700 focus:border-blue-500/30 focus:bg-white outline-none transition-all"
                                            />
                                            <input
                                                required
                                                type="number"
                                                step="any"
                                                placeholder="Qty"
                                                value={ing.baseQty || ''}
                                                onChange={(e) => updateIngredient(idx, 'baseQty', parseFloat(e.target.value))}
                                                className="w-24 h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 text-sm font-bold text-slate-700 focus:border-blue-500/30 focus:bg-white outline-none transition-all tabular-nums"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Unit"
                                                value={ing.unit}
                                                onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                                                className="w-20 h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 text-sm font-bold text-slate-700 focus:border-blue-500/30 focus:bg-white outline-none transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeIngredientRow(idx)}
                                                className="h-14 w-14 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:border-red-100 transition-all shadow-sm shrink-0"
                                            >
                                                <span className="material-icons-round text-xl">delete_outline</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-10 shrink-0">
                            <button type="submit" className="w-full py-6 bg-blue-600 text-white rounded-[32px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-[0.98]">
                                {editingRecipeId ? 'Update Recipe Data' : 'Save New Recipe'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default KitchenRecipesPage;
