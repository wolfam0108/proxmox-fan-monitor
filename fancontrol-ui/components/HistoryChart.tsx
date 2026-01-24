import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { ChartDataPoint, TimeRange } from '../types';

interface HistoryChartProps {
  data: ChartDataPoint[];
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
}

const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '1m', label: '1 мин' },
  { key: '5m', label: '5 мин' },
  { key: '30m', label: '30 мин' },
  { key: '1h', label: '1 час' },
  { key: '6h', label: '6 час' },
  { key: '1d', label: '1 день' },
  { key: '1w', label: '1 нед' },
  { key: '1mo', label: '1 мес' },
];

const MODE_COLORS = {
  sys: ['#22c55e', '#eab308', '#ef4444'], // Mode 1, 2, 3
  gpu: ['#3b82f6', '#06b6d4', '#22c55e', '#eab308', '#ef4444'], // Mode 0-4
};

export const HistoryChart: React.FC<HistoryChartProps> = ({ data, selectedRange, onRangeChange }) => {
  // Calculate mode background regions
  const getModeRegions = () => {
    if (data.length === 0) return { sys: [], gpu: [] };

    const sysRegions: { start: number; end: number; mode: number }[] = [];
    const gpuRegions: { start: number; end: number; mode: number }[] = [];

    let lastSysMode = data[0]?.sysMode || 1;
    let lastGpuMode = data[0]?.gpuMode || 0;
    let sysStart = 0;
    let gpuStart = 0;

    data.forEach((d, i) => {
      if (d.sysMode !== lastSysMode) {
        sysRegions.push({ start: sysStart, end: i, mode: lastSysMode });
        sysStart = i;
        lastSysMode = d.sysMode;
      }
      if (d.gpuMode !== lastGpuMode) {
        gpuRegions.push({ start: gpuStart, end: i, mode: lastGpuMode });
        gpuStart = i;
        lastGpuMode = d.gpuMode;
      }
    });

    // Add final regions
    sysRegions.push({ start: sysStart, end: data.length - 1, mode: lastSysMode });
    gpuRegions.push({ start: gpuStart, end: data.length - 1, mode: lastGpuMode });

    return { sys: sysRegions, gpu: gpuRegions };
  };

  return (
    <div className="space-y-4">
      {/* Time Range Selector */}
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onRangeChange(opt.key)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${selectedRange === opt.key
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mode Indicators */}
      <div className="flex gap-6 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Система:</span>
          <span className="text-slate-300">Режим {data[data.length - 1]?.sysMode || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">GPU:</span>
          <span className="text-slate-300">Режим {data[data.length - 1]?.gpuMode || '-'}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis
              dataKey="time"
              stroke="#94a3b8"
              fontSize={11}
              tickMargin={10}
              tick={{ fill: '#94a3b8' }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="temp"
              stroke="#94a3b8"
              fontSize={12}
              tick={{ fill: '#94a3b8' }}
              domain={[20, 'auto']}
              label={{ value: '°C', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="mode"
              orientation="right"
              stroke="#64748b"
              fontSize={11}
              tick={{ fill: '#64748b' }}
              domain={[0, 4]}
              label={{ value: 'Режим', angle: 90, position: 'insideRight', fill: '#64748b' }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />

            {/* Temperature Lines */}
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="cpu"
              name="CPU"
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="gpu"
              name="GPU"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="hdd"
              name="HDD"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />

            {/* Mode Lines */}
            <Line
              yAxisId="mode"
              type="stepAfter"
              dataKey="sysMode"
              name="Система"
              stroke="#a855f7"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
            <Line
              yAxisId="mode"
              type="stepAfter"
              dataKey="gpuMode"
              name="GPU режим"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};