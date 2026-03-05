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

    // NOTE: 财务设置面板状态，对应 system_config 中的 finance_goal 和 finance_display
    const [financeGoal, setFinanceGoal] = useState<string>('');
    const [financeDisplay, setFinanceDisplay] = useState<boolean>(true);
    const [savingFinance, setSavingFinance] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            const data = await SuperAdminService.getConfig();
            setConfigs(data);
            // NOTE: 同时加载财务配置，点附在现有配置加载逻辑中
            const goalCfg = data.find((c: { key: string }) => c.key === 'finance_goal');
            const displayCfg = data.find((c: { key: string }) => c.key === 'finance_display');
            if (goalCfg?.value?.amount != null) setFinanceGoal(String(goalCfg.value.amount));
            if (displayCfg?.value?.enabled != null) setFinanceDisplay(Boolean(displayCfg.value.enabled));
        } catch (error) {
            console.error('Failed to load configs', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    // NOTE: 保存财务配置：将 finance_goal 和 finance_display 分别写入 system_config
    const handleSaveFinance = async () => {
        setSavingFinance(true);
        try {
            const amount = parseFloat(financeGoal) || 0;
            await SuperAdminService.updateConfig('finance_goal', { amount });
            await SuperAdminService.updateConfig('finance_display', { enabled: financeDisplay });
            await loadConfig();
        } catch (err) {
            console.error('Failed to save finance config', err);
            alert('Failed to save finance settings');
        } finally {
            setSavingFinance(false);
        }
    };

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
            {/* ── 财务设置面板 ── */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <span className="material-icons-round text-emerald-600 text-xl">payments</span>
                    <h2 className="text-base font-bold text-slate-800">财务统计设置</h2>
                    <span className="ml-auto text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Finance</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">月度业绩目标 (RM)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">RM</span>
                            <input
                                type="number"
                                value={financeGoal}
                                onChange={e => setFinanceGoal(e.target.value)}
                                placeholder="例如：10000"
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">设置后，前端 App 控制台将显示本月进度条。</p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
                            <div>
                                <p className="text-xs font-bold text-slate-700">在 App 端显示财务数字</p>
                                <p className="text-[10px] text-slate-400">关闭后，Admin 控制台将不显示今日/当月成交金额。</p>
                            </div>
                            <button
                                onClick={() => setFinanceDisplay(!financeDisplay)}
                                className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ml-4 ${financeDisplay ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                role="switch"
                                aria-checked={financeDisplay}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${financeDisplay ? 'translate-x-6' : ''}`} />
                            </button>
                        </div>
                        <button
                            onClick={handleSaveFinance}
                            disabled={savingFinance}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {savingFinance ? (
                                <><span className="material-icons-round text-sm animate-spin">autorenew</span>保存中...</>
                            ) : (
                                <><span className="material-icons-round text-sm">save</span>保存财务设置</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

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
