import React, { useState, useEffect } from 'react';

// Types
interface SensorSource {
    source: string;
    path?: string;
    device?: string;
    gpu_index?: number;
    label: string;
    value: number;
    chip?: string;
    hwmon?: string;
    serial?: string;
    bus_id?: string;
    details?: any; // Drive details
    suggested_preset: 'system' | 'accelerator' | 'storage';
    _type?: string; // For internal grouping
}

interface ConfiguredSensor {
    id: string;
    name: string;
    type: 'hwmon' | 'nvidia' | 'drive';
    visual_preset: 'system' | 'accelerator' | 'storage';
    paths?: string[];
    gpu_index?: number;
    devices?: string[];
}

interface SensorEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (sensor: any) => void;
    editingSensor: ConfiguredSensor | null;
}

const PRESETS = [
    { id: 'system', name: 'Системный', icon: '🖥️', color: 'cyan' },
    { id: 'accelerator', name: 'Ускоритель', icon: '🎮', color: 'green' },
    { id: 'storage', name: 'Накопитель', icon: '💾', color: 'orange' }
];

export const SensorEditor: React.FC<SensorEditorProps> = ({
    isOpen,
    onClose,
    onSave,
    editingSensor
}) => {
    // Single view state, no steps
    const [name, setName] = useState('');
    const [preset, setPreset] = useState<'system' | 'accelerator' | 'storage'>('system');
    const [filterType, setFilterType] = useState<'all' | 'hwmon' | 'nvidia' | 'drive'>('all');

    // Data state
    const [sources, setSources] = useState<{ hwmon: SensorSource[], nvidia: SensorSource[], drives: SensorSource[] }>({ hwmon: [], nvidia: [], drives: [] });
    const [selectedSources, setSelectedSources] = useState<SensorSource[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            if (editingSensor) {
                setName(editingSensor.name);
                setPreset(editingSensor.visual_preset);
                // Load current sources - will be matched after scan
            } else {
                setName('');
                setPreset('system');
                setSelectedSources([]);
            }
            // Reset filter
            setFilterType('all');
            setError(null);

            // Scan sources
            setLoading(true);
            fetch('/api/sensors/scan')
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setSources(data.sources);

                        // If editing, restore selected sources
                        if (editingSensor) {
                            const selected: SensorSource[] = [];
                            if (editingSensor.type === 'hwmon' && editingSensor.paths) {
                                for (const path of editingSensor.paths) {
                                    const found = data.sources.hwmon.find((s: SensorSource) => s.path === path);
                                    if (found) selected.push(found);
                                }
                            } else if (editingSensor.type === 'nvidia') {
                                const found = data.sources.nvidia.find((s: SensorSource) => s.gpu_index === editingSensor.gpu_index);
                                if (found) selected.push(found);
                            } else if (editingSensor.type === 'drive' && editingSensor.devices) {
                                for (const device of editingSensor.devices) {
                                    const found = data.sources.drives.find((s: SensorSource) => s.device === device);
                                    if (found) selected.push(found);
                                }
                            }
                            setSelectedSources(selected);
                        }
                    }
                    setLoading(false);
                })
                .catch(() => {
                    setError('Ошибка сканирования датчиков');
                    setLoading(false);
                });
        }
    }, [isOpen, editingSensor]);

    const handleToggleSource = (source: SensorSource) => {
        setSelectedSources(prev => {
            const exists = prev.some(s =>
                (s.path && s.path === source.path) ||
                (s.device && s.device === source.device) ||
                (s.gpu_index !== undefined && s.gpu_index === source.gpu_index)
            );

            if (exists) {
                return prev.filter(s =>
                    !((s.path && s.path === source.path) ||
                        (s.device && s.device === source.device) ||
                        (s.gpu_index !== undefined && s.gpu_index === source.gpu_index))
                );
            } else {
                return [...prev, source];
            }
        });
    };

    const isSourceSelected = (source: SensorSource) => {
        return selectedSources.some(s =>
            (s.path && s.path === source.path) ||
            (s.device && s.device === source.device) ||
            (s.gpu_index !== undefined && s.gpu_index === source.gpu_index)
        );
    };

    const handleSave = async () => {
        if (!name.trim() || selectedSources.length === 0) return;

        setSaving(true);
        setError(null);

        // Determine type from first selected source
        const firstSource = selectedSources[0];
        let sensorConfig: any = {
            id: editingSensor?.id || name.toLowerCase().replace(/\s+/g, '_'),
            name: name.trim(),
            visual_preset: preset
        };

        if (firstSource.source === 'hwmon') {
            sensorConfig.type = 'hwmon';
            sensorConfig.paths = selectedSources.filter(s => s.path).map(s => s.path);
        } else if (firstSource.source === 'nvidia') {
            sensorConfig.type = 'nvidia';
            sensorConfig.gpu_index = firstSource.gpu_index;
        } else if (firstSource.source === 'drive') {
            sensorConfig.type = 'drive';
            sensorConfig.devices = selectedSources.filter(s => s.device).map(s => s.device!);

            // Save cached info
            const cachedInfo: Record<string, any> = {};
            selectedSources.forEach(s => {
                if (s.device && s.details) {
                    cachedInfo[s.device] = s.details;
                }
            });
            sensorConfig.cached_info = cachedInfo;
        }

        onSave(sensorConfig);
        setSaving(false);
    };

    const getTempColor = (temp: number) => {
        if (temp > 80) return 'text-red-400';
        if (temp > 60) return 'text-yellow-400';
        return 'text-green-400';
    };

    if (!isOpen) return null;

    // Combine all sources into one list
    const allSources = [
        ...sources.hwmon.map(s => ({ ...s, _type: 'hwmon', _label: 'Системный' })),
        ...sources.nvidia.map(s => ({ ...s, _type: 'nvidia', _label: 'GPU' })),
        ...sources.drives.map(s => ({ ...s, _type: 'drive', _label: 'Диск' }))
    ];

    // Filter and Sort
    const filteredSources = allSources
        .filter(s => filterType === 'all' || s._type === filterType)
        .sort((a, b) => {
            const typeOrder = { hwmon: 0, nvidia: 1, drive: 2 };
            return (typeOrder[a._type as keyof typeof typeOrder] || 0) - (typeOrder[b._type as keyof typeof typeOrder] || 0);
        });

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #1e293b;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #475569;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #64748b;
                }
            `}</style>
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-5xl w-full h-[calc(100vh-40px)] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <span className="text-cyan-400">🌡️</span>
                        {editingSensor ? 'Редактировать датчик' : 'Добавить датчик'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors">
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 space-y-6 flex flex-col">
                    {/* 1. Name Input */}
                    <div>
                        <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Название</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Например: Процессор"
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                    </div>

                    {/* 2. Compact Type Selector */}
                    <div>
                        <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Визуальный тип</label>
                        <div className="flex gap-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setPreset(p.id as any)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border transition-all ${preset === p.id
                                        ? `border-${p.color}-500 bg-${p.color}-900/30 text-white`
                                        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                                        }`}
                                >
                                    <span className="text-xl">{p.icon}</span>
                                    <span className="text-sm font-medium">{p.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3. Unified Source List */}
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-slate-400 text-xs uppercase font-bold">Источник данных</label>

                            {/* Filter Buttons */}
                            <div className="flex gap-1">
                                {[
                                    { id: 'all', label: 'Все' },
                                    { id: 'hwmon', label: 'Системные' },
                                    { id: 'nvidia', label: 'Ускорители' },
                                    { id: 'drive', label: 'Накопители' }
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFilterType(f.id as any)}
                                        className={`px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors ${filterType === f.id
                                            ? 'bg-slate-700 text-white border-slate-500'
                                            : 'text-slate-500 border-transparent hover:text-slate-300'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border border-slate-700 rounded-lg bg-slate-800/30 overflow-hidden flex flex-col flex-1">
                            {loading ? (
                                <div className="flex-1 flex items-center justify-center gap-3 text-slate-400">
                                    <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                                    Сканирование...
                                </div>
                            ) : error ? (
                                <div className="flex-1 flex items-center justify-center text-red-400">{error}</div>
                            ) : (
                                <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
                                    {['hwmon', 'nvidia', 'drive'].map(groupType => {
                                        // Skip if filter is set and doesn't match
                                        if (filterType !== 'all' && filterType !== groupType) return null;

                                        // Filter sources for this group
                                        const groupSources = allSources.filter(s => s._type === groupType);
                                        if (groupSources.length === 0) return null;

                                        const groupTitle = groupType === 'hwmon' ? 'Системные' : groupType === 'nvidia' ? 'Ускорители' : 'Накопители';
                                        const GroupIcon = groupType === 'hwmon' ? '🖥️' : groupType === 'nvidia' ? '🎮' : '💾';

                                        return (
                                            <div key={groupType}>
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 px-1 flex items-center gap-2 mt-2">
                                                    <span>{GroupIcon}</span> {groupTitle}
                                                </div>
                                                <div className="space-y-1">
                                                    {groupSources.map((source, i) => {
                                                        const selected = isSourceSelected(source);

                                                        // Render details line based on type
                                                        let detailsLine = '';
                                                        if (source._type === 'drive' && source.details) {
                                                            const d = source.details;
                                                            detailsLine = `${source.device} • ${d.size} • ${d.form_factor} • ${d.interface}`;
                                                        } else if (source._type === 'hwmon') {
                                                            detailsLine = `${source.chip || ''} • ${source.hwmon || ''}`;
                                                        } else if (source._type === 'nvidia') {
                                                            detailsLine = `GPU #${source.gpu_index} • ${source.bus_id || ''}`;
                                                        }

                                                        return (
                                                            <div
                                                                key={`${source.source}-${source.path || source.device || source.gpu_index || i}`}
                                                                onClick={() => handleToggleSource(source)}
                                                                className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-all ${selected
                                                                    ? 'border-cyan-500 bg-cyan-900/20'
                                                                    : 'border-transparent hover:bg-slate-800'
                                                                    }`}
                                                            >
                                                                {/* Checkbox */}
                                                                <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${selected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-600'
                                                                    }`}>
                                                                    {selected && (
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                                                                            <path d="M20 6L9 17l-5-5" />
                                                                        </svg>
                                                                    )}
                                                                </div>

                                                                {/* Info */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-slate-200 text-sm font-medium truncate">
                                                                            {source.label || source.device || 'Unknown'}
                                                                        </span>
                                                                    </div>
                                                                    {/* Details Line */}
                                                                    <div className="text-slate-500 text-xs truncate font-mono mt-0.5">
                                                                        {detailsLine}
                                                                    </div>
                                                                </div>

                                                                {/* Value */}
                                                                <div className={`font-mono text-sm ${getTempColor(source.value)} whitespace-nowrap`}>
                                                                    {source.value?.toFixed(0) || '-'}°C
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Empty state if nothing found matching filter */}
                                    {allSources.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                            <span className="text-xl opacity-50">🔍</span>
                                            <span className="text-sm mt-1">Нет доступных датчиков</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 text-right">
                        Выбрано: <span className="text-slate-300">{selectedSources.length}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !name.trim() || selectedSources.length === 0}
                        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
};
