import React, { useState, useEffect } from 'react';
import { FanConfig, FanProfile, DriveInfo, FanPwmMapping, TempSource } from '../types';
import { fetchConfig, saveConfig, restartService, saveFanGroup } from '../services/apiService';
import { ProfileTable } from './ProfileTable';
import { ProfileChart } from './ProfileChart';

import { FanWizard } from './FanWizard';
import { GPUSelector } from './GPUSelector';
import { CPUSelector } from './CPUSelector';
import { SensorManager } from './SensorManager';
import { getThemeStyles } from '../theme';

interface SettingsPanelProps {
    onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = () => {
    const [config, setConfig] = useState<FanConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Drives state


    // Fan wizard state
    const [showFanWizard, setShowFanWizard] = useState(false);
    const [editingGroup, setEditingGroup] = useState<any | null>(null);

    // GPU selector state
    const [showGPUSelector, setShowGPUSelector] = useState(false);

    // CPU selector state
    const [showCPUSelector, setShowCPUSelector] = useState(false);

    // Sensors state
    const [sensors, setSensors] = useState<any[]>([]);

    useEffect(() => {
        Promise.all([
            fetchConfig(),
            fetch('/api/sensors').then(r => r.json())
        ]).then(([cfg, sensorsData]) => {
            setConfig(cfg);
            setSensors(sensorsData.sensors || []);
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
            // Ensure drives and sensors are included in config
            const configToSave = {
                ...config,
                ...config,
                sensors: sensors
            };

            const res = await saveConfig(configToSave);
            if (res.success) {
                if (andRestart) {
                    // Keep saving=true to maintain overlay during restart
                    setMessage({ type: 'success', text: 'Конфиг сохранён. Перезапуск сервиса...' });
                    try {
                        await restartService();
                    } catch (e) {
                        // Ignore restart errors - service is restarting
                    }
                    // Wait for backend to restart, then reload
                    setTimeout(() => window.location.reload(), 3000);
                    // Don't clear saving state - overlay stays until reload
                    return;
                } else {
                    setMessage({ type: 'success', text: 'Конфиг сохранён. Требуется перезапуск для применения.' });
                    setSaving(false);
                }
            } else {
                setMessage({ type: 'error', text: res.error || 'Ошибка сохранения' });
                setSaving(false);
            }
        } catch (e) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
            setSaving(false);
        }
    };

    const handleSystemProfilesChange = (profiles: FanProfile[]) => {
        if (!config) return;
        setConfig({
            ...config,
            system: {
                ...config.system,
                profiles,
            },
        });
    };

    const handleGpuProfilesChange = (profiles: FanProfile[]) => {
        if (!config) return;
        setConfig({
            ...config,
            gpu: {
                ...config.gpu,
                profiles,
            },
        });
    };

    const updateSystemTiming = (field: 'delay_up' | 'hold_time', value: number) => {
        if (!config) return;
        setConfig({
            ...config,
            system: {
                ...config.system,
                [field]: value,
            },
        });
    };

    const updateGpuTiming = (field: 'delay_up' | 'hold_time', value: number) => {
        if (!config) return;
        setConfig({
            ...config,
            gpu: {
                ...config.gpu,
                [field]: value,
            },
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
        <div className="space-y-6 animate-in fade-in duration-500 relative">
            {/* Saving Overlay */}
            {saving && (
                <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center z-[100]">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-center">
                            <p className="text-white text-lg font-medium">Сохранение конфигурации...</p>
                            <p className="text-slate-400 text-sm mt-1">Пожалуйста, подождите</p>
                        </div>
                    </div>
                </div>
            )}

            {message && (
                <div className={`p-3 rounded-lg ${message.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-red-900/50 text-red-300 border border-red-700'}`}>
                    {message.text}
                </div>
            )}

            {/* Sensors Section - unified sensors management */}
            <SensorManager
                sensors={sensors}
                onChange={(newSensors) => {
                    setSensors(newSensors);
                    if (config) {
                        setConfig({
                            ...config,
                            sensors: newSensors
                        } as any);
                    }
                }}
            />

            {/* System Fan Groups Section */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-cyan-400">Системные вентиляторы</h3>
                        <p className="text-slate-500 text-sm">Группы вентиляторов с профилями скорости</p>
                    </div>
                    <button
                        onClick={() => setShowFanWizard(true)}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        Добавить группу
                    </button>
                </div>

                {/* Fan Groups List */}
                {(!config.fan_groups || config.fan_groups.length === 0) ? (
                    <div className="text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-lg">
                        <div className="text-3xl mb-2">🌀</div>
                        <p>Нет групп вентиляторов</p>
                        <p className="text-sm mt-1">Нажмите "Добавить группу" для настройки</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {config.fan_groups.map((group, groupIndex) => {
                            const style = group.visual_style || (group.type === 'nvidia' ? 'green' : 'cyan');

                            // Use centralized theme helper
                            const colors = getThemeStyles(style);

                            // Enforce border color from theme
                            const borderClass = colors.border;

                            return (
                                <div key={group.id} className={`border ${borderClass} rounded-lg overflow-hidden transition-all`}>
                                    {/* Group Header */}
                                    <div className={`${colors.bg} px-4 py-3 flex items-center justify-between`}>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-3">
                                                <span className={`${colors.text} font-medium text-lg`}>{group.name}</span>
                                                {group.type === 'nvidia' && <span className="text-[10px] bg-green-900 text-green-300 px-1.5 rounded">GPU</span>}
                                                <span className="text-xs text-slate-500">
                                                    Триггеры: {group.temp_sources?.join(', ').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                Вентиляторы: {group.fans?.length ? group.fans.map(f => f.name || f.fan_id).join(', ') : 'нет'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-slate-400">Задержка:</span>
                                                <input
                                                    type="number"
                                                    value={group.delay_up}
                                                    onChange={(e) => {
                                                        const newGroups = [...(config.fan_groups || [])];
                                                        const idx = newGroups.findIndex(g => g.id === group.id);
                                                        if (idx !== -1) {
                                                            newGroups[idx] = { ...newGroups[idx], delay_up: parseInt(e.target.value) || 5 };
                                                            setConfig({ ...config, fan_groups: newGroups });
                                                        }
                                                    }}
                                                    className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 text-sm"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-slate-400">Удержание:</span>
                                                <input
                                                    type="number"
                                                    value={group.hold_time}
                                                    onChange={(e) => {
                                                        const newGroups = [...(config.fan_groups || [])];
                                                        const idx = newGroups.findIndex(g => g.id === group.id);
                                                        if (idx !== -1) {
                                                            newGroups[idx] = { ...newGroups[idx], hold_time: parseInt(e.target.value) || 30 };
                                                            setConfig({ ...config, fan_groups: newGroups });
                                                        }
                                                    }}
                                                    className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 text-sm"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 border-l border-slate-600 pl-4">
                                                <button
                                                    onClick={() => {
                                                        setEditingGroup(group);
                                                        setShowFanWizard(true);
                                                    }}
                                                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                                                >
                                                    ✎ Изменить
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Удалить группу "${group.name}"?`)) {
                                                            const newGroups = (config.fan_groups || []).filter(g => g.id !== group.id);
                                                            setConfig({ ...config, fan_groups: newGroups });
                                                        }
                                                    }}
                                                    className="text-red-400 hover:text-red-300 text-sm"
                                                >
                                                    ✕ Удалить
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Group Chart + Table */}
                                    <div className="p-4">
                                        <div className="flex flex-col lg:flex-row gap-4">
                                            <div className="lg:w-2/5">
                                                <ProfileChart profiles={group.profiles} tempSources={group.temp_sources || []} />
                                            </div>
                                            <div className="lg:w-3/5">
                                                <ProfileTable
                                                    profiles={group.profiles}
                                                    type={group.type === 'nvidia' ? 'gpu' : 'system'}
                                                    tempSources={group.temp_sources}
                                                    onChange={(newProfiles) => {
                                                        const newGroups = [...(config.fan_groups || [])];
                                                        const idx = newGroups.findIndex(g => g.id === group.id);
                                                        if (idx !== -1) {
                                                            newGroups[idx] = { ...newGroups[idx], profiles: newProfiles };
                                                            setConfig({ ...config, fan_groups: newGroups });
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>





            {/* Action Buttons */}
            <div className="flex flex-wrap gap-4 justify-end items-center">
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



            {/* Fan Wizard Modal */}
            {showFanWizard && (() => {
                // Collect all used fan_input paths from all groups EXCLUDING the one being edited
                const usedFanIds = (config.fan_groups || [])
                    .filter(g => !editingGroup || g.id !== editingGroup.id)
                    .flatMap(g => (g.fans || []).map(f => f.fan_id)); // Use fan_id, not fan_input for unified

                return (
                    <FanWizard
                        sensors={sensors}
                        usedFanIds={usedFanIds}
                        existingGroup={editingGroup}
                        onComplete={(groupName, mappings, tempSources, visualStyle) => {
                            let newGroups = [...(config.fan_groups || [])];

                            if (editingGroup) {
                                // Update existing
                                const idx = newGroups.findIndex(g => g.id === editingGroup.id);
                                if (idx !== -1) {
                                    newGroups[idx] = {
                                        ...newGroups[idx],
                                        name: groupName,
                                        temp_sources: tempSources,
                                        fans: mappings,
                                        visual_style: visualStyle,
                                        // Keep type from editingGroup or derive? 
                                        // FanWizard handles type in mappings, but group type?
                                        // Group type is 'system' or 'nvidia'. 
                                        // If mixed? Our backend plans to support unified. 
                                        // Let's assume 'system' is generic or check mappings.
                                        // Actually backend `server.py` and `types.ts` defines group type. 
                                        // For now, if any fan is nvidia, maybe type nvidia? Or just 'combined'?
                                        // Let's keep it simple: generic groups are 'system' (custom), 
                                        // or we might need a new type 'unified'?
                                        // Existing implementation used 'system' and 'nvidia'. 
                                        // Let's rely on the fact that we are Unifying.
                                        // The backend logic I wrote/planned accepts mixed types.
                                    };
                                }
                                setMessage({ type: 'success', text: `Группа "${groupName}" обновлена. Нажмите "Сохранить и применить".` });
                            } else {
                                // Create new
                                // Generate ID from name
                                let groupId = groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                                if (!groupId) groupId = `group-${Date.now()}`;

                                const newGroup = {
                                    id: groupId,
                                    name: groupName,
                                    type: 'system' as const, // Default to system/custom
                                    temp_sources: tempSources,
                                    fans: mappings,
                                    profiles: [
                                        { name: 'Тихий', target: 800, thresholds: {} },
                                        { name: 'Стандарт', target: 1200, thresholds: {} },
                                        { name: 'Максимум', target: 2000, thresholds: {} }
                                    ],
                                    delay_up: 5,
                                    hold_time: 30,
                                    visual_style: visualStyle
                                };
                                newGroups.push(newGroup);
                                setMessage({ type: 'success', text: `Группа "${groupName}" добавлена. Нажмите "Сохранить и применить".` });
                            }

                            // Update local config
                            setConfig({
                                ...config,
                                fan_groups: newGroups
                            });

                            setShowFanWizard(false);
                            setEditingGroup(null);
                        }}
                        onCancel={() => {
                            setShowFanWizard(false);
                            setEditingGroup(null);
                        }}
                    />
                );
            })()}

            {/* GPU Selector Modal */}
            <GPUSelector
                isOpen={showGPUSelector}
                onClose={() => setShowGPUSelector(false)}
                onSave={() => {
                    // Reload config to get the new GPU group
                    fetchConfig().then(cfg => {
                        setConfig(cfg);
                        setMessage({ type: 'success', text: 'GPU группа добавлена. Нажмите "Сохранить и применить" для активации.' });
                    });
                    setShowGPUSelector(false);
                }}
            />

            {/* CPU Selector Modal */}
            <CPUSelector
                isOpen={showCPUSelector}
                onClose={() => setShowCPUSelector(false)}
                currentPath={(config as any)?.cpu_sensor_path}
                onSave={(path) => {
                    // Update local config
                    setConfig({ ...config!, cpu_sensor_path: path } as any);
                    setMessage({ type: 'success', text: 'Датчик CPU сохранён. Нажмите "Сохранить и применить" для активации.' });
                }}
            />
        </div>
    );
};
