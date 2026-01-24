import React, { useState } from 'react';
import { LogicState } from '../types';
import { setOverride } from '../services/apiService';

interface LogicCardProps {
  title: string;
  data: LogicState;
  type: 'SYS' | 'GPU';
}

const SYS_MODES = ['1', '2', '3'];
const GPU_MODES = ['0', '1', '2', '3', '4'];

const Spinner = () => (
  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
);

export const LogicCard: React.FC<LogicCardProps> = ({ title, data, type }) => {
  const [loading, setLoading] = useState(false);

  const modes = type === 'SYS' ? SYS_MODES : GPU_MODES;
  const overrideType = type === 'SYS' ? 'system' : 'gpu';
  const isManual = data.isManual || false;

  // Determine status color and label
  let statusColor = "text-green-400";
  let statusLabel = data.status;

  if (data.status === "Stable") statusLabel = "Стабильно";
  if (data.status === "Init") statusLabel = "Инициализация";
  if (data.status === "MANUAL") { statusLabel = "РУЧНОЙ"; statusColor = "text-purple-400"; }
  if (data.status.includes("Pending")) { statusLabel = data.status.replace("Pending", "Ожидание"); statusColor = "text-yellow-400"; }
  if (data.status.includes("Escalated")) { statusLabel = "Повышен"; statusColor = "text-orange-400"; }
  if (data.status.includes("Locked")) { statusLabel = data.status.replace("Locked", "Блокировка"); statusColor = "text-blue-400"; }

  const handleToggle = async () => {
    setLoading(true);
    await setOverride(overrideType, !isManual, data.mode, true);
    setTimeout(() => setLoading(false), 500);
  };

  const handleModeChange = async (mode: string) => {
    if (!isManual || loading) return;
    setLoading(true);
    await setOverride(overrideType, true, mode, true);
    setTimeout(() => setLoading(false), 500);
  };

  const titleRu = type === 'SYS' ? 'Система' : 'GPU';

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col justify-between relative overflow-hidden">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center" style={{ zIndex: 50 }}>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-cyan-400 text-sm">Применение...</span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-400 font-semibold text-sm uppercase tracking-wider">{titleRu}</h3>

          {/* Auto/Manual Toggle */}
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-2 ${isManual
                ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-500/20'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              } ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? <Spinner /> : null}
            {isManual ? 'РУЧНОЙ' : 'АВТО'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-white">Режим {data.mode}</span>
          <span className="px-2 py-1 rounded text-xs font-mono bg-slate-700 text-slate-300 border border-slate-600">
            Цель: {data.target}
          </span>
        </div>

        {/* Mode Selection Buttons (visible when manual) */}
        {isManual && (
          <div className="mt-4 flex gap-2">
            {modes.map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                disabled={loading}
                className={`flex-1 py-2 rounded text-sm font-medium transition-all ${data.mode === mode
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  } ${loading ? 'opacity-50 cursor-wait' : ''}`}
              >
                {mode === '0' ? 'Авто' : `Р${mode}`}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColor.replace('text', 'bg')} ${data.status === 'MANUAL' ? 'animate-pulse' : ''}`}></div>
          <span className={`font-mono text-sm ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
};