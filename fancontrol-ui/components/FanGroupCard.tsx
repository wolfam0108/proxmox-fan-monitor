import React, { useState, useEffect } from 'react';
import { LogicState, FanData, TempSource } from '../types';
import { setOverride, fetchConfig } from '../services/apiService';
import { BackgroundChart } from './BackgroundChart';
import { getThemeStyles, mapToThemeColor } from '../theme';

interface FanGroupCardProps {
    groupId: string;
    groupName: string;
    logic: LogicState;
    fans: FanData[];
    type: 'nvidia' | 'system';
    visualStyle?: string;
}

export const FanGroupCard: React.FC<FanGroupCardProps> = ({
    groupId,
    groupName,
    logic,
    fans,
    type
}) => {
    const [loading, setLoading] = useState(false);
    const [pendingManual, setPendingManual] = useState<boolean | null>(null);
    const [pendingMode, setPendingMode] = useState<number | null>(null);
    const [profiles, setProfiles] = useState<Array<{ name: string; target: number }>>([]);
    const [tempSources, setTempSources] = useState<TempSource[]>([]);
    const [visualStyle, setVisualStyle] = useState<string>('system');

    // Fetch profiles for mode selector and visual style
    useEffect(() => {
        fetchConfig().then(config => {
            // Try to find from fan_groups first
            const group = config?.fan_groups?.find((g: any) => g.id === groupId);
            if (group) {
                if (group.profiles) {
                    setProfiles(group.profiles);
                    setTempSources(group.temp_sources || []);
                }
                if (group.visual_style) {
                    setVisualStyle(group.visual_style);
                }
            } else if (type === 'nvidia' && config?.gpu?.profiles) {
                setProfiles(config.gpu.profiles);
                setTempSources(['gpu']);
                setVisualStyle('accelerator');
            } else if (config?.system?.profiles) {
                setProfiles(config.system.profiles);
                setTempSources(['cpu', 'hdd']);
            }
        }).catch(() => { });
    }, [groupId, type]);

    const isManual = logic?.isManual || false;
    const currentMode = parseInt(logic?.mode || '0', 10);
    const target = logic?.target || 0;
    const status = logic?.status || '';

    // Clear loading state when data matches expected state
    useEffect(() => {
        if (pendingManual !== null && isManual === pendingManual) {
            setLoading(false);
            setPendingManual(null);
        }
        if (pendingMode !== null && currentMode === pendingMode) {
            setLoading(false);
            setPendingMode(null);
        }
    }, [isManual, pendingManual, currentMode, pendingMode]);

    const handleToggleMode = async (manual: boolean) => {
        if (loading) return;
        // If already in desired state, do nothing
        if (isManual === manual) return;

        setLoading(true);
        setPendingManual(manual);
        try {
            // Use actual groupId for override
            await setOverride(groupId, manual, String(currentMode));
        } catch (e) {
            console.error('Override error:', e);
            // On error, clear loading state
            setLoading(false);
            setPendingManual(null);
        }
        // Don't setLoading(false) here - wait for data to change via polling
    };

    const handleSetMode = async (mode: number) => {
        if (loading || !isManual) return;
        // If already in desired mode, do nothing
        if (currentMode === mode) return;

        setLoading(true);
        setPendingMode(mode);
        try {
            await setOverride(groupId, true, String(mode));
        } catch (e) {
            console.error('Set mode error:', e);
            // On error, clear loading state
            setLoading(false);
            setPendingMode(null);
        }
        // Don't setLoading(false) here - wait for data to change via polling
    };

    // Theme logic
    const themeKey = mapToThemeColor(visualStyle || (type === 'nvidia' ? 'green' : 'cyan'));
    const theme = getThemeStyles(themeKey);

    return (
        <div className={`bg-slate-900/50 rounded-xl border ${theme.border} overflow-hidden relative`}>
            {/* Background Chart - Fan Speed */}
            <BackgroundChart
                fans={fans}
                accentColor={themeKey}
            />

            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-slate-300 text-sm">Применяется...</span>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className={`${theme.bg} px-4 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                    <h3 className={`font-bold text-lg ${theme.text}`}>
                        {groupName}
                    </h3>
                    <span className="text-slate-400 text-sm">
                        Mode {currentMode} → {typeof target === 'string' ? target : `${target}${type === 'nvidia' ? '%' : ' RPM'}`}
                    </span>
                    {status && (
                        <span className={`text-xs px-2 py-0.5 rounded ${status === 'MANUAL' ? 'bg-yellow-600/30 text-yellow-400' :
                            'bg-slate-700 text-slate-400'
                            }`}>
                            {status}
                        </span>
                    )}
                </div>

                {/* Auto/Manual Toggle */}
                <div className="flex gap-2">
                    <button
                        onClick={() => handleToggleMode(false)}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${!isManual
                            ? `${theme.btn} text-white`
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                            } ${loading ? 'opacity-50' : ''}`}
                    >
                        {loading && !isManual && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        АВТО
                    </button>
                    <button
                        onClick={() => handleToggleMode(true)}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${isManual
                            ? 'bg-yellow-600 text-white'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                            } ${loading ? 'opacity-50' : ''}`}
                    >
                        {loading && isManual && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        РУЧН
                    </button>
                </div>
            </div>

            {/* Manual Mode Selector */}
            {isManual && profiles.length > 0 && (
                <div className="px-4 py-2 bg-yellow-900/20 border-b border-yellow-700/30 flex items-center gap-2 flex-wrap">
                    <span className="text-yellow-400 text-xs">Режим:</span>
                    {profiles.map((p, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleSetMode(idx)}
                            className={`px-2 py-1 rounded text-xs transition-all ${currentMode === idx
                                ? 'bg-yellow-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                        >
                            {p.name || `${p.target}`}
                        </button>
                    ))}
                </div>
            )}

            {/* Fans Table */}
            <div className="p-4 relative z-10">
                {fans.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">Нет вентиляторов в этой группе</p>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-slate-500 text-xs uppercase tracking-wider">
                                <th className="text-left pb-2">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900/90">Вентилятор</span>
                                </th>
                                <th className="text-left pb-2">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900/90">RPM</span>
                                </th>
                                <th className="text-left pb-2">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900/90">Цель</span>
                                </th>
                                <th className="text-left pb-2">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900/90">PWM / %</span>
                                </th>
                                <th className="text-left pb-2">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900/90">Статус</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {fans.map((fan, idx) => (
                                <tr key={fan.id || idx} className="text-slate-200">
                                    <td className="py-2 text-left">
                                        <span className="inline-block px-2 py-0.5 rounded text-sm font-medium bg-slate-800/90 text-slate-200">
                                            {fan.name}
                                        </span>
                                    </td>
                                    <td className="py-2 text-left">
                                        <span className="inline-block px-2 py-0.5 rounded text-sm font-mono bg-cyan-900/90 text-cyan-400">
                                            {fan.rpm}
                                        </span>
                                    </td>
                                    <td className="py-2 text-left">
                                        <span className="inline-block px-2 py-0.5 rounded text-sm font-mono bg-slate-800/90 text-slate-300">
                                            {fan.target}
                                        </span>
                                    </td>
                                    <td className="py-2 text-left">
                                        <span className="inline-block px-2 py-0.5 rounded text-sm font-mono bg-slate-800/90 text-slate-300">
                                            {fan.type === 'GPU' || type === 'nvidia'
                                                ? `${fan.pwmOrPct}%`
                                                : `${fan.pwmOrPct} (${Math.round((fan.pwmOrPct / 255) * 100)}%)`
                                            }
                                        </span>
                                    </td>
                                    <td className="py-2 text-left">
                                        <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${fan.status === 'OK'
                                            ? 'bg-green-900/90 text-green-400'
                                            : 'bg-yellow-900/90 text-yellow-400'
                                            }`}>
                                            {fan.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
