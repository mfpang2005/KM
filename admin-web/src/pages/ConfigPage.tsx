import React, { useState, useEffect, useCallback } from 'react';
import { SuperAdminService } from '../services/api';
import type { SystemConfig } from '../types';

export const ConfigPage: React.FC = () => {
    const [configs, setConfigs] = useState<SystemConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [showAdd, setShowAdd] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            const data = await SuperAdminService.getConfig();
            setConfigs(data);
        } catch (error) {
            console.error('Failed to load configs', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const handleSave = async (key: string) => {
        try {
            const parsed = JSON.parse(editValue);
            await SuperAdminService.updateConfig(key, parsed);
            setEditingKey(null);
            await loadConfig();
        } catch {
            alert('Invalid JSON format');
        }
    };

    const handleAdd = async () => {
        if (!newKey.trim()) return;
        try {
            const parsed = JSON.parse(newValue || '{}');
            await SuperAdminService.updateConfig(newKey.trim(), parsed);
            setNewKey('');
            setNewValue('');
            setShowAdd(false);
            await loadConfig();
        } catch {
            alert('Invalid JSON format');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-xl font-bold text-slate-800">System Configuration</h1>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-sm hover:bg-blue-800 transition-colors"
                >
                    <span className="material-icons-round text-[18px]">add</span>
                    New Config
                </button>
            </div>

            {showAdd && (
                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 shadow-inner">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Add Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Key Name</label>
                            <input
                                value={newKey} onChange={e => setNewKey(e.target.value)}
                                placeholder="e.g. business_hours"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Value (JSON)</label>
                            <textarea
                                value={newValue} onChange={e => setNewValue(e.target.value)}
                                placeholder='{"open": "08:00", "close": "22:00"}'
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 h-24 resize-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold">Cancel</button>
                        <button onClick={handleAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold">Save Config</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex h-40 items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : configs.length === 0 && !showAdd ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
                    <span className="material-icons-round text-5xl text-slate-200">settings_applications</span>
                    <h3 className="text-lg font-bold text-slate-700 mt-4">No Configurations</h3>
                    <p className="text-sm text-slate-400 mt-2">Add your first system configuration value.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {configs.map(config => (
                        <div key={config.key} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-slate-800 font-mono flex items-center gap-2">
                                    <span className="material-icons-round text-slate-400 text-[18px]">key</span>
                                    {config.key}
                                </h3>
                                {config.updated_at && (
                                    <span className="text-xs text-slate-400">
                                        {new Date(config.updated_at).toLocaleString()}
                                    </span>
                                )}
                            </div>

                            <div className="flex-1">
                                {editingKey === config.key ? (
                                    <textarea
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                                    />
                                ) : (
                                    <pre className="w-full min-h-[120px] max-h-64 overflow-auto px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-mono text-slate-600">
                                        {JSON.stringify(config.value, null, 2)}
                                    </pre>
                                )}
                            </div>

                            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                                {editingKey === config.key ? (
                                    <>
                                        <button onClick={() => setEditingKey(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">Cancel</button>
                                        <button onClick={() => handleSave(config.key)} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-blue-800">Save</button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => { setEditingKey(config.key); setEditValue(JSON.stringify(config.value, null, 2)); }}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100"
                                    >
                                        <span className="material-icons-round text-[14px]">edit</span>
                                        Edit
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
