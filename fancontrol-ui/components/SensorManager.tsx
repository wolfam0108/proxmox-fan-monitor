import React, { useState, useEffect } from 'react';
import { SensorEditor } from './SensorEditor';

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
    suggested_preset: 'system' | 'accelerator' | 'storage';
}

interface ConfiguredSensor {
    id: string;
    name: string;
    type: 'hwmon' | 'nvidia' | 'drive';
    visual_preset: 'system' | 'accelerator' | 'storage';
    paths?: string[];
    gpu_index?: number;
    devices?: string[];
    current_value?: number | null;
}

interface SensorManagerProps {
    sensors: ConfiguredSensor[];
    onChange: (sensors: ConfiguredSensor[]) => void;
}

const PRESET_ICONS: Record<string, string> = {
    system: '🖥️',
    accelerator: '🎮',
    storage: '💾'
};

const PRESET_COLORS: Record<string, string> = {
    system: 'cyan',
    accelerator: 'green',
    storage: 'orange'
};

export const SensorManager: React.FC<SensorManagerProps> = ({
    sensors,
    onChange
}) => {
    const [showEditor, setShowEditor] = useState(false);
    const [editingSensor, setEditingSensor] = useState<ConfiguredSensor | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleAddSensor = () => {
        setEditingSensor(null);
        setShowEditor(true);
    };

    const handleEditSensor = (sensor: ConfiguredSensor) => {
        setEditingSensor(sensor);
        setShowEditor(true);
    };

    const handleDeleteSensor = async (sensorId: string) => {
        // Local delete only
        const newSensors = sensors.filter(s => s.id !== sensorId);
        onChange(newSensors);
    };

    const handleEditorSave = (sensor: ConfiguredSensor) => {
        let newSensors = [...sensors];
        const idx = newSensors.findIndex(s => s.id === (editingSensor?.id || sensor.id));

        if (idx !== -1) {
            // Update existing
            newSensors[idx] = { ...newSensors[idx], ...sensor };
        } else {
            // Add new
            newSensors.push(sensor);
        }

        onChange(newSensors);
        setShowEditor(false);
        setEditingSensor(null);
    };

    const getPresetColor = (preset: string) => {
        const colors: Record<string, string> = {
            system: 'border-cyan-600 bg-cyan-900/20',
            accelerator: 'border-green-600 bg-green-900/20',
            storage: 'border-orange-600 bg-orange-900/20'
        };
        return colors[preset] || colors.system;
    };

    const getTempColor = (temp: number | null | undefined) => {
        if (temp === null || temp === undefined) return 'text-slate-500';
        if (temp > 80) return 'text-red-400';
        if (temp > 60) return 'text-yellow-400';
        return 'text-green-400';
    };

    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
                        <span>🌡️</span>
                        Датчики температуры
                    </h3>
                    <p className="text-slate-500 text-sm">
                        {sensors.length > 0
                            ? `Настроено: ${sensors.length}`
                            : 'Не настроено'}
                    </p>
                </div>
                <button
                    onClick={handleAddSensor}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Добавить датчик
                </button>
            </div>

            {sensors.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-slate-700 rounded-lg">
                    <div className="text-3xl mb-2">🌡️</div>
                    <p>Датчики не настроены</p>
                    <p className="text-sm mt-1">Добавьте датчики для мониторинга температуры</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sensors.map(sensor => (
                        <div
                            key={sensor.id}
                            className={`p-4 rounded-lg border ${getPresetColor(sensor.visual_preset)} transition-all hover:border-opacity-80`}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">{PRESET_ICONS[sensor.visual_preset]}</span>
                                    <div>
                                        <div className="font-medium text-white">{sensor.name}</div>
                                        <div className="text-xs text-slate-500">
                                            {sensor.type === 'hwmon' && `${sensor.paths?.length || 0} датчик(ов)`}
                                            {sensor.type === 'nvidia' && 'NVIDIA GPU'}
                                            {sensor.type === 'drive' && `${sensor.devices?.length || 0} накопитель(ей)`}
                                        </div>
                                    </div>
                                </div>
                                <div className={`text-xl font-mono ${getTempColor(sensor.current_value)}`}>
                                    {sensor.current_value !== null && sensor.current_value !== undefined
                                        ? `${sensor.current_value.toFixed(1)}°`
                                        : '—'}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-3">
                                <button
                                    onClick={() => handleEditSensor(sensor)}
                                    className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-700 transition-colors"
                                    title="Редактировать"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handleDeleteSensor(sensor.id)}
                                    disabled={deleting === sensor.id}
                                    className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-900/30 transition-colors disabled:opacity-50"
                                    title="Удалить"
                                >
                                    {deleting === sensor.id ? (
                                        <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M18 6L6 18M6 6l12 12" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Sensor Editor Modal */}
            <SensorEditor
                isOpen={showEditor}
                onClose={() => { setShowEditor(false); setEditingSensor(null); }}
                onSave={handleEditorSave}
                editingSensor={editingSensor}
            />
        </div>
    );
};
