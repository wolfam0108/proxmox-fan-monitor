import React, { useState, useEffect } from 'react';
import { FanConfig } from '../types';
import { fetchConfig, saveConfig, restartService } from '../services/apiService';

interface SettingsPanelProps {
    onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = () => {
    const [config, setConfig] = useState<FanConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchConfig().then(c => {
            setConfig(c);
            setLoading(false);
        }).catch(e => {
            setMessage({ type: 'error', text: 'Failed to load config' });
            setLoading(false);
        });
    }, []);

    const handleSave = async (andRestart: boolean = false) => {
        if (!config) return;
        setSaving(true);
        setMessage(null);

        try {
            const res = await saveConfig(config);
            if (res.success) {
                if (andRestart) {
                    setMessage({ type: 'success', text: 'Конфиг сохранён. Перезапуск сервиса...' });
                    await restartService();
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    setMessage({ type: 'success', text: 'Конфиг сохранён. Требуется перезапуск для применения.' });
                }
            } else {
                setMessage({ type: 'error', text: res.error || 'Ошибка сохранения' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }
        setSaving(false);
    };

    const updateSystemTarget = (mode: string, value: number) => {
        if (!config) return;
        setConfig({
            ...config,
            system: {
                ...config.system,
                targets: { ...config.system.targets, [mode]: value }
            }
        });
    };

    const updateSystemThreshold = (mode: string, idx: number, value: number) => {
        if (!config) return;
        const newThresh = [...(config.system.thresholds[mode] || [0, 0, 0])];
        newThresh[idx] = value;
        setConfig({
            ...config,
            system: {
                ...config.system,
                thresholds: { ...config.system.thresholds, [mode]: newThresh }
            }
        });
    };

    const updateGpuTarget = (mode: string, value: number) => {
        if (!config) return;
        setConfig({
            ...config,
            gpu: {
                ...config.gpu,
                targets: { ...config.gpu.targets, [mode]: value }
            }
        });
    };

    const updateGpuThreshold = (mode: string, value: number) => {
        if (!config) return;
        const newThresh = [999, value, 999];
        setConfig({
            ...config,
            gpu: {
                ...config.gpu,
                thresholds: { ...config.gpu.thresholds, [mode]: newThresh }
            }
        });
    };

    if (loading) {
        return (
            <div className="text-slate-400 p-8 text-center flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                Загрузка конфигурации...
            </div>
        );
    }

    if (!config) {
        return <div className="text-red-400 p-8 text-center">Не удалось загрузить конфигурацию</div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {message && (
                <div className={`p-3 rounded-lg ${message.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-red-900/50 text-red-300 border border-red-700'}`}>
                    {message.text}
                </div>
            )}

            {/* System Fans Section */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">Системные вентиляторы</h3>
                <p className="text-slate-500 text-sm mb-4">Целевые обороты (RPM) для каждого режима работы</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {['1', '2', '3'].map(mode => (
                        <div key={mode} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <label className="block text-xs text-slate-400 mb-1">
                                Режим {mode} — {mode === '1' ? 'Тихий' : mode === '2' ? 'Стандарт' : 'Критический'}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={config.system.targets[mode] || 0}
                                    onChange={e => updateSystemTarget(mode, parseInt(e.target.value) || 0)}
                                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
                                />
                                <span className="text-slate-500 text-sm">RPM</span>
                            </div>
                        </div>
                    ))}
                </div>

                <h4 className="text-sm text-slate-300 font-medium mb-2">Пороги переключения режимов</h4>
                <p className="text-slate-500 text-xs mb-3">Режим активируется когда любой из датчиков превышает указанный порог</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['2', '3'].map(mode => (
                        <div key={mode} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <label className="block text-sm text-slate-300 mb-2">
                                Режим {mode} срабатывает при:
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {['CPU', 'GPU', 'HDD'].map((t, i) => (
                                    <div key={t}>
                                        <span className="text-xs text-slate-500 block mb-1">{t} &gt;</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={config.system.thresholds[mode]?.[i] || 0}
                                                onChange={e => updateSystemThreshold(mode, i, parseInt(e.target.value) || 0)}
                                                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                                            />
                                            <span className="text-slate-500 text-xs">°C</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* GPU Fans Section */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold text-green-400 mb-2">GPU вентиляторы</h3>
                <p className="text-slate-500 text-sm mb-4">Целевая скорость (%) для каждого режима. Mode 0 = автоуправление драйвером</p>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    {['0', '1', '2', '3', '4'].map(mode => (
                        <div key={mode} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <label className="block text-xs text-slate-400 mb-1">
                                Режим {mode} {mode === '0' ? '(Авто)' : ''}
                            </label>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    value={config.gpu.targets[mode] || 0}
                                    onChange={e => updateGpuTarget(mode, parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:border-green-500 focus:outline-none disabled:opacity-50"
                                    disabled={mode === '0'}
                                />
                                <span className="text-slate-500 text-xs">%</span>
                            </div>
                        </div>
                    ))}
                </div>

                <h4 className="text-sm text-slate-300 font-medium mb-2">Пороги температуры GPU</h4>
                <p className="text-slate-500 text-xs mb-3">Режим активируется когда температура GPU превышает порог</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['1', '2', '3', '4'].map(mode => (
                        <div key={mode} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <label className="block text-sm text-slate-300 mb-2">
                                Режим {mode} при GPU &gt;
                            </label>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    value={config.gpu.thresholds[mode]?.[1] || 0}
                                    onChange={e => updateGpuThreshold(mode, parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-200 focus:border-green-500 focus:outline-none"
                                />
                                <span className="text-slate-500 text-sm">°C</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-end items-center">
                <span className="text-slate-500 text-xs mr-auto">
                    Изменения в порогах требуют перезапуска сервиса
                </span>
                <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {saving && <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>}
                    Сохранить
                </button>
                <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    Сохранить и применить
                </button>
            </div>
        </div>
    );
};
