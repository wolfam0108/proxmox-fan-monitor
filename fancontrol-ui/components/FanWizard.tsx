import React, { useState, useEffect } from 'react';
import { AllocatableFan, HwmonPwm, FanPwmMapping, TempSource, SensorData } from '../types';
import { scanFans, testPwm } from '../services/apiService';
import { Wind, Zap } from './Icons';

interface FanWizardProps {
    onComplete: (groupName: string, mappings: any[], tempSources: TempSource[]) => void;
    onCancel: () => void;
    usedFanIds?: string[];  // List of already-used fan ids
    sensors: SensorData[];
    existingGroup?: any; // For editing mode (optional)
}

interface LinkedPair {
    fan: AllocatableFan;
    pwm?: HwmonPwm;
    name: string;
}

export const FanWizard: React.FC<FanWizardProps> = ({ onComplete, onCancel, usedFanIds = [], sensors, existingGroup }) => {
    const [step, setStep] = useState<'scan' | 'link' | 'configure'>('scan');
    const [scannedFans, setScannedFans] = useState<AllocatableFan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Linking state
    const [linkedPairs, setLinkedPairs] = useState<LinkedPair[]>([]);
    const [selectedFan, setSelectedFan] = useState<AllocatableFan | null>(null);
    const [testingPwm, setTestingPwm] = useState<string | null>(null);

    // Group configuration
    const [groupName, setGroupName] = useState('New Group');
    const [tempSources, setTempSources] = useState<TempSource[]>([]);
    const [visualStyle, setVisualStyle] = useState<'cyan' | 'purple' | 'orange'>('cyan');

    // Initial scan
    useEffect(() => {
        scanFans().then(result => {
            setScannedFans(result.fans);
            setLoading(false);
            if (existingGroup) {
                setGroupName(existingGroup.name);
                setTempSources(existingGroup.temp_sources || []);
                if (existingGroup.visual_style) {
                    setVisualStyle(existingGroup.visual_style as any);
                }

                const restoredPairs: LinkedPair[] = [];
                existingGroup.fans.forEach((mapping: any) => {
                    let fan: AllocatableFan | undefined;
                    if (mapping.type === 'nvidia' || mapping.gpu_index !== undefined) {
                        fan = result.fans.find(f =>
                            f.type === 'nvidia' &&
                            f.gpu_index === mapping.gpu_index &&
                            f.fan_index === mapping.fan_index
                        );
                    } else {
                        fan = result.fans.find(f => f.id === mapping.fan_id);
                    }

                    if (fan) {
                        let pwm: HwmonPwm | undefined;
                        if (fan.type === 'system' && mapping.pwm_path && fan.available_pwms) {
                            pwm = fan.available_pwms.find(p => p.path === mapping.pwm_path);
                            if (!pwm) {
                                pwm = {
                                    id: 'pwm?',
                                    path: mapping.pwm_path,
                                    value: 0,
                                    controllable: true,
                                    hwmon: 'unknown'
                                } as any;
                            }
                        }
                        restoredPairs.push({
                            fan: fan,
                            pwm: pwm,
                            name: mapping.name
                        });
                    }
                });
                if (restoredPairs.length > 0) setLinkedPairs(restoredPairs);
                setStep('link');
            } else if (result.fans.length > 0) {
                setStep('link');
            }
        }).catch(e => {
            setError('Scan error: ' + e.message);
            setLoading(false);
        });
    }, []);



    // Filter out already linked items and items used in other groups
    const availableFans = scannedFans.filter(f =>
        !linkedPairs.some(p => p.fan.id === f.id) &&
        !usedFanIds.includes(f.id)
    );

    // Available PWMs depend on the selected fan (logic: same chip)
    const availablePwms = selectedFan?.type === 'system' && selectedFan.available_pwms
        ? selectedFan.available_pwms.filter(p => p.controllable)
        : [];

    const handleTestPwm = async (pwm: HwmonPwm, value: number) => {
        setTestingPwm(pwm.path);
        await testPwm(pwm.path, value);
        setTimeout(() => setTestingPwm(null), 1000);
    };

    const handleSelectFan = (fan: AllocatableFan) => {
        setSelectedFan(fan);
    };

    const handleLinkToPwm = (pwm: HwmonPwm) => {
        if (!selectedFan) return;

        setLinkedPairs(prev => [...prev, {
            fan: selectedFan,
            pwm: pwm,
            name: selectedFan.name
        }]);
        setSelectedFan(null);
    };

    const handleAddGpuFan = (fan: AllocatableFan) => {
        setLinkedPairs(prev => [...prev, {
            fan: fan,
            name: fan.name
        }]);
        setSelectedFan(null);
    }

    const handleUnlink = (index: number) => {
        setLinkedPairs(prev => prev.filter((_, i) => i !== index));
    };

    const handleComplete = () => {
        const mappings = linkedPairs.map(pair => {
            if (pair.fan.type === 'nvidia') {
                return {
                    fan_id: pair.fan.id,
                    name: pair.name,
                    type: 'nvidia',
                    gpu_index: pair.fan.gpu_index,
                    fan_index: pair.fan.fan_index,
                    display: pair.fan.display
                };
            } else {
                return {
                    fan_id: pair.fan.id,
                    name: pair.name,
                    type: 'system',
                    fan_input: pair.fan.input_path,
                    pwm_path: pair.pwm?.path
                };
            }
        });
        onComplete(groupName, mappings, tempSources, visualStyle);
    };

    const toggleTempSource = (source: TempSource) => {
        setTempSources(prev =>
            prev.includes(source)
                ? prev.filter(s => s !== source)
                : [...prev, source]
        );
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 rounded-xl p-8 text-center">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-400">Сканирование вентиляторов...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 rounded-xl p-8 text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={onCancel} className="px-4 py-2 bg-slate-700 rounded-lg">Закрыть</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-100">
                            {step === 'link' ? 'Связывание вентиляторов' : 'Настройка группы'}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {step === 'link'
                                ? 'Нажмите на вентилятор, затем на PWM для связывания'
                                : 'Укажите имя группы и триггеры температур'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {step === 'link' && linkedPairs.length > 0 && (
                            <button
                                onClick={() => setStep('configure')}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm"
                            >
                                Далее →
                            </button>
                        )}
                        <button onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
                            Отмена
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {step === 'link' && (
                        <div className="space-y-4">
                            {/* Two columns: Fans and PWMs/Actions */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Fans Column */}
                                <div>
                                    <h3 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                        <Wind size={16} /> Доступные вентиляторы
                                    </h3>
                                    <div className="space-y-2 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {availableFans.map(fan => (
                                            <div
                                                key={fan.id}
                                                onClick={() => handleSelectFan(fan)}
                                                className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedFan?.id === fan.id
                                                    ? 'bg-cyan-600/20 border-cyan-500'
                                                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-white">{fan.name}</span>
                                                            {fan.type === 'nvidia' && (
                                                                <span className="text-[10px] bg-green-900 text-green-300 px-1 rounded">GPU</span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-slate-500">{fan.id}</span>
                                                    </div>
                                                    <span className={`font-mono text-lg ${fan.rpm > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                                        {fan.rpm} RPM
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {availableFans.length === 0 && (
                                            <p className="text-slate-500 text-center py-4">Нет доступных вентиляторов</p>
                                        )}
                                    </div>
                                </div>

                                {/* Configuration Column */}
                                <div>
                                    <h3 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                        <Zap size={16} /> Настройка подключения
                                    </h3>
                                    <div className="bg-slate-800/50 rounded-lg p-4 h-[400px] border border-slate-700/50">
                                        {!selectedFan ? (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                                <Wind size={48} className="mb-4 opacity-20" />
                                                <p>Выберите вентилятор слева</p>
                                            </div>
                                        ) : selectedFan.type === 'nvidia' ? (
                                            <div className="h-full flex flex-col items-center justify-center space-y-4">
                                                <div className="text-center">
                                                    <div className="inline-block p-3 bg-green-900/30 rounded-full mb-3">
                                                        <Zap size={32} className="text-green-400" />
                                                    </div>
                                                    <h4 className="text-white font-medium mb-1">NVIDIA GPU Fan</h4>
                                                    <p className="text-sm text-slate-400">Управляется драйвером автоматически</p>
                                                </div>
                                                <button
                                                    onClick={() => handleAddGpuFan(selectedFan)}
                                                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
                                                >
                                                    Добавить в группу
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 h-full flex flex-col">
                                                <div>
                                                    <h4 className="text-sm text-slate-300 mb-2">Выберите PWM контроллер:</h4>
                                                    <p className="text-xs text-slate-500 mb-3">
                                                        Контроллер для: <span className="text-cyan-400">{selectedFan.chip}</span>
                                                    </p>
                                                </div>

                                                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                    {availablePwms.map(pwm => (
                                                        <div
                                                            key={pwm.path}
                                                            onClick={() => handleLinkToPwm(pwm)}
                                                            className={`p-3 rounded-lg border transition-all hover:bg-cyan-600/10 cursor-pointer ${testingPwm === pwm.path ? 'ring-2 ring-yellow-500' : 'border-slate-700 bg-slate-800'
                                                                }`}
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-medium text-white">{pwm.id}</span>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleTestPwm(pwm, 0); }}
                                                                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
                                                                    >
                                                                        Stop
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleTestPwm(pwm, 255); }}
                                                                        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded"
                                                                    >
                                                                        Max
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {availablePwms.length === 0 && (
                                                        <p className="text-yellow-500 text-sm">Нет свободных PWM на этом чипе</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Linked Pairs */}
                            {linkedPairs.length > 0 && (
                                <div className="mt-6 border-t border-slate-700 pt-4">
                                    <h3 className="text-sm font-medium text-green-400 mb-2">✓ Добавленные вентиляторы</h3>
                                    <div className="space-y-2">
                                        {linkedPairs.map((pair, i) => (
                                            <div key={i} className="flex items-center gap-3 p-3 bg-green-900/20 rounded-lg border border-green-700/50">
                                                <input
                                                    type="text"
                                                    value={pair.name}
                                                    onChange={(e) => {
                                                        const newPairs = [...linkedPairs];
                                                        newPairs[i].name = e.target.value;
                                                        setLinkedPairs(newPairs);
                                                    }}
                                                    className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm w-40"
                                                    placeholder="Имя"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-sm text-slate-300">{pair.fan.name}</span>
                                                    <span className="text-xs text-slate-500">{pair.fan.id}</span>
                                                </div>

                                                {pair.fan.type === 'system' ? (
                                                    <>
                                                        <span className="text-green-400">↔</span>
                                                        <span className="text-slate-400 text-sm font-mono">{pair.pwm?.id}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] bg-cyan-900 text-cyan-300 px-2 rounded ml-2">NVIDIA</span>
                                                )}

                                                <span className="font-mono text-cyan-400 ml-auto">
                                                    {/* We can fetch real-time RPM for added fans? Only if mapped */}
                                                    {pair.fan.rpm} RPM
                                                </span>
                                                <button
                                                    onClick={() => handleUnlink(i)}
                                                    className="text-red-400 hover:text-red-300 text-sm ml-2"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'configure' && (
                        <div className="space-y-6">
                            {/* Group Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    Название группы
                                </label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                                    placeholder="Например: Корпус, CPU, Радиатор..."
                                />
                            </div>

                            {/* Temperature Sources */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    Реагировать на температуры
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {sensors.length === 0 ? (
                                        <p className="text-slate-500 text-sm">Нет доступных датчиков. Добавьте их в настройках.</p>
                                    ) : sensors.map(sensor => (
                                        <button
                                            key={sensor.id}
                                            onClick={() => toggleTempSource(sensor.id)}
                                            className={`px-3 py-2 rounded-lg border transition-all text-sm flex items-center gap-2 ${tempSources.includes(sensor.id)
                                                ? 'bg-cyan-600 border-cyan-500 text-white'
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                                                }`}
                                        >
                                            {tempSources.includes(sensor.id) && <span className="text-cyan-200">✓</span>}
                                            <span>{sensor.name}</span>
                                            <span className="text-xs opacity-60">[{sensor.type}]</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Visual Style Selector */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    Стиль оформления
                                </label>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { id: 'cyan', name: 'System', color: 'bg-blue-600', border: 'border-blue-500', desc: 'Системные / CPU' },
                                        { id: 'green', name: 'Accelerator', color: 'bg-green-600', border: 'border-green-500', desc: 'GPU / Ускорители' },
                                        { id: 'orange', name: 'Storage', color: 'bg-amber-600', border: 'border-amber-500', desc: 'Диски / NAS' }
                                    ].map(style => (
                                        <button
                                            key={style.id}
                                            onClick={() => setVisualStyle(style.id as any)}
                                            className={`p-3 rounded-lg border text-left transition-all ${visualStyle === style.id
                                                ? `${style.color} ${style.border} text-white`
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="font-medium">{style.name}</div>
                                            <div className="text-xs opacity-70 mt-1">{style.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                <h4 className="font-medium text-slate-300 mb-2">Сводка</h4>
                                <ul className="text-sm text-slate-400 space-y-1">
                                    <li>Группа: <span className="text-white">{groupName}</span></li>
                                    <li>Вентиляторов: <span className="text-white">{linkedPairs.length}</span></li>
                                    <li>Триггеры: <span className="text-cyan-400">{tempSources.join(', ').toUpperCase()}</span></li>
                                    <li>Стиль: <span className="capitalize text-white">{visualStyle}</span></li>
                                </ul>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setStep('link')}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
                                >
                                    ← Назад
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={!groupName || tempSources.length === 0}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                                >
                                    {existingGroup ? 'Сохранить изменения' : 'Создать группу'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
