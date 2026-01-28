import React, { useState, useEffect } from 'react';
import { scanGpus, testGpuFan, saveGpuGroup, GpuInfo, GpuScanResult } from '../services/apiService';

interface GPUSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

export const GPUSelector: React.FC<GPUSelectorProps> = ({
    isOpen,
    onClose,
    onSave,
}) => {
    const [gpus, setGpus] = useState<GpuInfo[]>([]);
    const [selectedGpu, setSelectedGpu] = useState<GpuInfo | null>(null);
    const [selectedFans, setSelectedFans] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setError(null);

            scanGpus()
                .then(res => {
                    setGpus(res.gpus || []);
                    // Auto-select first GPU and all its fans
                    if (res.gpus.length > 0) {
                        const gpu = res.gpus[0];
                        setSelectedGpu(gpu);
                        setSelectedFans(new Set(gpu.fans));
                    }
                    setLoading(false);
                })
                .catch(e => {
                    setError('Ошибка сканирования GPU');
                    setLoading(false);
                });
        }
    }, [isOpen]);

    const toggleFan = (fanIndex: number) => {
        const newSet = new Set(selectedFans);
        if (newSet.has(fanIndex)) {
            newSet.delete(fanIndex);
        } else {
            newSet.add(fanIndex);
        }
        setSelectedFans(newSet);
    };

    const handleTest = async (fanIndex: number) => {
        if (!selectedGpu) return;
        setTesting(fanIndex);

        try {
            await testGpuFan(fanIndex, 50, selectedGpu.index, selectedGpu.display);
            // Let the fan spin for a moment, then reset
            setTimeout(async () => {
                await testGpuFan(fanIndex, 0, selectedGpu.index, selectedGpu.display);
                setTesting(null);
            }, 2000);
        } catch (e) {
            setTesting(null);
        }
    };

    const handleSave = async () => {
        if (!selectedGpu || selectedFans.size === 0) return;

        setSaving(true);
        try {
            const result = await saveGpuGroup({
                name: 'GPU',
                display: selectedGpu.display,
                gpu_index: selectedGpu.index,
                fans: [...selectedFans].sort((a, b) => a - b)
            });

            if (result.success) {
                onSave();
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

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                            <span className="text-green-400">🎮</span>
                            Настройка NVIDIA GPU
                        </h2>
                        <p className="text-slate-400 text-sm">Выберите GPU и вентиляторы для управления</p>
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
                            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-slate-400">Сканирование NVIDIA GPU...</span>
                        </div>
                    ) : error ? (
                        <div className="text-red-400 text-center py-12">{error}</div>
                    ) : gpus.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-slate-400 mb-2">NVIDIA GPU не найден</div>
                            <p className="text-slate-500 text-sm">Убедитесь, что установлены драйверы NVIDIA и nvidia-settings</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* GPU Selection */}
                            <div>
                                <h3 className="text-slate-400 text-sm font-medium mb-3">Обнаруженные GPU</h3>
                                <div className="space-y-2">
                                    {gpus.map(gpu => (
                                        <div
                                            key={gpu.uuid}
                                            onClick={() => {
                                                setSelectedGpu(gpu);
                                                setSelectedFans(new Set(gpu.fans));
                                            }}
                                            className={`flex items-center gap-4 p-4 rounded-lg border transition-all cursor-pointer ${selectedGpu?.uuid === gpu.uuid
                                                ? 'border-green-500 bg-green-900/20'
                                                : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                                                }`}
                                        >
                                            {/* Radio */}
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedGpu?.uuid === gpu.uuid
                                                ? 'border-green-500'
                                                : 'border-slate-600'
                                                }`}>
                                                {selectedGpu?.uuid === gpu.uuid && (
                                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1">
                                                <div className="font-medium text-white">{gpu.name}</div>
                                                <div className="text-slate-500 text-sm">
                                                    GPU {gpu.index} • {gpu.fan_count} вентилятор(ов) • Display {gpu.display}
                                                </div>
                                            </div>

                                            {/* Temperature */}
                                            <div className={`text-lg font-mono ${gpu.temperature > 80 ? 'text-red-400' :
                                                gpu.temperature > 60 ? 'text-yellow-400' :
                                                    'text-green-400'
                                                }`}>
                                                {gpu.temperature}°C
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Fan Selection */}
                            {selectedGpu && selectedGpu.fans.length > 0 && (
                                <div>
                                    <h3 className="text-slate-400 text-sm font-medium mb-3">Вентиляторы GPU</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {selectedGpu.fans.map(fanIndex => {
                                            const isSelected = selectedFans.has(fanIndex);
                                            const isTesting = testing === fanIndex;

                                            return (
                                                <div
                                                    key={fanIndex}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${isSelected
                                                        ? 'border-green-500 bg-green-900/20'
                                                        : 'border-slate-700 bg-slate-800/50'
                                                        }`}
                                                >
                                                    {/* Checkbox */}
                                                    <div
                                                        onClick={() => toggleFan(fanIndex)}
                                                        className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${isSelected
                                                            ? 'border-green-500 bg-green-500'
                                                            : 'border-slate-600 hover:border-slate-500'
                                                            }`}
                                                    >
                                                        {isSelected && (
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                                                <path d="M20 6L9 17l-5-5" />
                                                            </svg>
                                                        )}
                                                    </div>

                                                    {/* Fan info */}
                                                    <div className="flex-1">
                                                        <span className="text-white font-medium">Вентилятор {fanIndex + 1}</span>
                                                        <span className="text-slate-500 text-sm ml-2">[fan:{fanIndex}]</span>
                                                    </div>

                                                    {/* Test button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleTest(fanIndex);
                                                        }}
                                                        disabled={isTesting}
                                                        className={`px-2 py-1 text-xs rounded transition-colors ${isTesting
                                                            ? 'bg-yellow-600 text-white'
                                                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                            }`}
                                                    >
                                                        {isTesting ? (
                                                            <span className="flex items-center gap-1">
                                                                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                                                                Тест...
                                                            </span>
                                                        ) : (
                                                            'Тест'
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-slate-500 text-xs mt-2">
                                        Нажмите «Тест» чтобы раскрутить вентилятор до 50% на 2 секунды
                                    </p>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-700">
                    <div className="text-slate-500 text-sm">
                        {selectedGpu && selectedFans.size > 0 && (
                            <>Будет добавлена группа GPU с {selectedFans.size} вентилятором(ами)</>
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
                            disabled={saving || loading || !selectedGpu || selectedFans.size === 0}
                            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving && (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            )}
                            Добавить GPU
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
