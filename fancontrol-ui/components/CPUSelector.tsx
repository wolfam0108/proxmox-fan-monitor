import React, { useState, useEffect } from 'react';
import { scanCpuSensors, saveCpuSensor, CpuSensorInfo } from '../services/apiService';

interface CPUSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath?: string;
    onSave: (path: string) => void;
}

export const CPUSelector: React.FC<CPUSelectorProps> = ({
    isOpen,
    onClose,
    currentPath,
    onSave,
}) => {
    const [sensors, setSensors] = useState<CpuSensorInfo[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [recommended, setRecommended] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setError(null);
            setSelectedPath('');  // Reset selection on open

            scanCpuSensors()
                .then(res => {
                    setSensors(res.sensors || []);
                    setRecommended(res.recommended);
                    // Only set selection if already configured (editing)
                    if (currentPath) {
                        setSelectedPath(currentPath);
                    }
                    // Don't auto-select recommended - user must choose
                    setLoading(false);
                })
                .catch(e => {
                    setError('Ошибка сканирования датчиков');
                    setLoading(false);
                });
        }
    }, [isOpen, currentPath]);

    const handleSave = async () => {
        if (!selectedPath) return;

        setSaving(true);
        try {
            const result = await saveCpuSensor(selectedPath);

            if (result.success) {
                onSave(selectedPath);
                onClose();
            } else {
                setError(result.error || 'Ошибка сохранения');
            }
        } catch (e) {
            setError('Ошибка сохранения');
        }
        setSaving(false);
    };

    if (!isOpen) return null;

    // Group sensors by hwmon
    const groupedSensors: Record<string, CpuSensorInfo[]> = sensors.reduce((acc, sensor) => {
        const key = `${sensor.hwmon} (${sensor.name})`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(sensor);
        return acc;
    }, {} as Record<string, CpuSensorInfo[]>);

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                            <span className="text-cyan-400">🌡️</span>
                            Датчик температуры CPU
                        </h2>
                        <p className="text-slate-400 text-sm">Выберите датчик для мониторинга температуры процессора</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 gap-3">
                            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-slate-400">Сканирование датчиков...</span>
                        </div>
                    ) : error ? (
                        <div className="text-red-400 text-center py-12">{error}</div>
                    ) : sensors.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-slate-400 mb-2">Датчики температуры не найдены</div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(groupedSensors).map(([groupName, groupSensors]) => (
                                <div key={groupName}>
                                    <h3 className="text-slate-400 text-sm font-medium mb-2 flex items-center gap-2">
                                        <span className="text-cyan-400">📦</span>
                                        {groupName}
                                    </h3>
                                    <div className="space-y-1">
                                        {groupSensors.map(sensor => {
                                            const isSelected = selectedPath === sensor.path;
                                            const isRecommended = sensor.path === recommended;

                                            return (
                                                <div
                                                    key={sensor.path}
                                                    onClick={() => setSelectedPath(sensor.path)}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${isSelected
                                                        ? 'border-cyan-500 bg-cyan-900/20'
                                                        : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                                                        }`}
                                                >
                                                    {/* Radio */}
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected
                                                        ? 'border-cyan-500'
                                                        : 'border-slate-600'
                                                        }`}>
                                                        {isSelected && (
                                                            <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                                                        )}
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-white">{sensor.label}</span>
                                                            {isRecommended && (
                                                                <span className="px-1.5 py-0.5 text-xs rounded bg-cyan-900/50 text-cyan-400 border border-cyan-700">
                                                                    Рекомендуется
                                                                </span>
                                                            )}
                                                            {sensor.recommended && !isRecommended && (
                                                                <span className="px-1.5 py-0.5 text-xs rounded bg-slate-700 text-slate-400">
                                                                    CPU
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-slate-500 text-xs font-mono truncate">
                                                            {sensor.path}
                                                        </div>
                                                    </div>

                                                    {/* Temperature */}
                                                    <div className={`text-lg font-mono ${sensor.value > 80 ? 'text-red-400' :
                                                        sensor.value > 60 ? 'text-yellow-400' :
                                                            'text-green-400'
                                                        }`}>
                                                        {sensor.value.toFixed(1)}°C
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-700">
                    <div className="text-slate-500 text-sm">
                        {selectedPath && (
                            <>Выбран: <span className="font-mono text-cyan-400">{sensors.find(s => s.path === selectedPath)?.label || selectedPath}</span></>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading || !selectedPath}
                            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving && (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            )}
                            Сохранить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
