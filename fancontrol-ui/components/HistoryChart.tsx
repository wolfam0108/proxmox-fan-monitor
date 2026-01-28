import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ChartDataPoint, TimeRange } from '../types';
import { CHART_COLORS } from '../theme';

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

const getColor = (str: string, offset = 0) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash + offset) % CHART_COLORS.length;
  return CHART_COLORS[index];
};

export const HistoryChart: React.FC<HistoryChartProps> = ({ data, selectedRange, onRangeChange }) => {

  // Flatten data for Recharts and extract dynamic keys
  const { chartData, sensorKeys, logicKeys } = useMemo(() => {
    const sKeys = new Set<string>();
    const lKeys = new Set<string>(); // { id: string, name: string } ideally, but just ID for now

    const flattened = data.map(d => {
      const flat: any = { time: d.time };

      // Flatten Sensors
      if (d.sensors && d.sensors.length > 0) {
        d.sensors.forEach(s => {
          flat[`sensor_${s.id}`] = s.value;
          sKeys.add(s.id);
        });
      } else {
        // Legacy Fallback
        if (d.cpu) { flat['sensor_cpu'] = d.cpu; sKeys.add('cpu'); }
        if (d.gpu) { flat['sensor_gpu'] = d.gpu; sKeys.add('gpu'); }
      }

      // Flatten Logic Modes
      if (d.logic) {
        Object.entries(d.logic).forEach(([k, v]: [string, any]) => {
          // v is LogicState object { mode, ... }
          flat[`mode_${k}`] = v?.mode !== undefined ? v.mode : v;
          lKeys.add(k);
        });
      } else {
        // Legacy fallback
        if (d.sysMode !== undefined) { flat['mode_sys'] = d.sysMode; lKeys.add('sys'); }
        if (d.gpuMode !== undefined) { flat['mode_gpu'] = d.gpuMode; lKeys.add('gpu'); }
      }

      return flat;
    });

    return {
      chartData: flattened,
      sensorKeys: Array.from(sKeys),
      logicKeys: Array.from(lKeys)
    };
  }, [data]);

  const hasData = sensorKeys.length > 0 || logicKeys.length > 0;

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

      {/* Chart */}
      <div className="h-[350px] w-full relative">
        {!hasData ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/20 rounded-lg border border-slate-800 border-dashed">
            <div className="text-4xl mb-2">📉</div>
            <p className="text-lg font-medium">Нет доступных метрик</p>
            <p className="text-sm">Нет данных для построения графика</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
                domain={['auto', 'auto']}
                label={{ value: '°C', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
              />
              {logicKeys.length > 0 && (
                <YAxis
                  yAxisId="mode"
                  orientation="right"
                  stroke="#64748b"
                  fontSize={11}
                  tick={{ fill: '#64748b' }}
                  domain={[0, 4]} // Assuming modes 0-4
                  allowDecimals={false}
                  label={{ value: 'Режим', angle: 90, position: 'insideRight', fill: '#64748b' }}
                />
              )}
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                itemStyle={{ color: '#e2e8f0' }}
                labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />

              {/* Render Sensor Lines */}
              {sensorKeys.map((key, idx) => (
                <Line
                  key={`sensor-${key}`}
                  yAxisId="temp"
                  type="monotone"
                  dataKey={`sensor_${key}`}
                  name={key.toUpperCase()}
                  stroke={getColor(key)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}

              {/* Render Mode Lines */}
              {logicKeys.map((key, idx) => (
                <Line
                  key={`mode-${key}`}
                  yAxisId="mode"
                  type="stepAfter"
                  dataKey={`mode_${key}`}
                  name={`${key.toUpperCase()} Режим`}
                  stroke={getColor(key, 5)} // Offset color to distinct from temp
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};