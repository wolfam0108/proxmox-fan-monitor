import React, { useMemo } from 'react';
import { LucideIcon } from 'lucide-react';
import { SensorSourceDetail, ChartDataPoint } from '../types';
import { Sparkline } from './Sparkline';
import { getThemeStyles, mapToThemeColor } from '../theme';

interface SensorCardProps {
    id: string; // Sensor ID for history lookup
    label: string;
    value: number | null;
    unit: string;
    icon: LucideIcon;
    colorClass?: string; // Text color for values (e.g. red if hot)
    variant?: 'system' | 'accelerator' | 'storage'; // Determines accent color (Blue/Green/Orange)
    sources?: SensorSourceDetail[];
    history?: ChartDataPoint[];
    gridCols?: number;
}

const SourceItem: React.FC<{
    source: SensorSourceDetail;
    sensorId: string;
    history?: ChartDataPoint[];
    accentColor: string;
}> = ({ source, sensorId, history, accentColor }) => {
    const isDrive = source.type === 'drive' && source.details;

    // Extract history data for this source
    const sparkData = useMemo(() => {
        if (!history || history.length === 0) return [];

        // We need the last N points
        const points = history.slice(-30).map(entry => { // Last 30 points
            const sensor = entry.sensors?.find(s => s.id === sensorId);
            if (!sensor) return null;

            // Find matching source
            const match = sensor.sources?.find(s => {
                if (source.device && s.device) return s.device === source.device;
                return s.label === source.label;
            });

            return match ? match.value : null;
        });

        // Filter nulls
        return points.filter(p => p !== null && p !== undefined) as number[];
    }, [history, sensorId, source.device, source.label]);

    // Map accent color to text class for sparkline
    const sparkColorClass = useMemo(() => {
        switch (accentColor) {
            case 'green': return 'text-green-500';
            case 'orange': return 'text-orange-500';
            case 'blue': return 'text-blue-500';
            default: return 'text-cyan-500';
        }
    }, [accentColor]);

    if (isDrive && source.details) {
        const d = source.details;
        // Extended Drive View
        return (
            <div className="bg-slate-900/50 rounded-lg p-2 text-xs border border-slate-700/50 h-full relative overflow-hidden group">
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-300">
                                {d.type === 'SSD' ? '[SSD]' : '[HDD]'} {d.interface}
                            </span>
                        </div>
                        <span className={`font-mono font-bold ${source.value && source.value > 50 ? 'text-yellow-400' : 'text-slate-200'}`}>
                            {source.value !== null ? `${source.value}°C` : '—'}
                        </span>
                    </div>

                    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-400">
                        <span>Model:</span> <span className="text-slate-300 truncate">{d.model}</span>
                        <span>SN:</span>    <span className="font-mono text-slate-500 truncate">{d.serial}</span>

                        <div className="col-span-2 flex justify-between mt-1 border-t border-slate-700/50 pt-1">
                            <span>Size: <span className="text-slate-300">{d.size}</span></span>
                            <span>FF: <span className="text-slate-300">{d.form_factor}</span></span>
                        </div>
                    </div>
                </div>

                {/* Sparkline Background for Drives */}
                <div className={`absolute bottom-0 right-0 w-28 h-12 opacity-30 group-hover:opacity-50 transition-opacity pointer-events-none z-0 ${sparkColorClass}`}>
                    <Sparkline data={sparkData} width={100} height={50} strokeWidth={2} />
                </div>
            </div>
        );
    }

    // Compact View (Hwmon / GPU)
    return (
        <div className="bg-slate-900/40 rounded p-1.5 px-2 border border-slate-800 flex justify-between items-center group hover:bg-slate-900/60 transition-colors h-full relative overflow-hidden">
            {/* Sparkline Background */}
            <div className={`absolute bottom-0 left-0 right-0 h-full max-h-[80%] mt-auto opacity-20 group-hover:opacity-40 transition-opacity pointer-events-none z-0 ${sparkColorClass}`}>
                <Sparkline data={sparkData} width={120} height={40} strokeWidth={2} />
            </div>

            <div className="flex flex-col min-w-0 mr-2 relative z-10">
                <span className="text-xs font-medium text-slate-300 truncate" title={source.label}>
                    {source.label}
                </span>
                <span className="text-[10px] text-slate-500 truncate font-mono">
                    {source.chip || source.hwmon || source.device || 'N/A'}
                </span>
            </div>
            <span className={`relative z-10 text-sm font-mono font-bold ${source.value && source.value > 70 ? 'text-yellow-400' : 'text-slate-400'}`}>
                {source.value?.toFixed(0) || '—'}°
            </span>
        </div>
    );
};

export const SensorCard: React.FC<SensorCardProps> = ({
    id,
    label,
    value,
    unit,
    icon: Icon,
    colorClass = "text-slate-200",
    variant = 'system',
    sources = [],
    history,
    gridCols
}) => {
    // Use centralized theme
    const theme = getThemeStyles(variant);
    const accentColor = mapToThemeColor(variant); // 'blue' | 'green' | 'orange' for children props

    const isDriveGroup = sources.some(s => s.type === 'drive');

    // Determine grid columns class
    let gridClass = isDriveGroup ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2';

    if (gridCols) {
        if (gridCols === 1) gridClass = 'grid-cols-1';
        else if (gridCols === 2) gridClass = 'grid-cols-1 md:grid-cols-2';
        else if (gridCols === 3) gridClass = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
        else if (gridCols >= 4) gridClass = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
    } else if (isDriveGroup) {
        gridClass = 'grid-cols-1';
    }

    return (
        <div className={`bg-slate-800 rounded-xl border shadow-sm relative overflow-hidden flex flex-col transition-all duration-300 h-full ${theme.border}`}>
            {/* Header Section */}
            <div className="p-4 pb-2 relative z-10 flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{label}</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-3xl font-bold font-mono ${colorClass}`}>
                            {value !== null ? (Number.isInteger(value) ? value : value.toFixed(1)) : '—'}
                        </span>
                        {unit && <span className="text-slate-500 text-sm font-medium">{unit}</span>}
                    </div>
                </div>

                <div className={`p-2.5 rounded-lg backdrop-blur-sm ${theme.iconBg} ${theme.text}`}>
                    <Icon size={20} className="opacity-90" />
                </div>
            </div>

            {/* Sources List */}
            {sources.length > 0 && (
                <div className="px-3 pb-3 relative z-10 mt-auto flex-1">
                    <div className={`grid gap-2 ${gridClass} h-full content-start`}>
                        {sources.map((s, idx) => (
                            <SourceItem
                                key={`${s.label}-${idx}`}
                                source={s}
                                sensorId={id}
                                history={history}
                                accentColor={accentColor}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
