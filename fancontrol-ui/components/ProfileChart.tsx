import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { FanProfile } from '../types';
import { CHART_COLORS as COLORS } from '../theme';

interface ProfileChartProps {
    profiles: FanProfile[];
    tempSources: string[];
}

interface ChartDataPoint {
    source: string;
    temp: number;
    target: number;
}

export const ProfileChart: React.FC<ProfileChartProps> = ({ profiles, tempSources }) => {
    // Guard against undefined/null profiles
    const safeProfiles = profiles || [];
    const sources = tempSources && tempSources.length > 0 ? tempSources : [];

    if (safeProfiles.length === 0 || sources.length === 0) {
        return (
            <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">
                Нет профилей или источников для отображения
            </div>
        );
    }

    // Collect all unique temperature points from all profiles and all sources
    const allTemps = new Set<number>();
    allTemps.add(0); // Always include 0

    const sourceDataMap: Record<string, ChartDataPoint[]> = {};

    sources.forEach(source => {
        sourceDataMap[source] = [];
    });

    safeProfiles.forEach(profile => {
        sources.forEach(source => {
            const thresh = profile.thresholds[source];
            if (thresh !== null && thresh !== undefined) {
                allTemps.add(thresh);
                sourceDataMap[source].push({
                    source,
                    temp: thresh,
                    target: profile.target
                });
            }
        });
    });

    // Create sorted unique temps array
    const sortedTemps = Array.from(allTemps).sort((a, b) => a - b);

    // Sort profiles by target for base value logic
    const sortedProfiles = [...safeProfiles].sort((a, b) => a.target - b.target);
    const baseTarget = sortedProfiles[0]?.target || 0;

    // Create chart data: array of objects { temp, source1: val, source2: val ... }
    const chartData = sortedTemps.map(temp => {
        const point: any = { temp };

        sources.forEach(source => {
            // Find explicit point for this source at this temp
            const explicit = sourceDataMap[source].find(p => p.temp === temp);

            if (explicit) {
                point[source] = explicit.target;
            } else if (temp === 0) {
                // If temp is 0 and no explicit point, assume base target
                point[source] = baseTarget;
            } else {
                // Otherwise it's null (gap)
                point[source] = null;
            }
        });

        return point;
    });

    // Calculate domain
    const allTargets = safeProfiles.map(p => p.target);
    const maxTarget = Math.max(...allTargets, 100);
    const minTarget = Math.min(...allTargets, 0);
    const maxTemp = Math.max(...sortedTemps, 80);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-300">График профилей</h4>
                <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
                    {sources.map((source, index) => (
                        <span key={source} className="flex items-center gap-1">
                            <span
                                className="w-3 h-0.5"
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            ></span>
                            <span className="text-slate-400 capitalize">{source}</span>
                        </span>
                    ))}
                </div>
            </div>

            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis
                            dataKey="temp"
                            stroke="#94a3b8"
                            fontSize={11}
                            tick={{ fill: '#94a3b8' }}
                            label={{ value: '°C', position: 'insideBottomRight', offset: -5, fill: '#94a3b8' }}
                            domain={[0, maxTemp + 10]}
                            type="number"
                        />
                        <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            tick={{ fill: '#94a3b8' }}
                            label={{
                                value: 'Target',
                                angle: -90,
                                position: 'insideLeft',
                                fill: '#94a3b8',
                            }}
                            domain={[Math.max(0, minTarget - 100), maxTarget + 100]}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                borderColor: '#334155',
                                color: '#f1f5f9',
                            }}
                            labelFormatter={(value) => `${value}°C`}
                            formatter={(value: number, name: string) => [
                                `${value}`,
                                name.toUpperCase(),
                            ]}
                        />

                        {sources.map((source, index) => (
                            <Line
                                key={source}
                                type="linear"
                                dataKey={source}
                                name={source}
                                stroke={COLORS[index % COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 4, fill: COLORS[index % COLORS.length] }}
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="text-xs text-slate-500 text-center">
                Ось X: температура срабатывания • Ось Y: целевая скорость/мощность
            </div>
        </div>
    );
};
